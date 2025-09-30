import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
// Ensure we load env from both root and cms/.env (for Studio-local flags)
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })
import crypto from 'node:crypto'
import { RssProvider } from '../lib/integrations/feeds/rss'
import { TaggedRssProvider } from '../lib/integrations/feeds/tagged-rss'
import { AtpRssProvider } from '../lib/integrations/feeds/atp-rss'
import { WtaNewsProvider } from '../lib/integrations/feeds/wta-news'
import { prisma } from '../lib/prisma'
import { serverClient } from '../lib/sanity'
import type { FeedProvider, NormalizedItem } from '../lib/integrations/feeds'
import { preserveNumbersInHtml, htmlToPlainText } from '../lib/integrations/util/number-preserver'

function hashUrl(url: string) {
  return crypto.createHash('sha256').update(url).digest('hex')
}

async function upsertSource(name: string, feedUrl: string) {
  const id = `source-${hashUrl(feedUrl).slice(0, 12)}`
  await serverClient.createIfNotExists({
    _id: id,
    _type: 'source',
    name,
    url: feedUrl,
    feedUrl,
  })
  return id
}

function toBlocks(text: string) {
  const blocks = [] as any[]
  const newKey = () => crypto.randomBytes(8).toString('hex')
  for (const para of text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)) {
    blocks.push({
      _type: 'block',
      style: 'normal',
      markDefs: [],
      _key: newKey(),
      children: [{ _type: 'span', text: para, marks: [], _key: newKey() }],
    })
  }
  return blocks
}

function composeBodyBlocks(item: NormalizedItem) {
  const writeBodyMode = (process.env.INGEST_WRITE_BODY || 'none').toLowerCase() // 'none' | 'summary' | 'full'
  const maxChars = Math.max(0, parseInt(process.env.INGEST_BODY_MAX_CHARS || '1200', 10))
  if ((writeBodyMode === 'summary' || writeBodyMode === 'full') && item.bodyText) {
    const sourceLine = `Read more: ${item.url}`
    const disclaimer = 'Summary based on external source. Always credit and respect the canonical link.'
    const baseText = writeBodyMode === 'full' ? item.bodyText : item.bodyText.slice(0, maxChars)
    const composed = [disclaimer, '', baseText, '', sourceLine].join('\n')
    return toBlocks(composed)
  }
  return undefined
}

async function createDraftFromItem(item: NormalizedItem, sourceId: string) {
  const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64)
  const body = composeBodyBlocks(item)
  const fixedHtml = item.bodyHtml ? preserveNumbersInHtml(item.bodyHtml) : undefined
  const excerptMax = Math.max(0, parseInt(process.env.INGEST_EXCERPT_MAX_CHARS || '300', 10))
  // Upsert tags (simple name->slug mapping) and build reference array
  let tagRefs: any[] | undefined
  if (item.tags && item.tags.length) {
    tagRefs = []
    for (const tagNameRaw of item.tags) {
      const tagName = tagNameRaw.trim()
      if (!tagName) continue
      const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
      const tagId = `tag-${tagSlug}`
      await serverClient.createIfNotExists({ _id: tagId, _type: 'tag', name: tagName, slug: { current: tagSlug } })
      tagRefs.push({ _type: 'reference', _ref: tagId })
    }
  }
  const doc = {
    _type: 'article',
    title: item.title,
    slug: { current: `${slug}-${hashUrl(item.url).slice(0, 6)}` },
    excerpt: item.excerpt ? item.excerpt.slice(0, excerptMax) : undefined,
    canonicalUrl: item.url,
    source: { _type: 'reference', _ref: sourceId },
    status: 'draft',
    publishedAt: item.publishedAt || new Date().toISOString(),
    authors: item.authors || undefined,
  timestampText: item.timestampText || undefined,
    ...(tagRefs && tagRefs.length ? { tags: tagRefs } : {}),
    ...(body ? { body } : {}),
    // Always include externalHtml if available, regardless of INGEST_WRITE_BODY setting
    ...(fixedHtml ? { externalHtml: fixedHtml } : {}),
    ...(process.env.INGEST_WRITE_BODY === 'full'
      ? { leadImageUrl: item.image || undefined, mediaCredits: item.credits || undefined }
      : {}),
  }
  const created = await serverClient.createIfNotExists({ ...doc, _id: `drafts.${hashUrl(item.url).slice(0, 24)}` })
  return created
}

async function updateDraftFromItem(item: NormalizedItem, sourceId: string) {
  const draftId = `drafts.${hashUrl(item.url).slice(0, 24)}`
  // Ensure doc exists minimally, then patch
  const safeSlug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64)
  const excerptMax = Math.max(0, parseInt(process.env.INGEST_EXCERPT_MAX_CHARS || '300', 10))
  await serverClient.createIfNotExists({
    _id: draftId,
    _type: 'article',
    title: item.title,
    slug: { current: `${safeSlug}-${hashUrl(item.url).slice(0, 6)}` },
    canonicalUrl: item.url,
    source: { _type: 'reference', _ref: sourceId },
    status: 'draft',
    publishedAt: item.publishedAt || new Date().toISOString(),
  })
  const patch: any = {
    title: item.title,
    excerpt: item.excerpt ? item.excerpt.slice(0, excerptMax) : null,
    source: { _type: 'reference', _ref: sourceId },
    authors: item.authors || null,
    timestampText: item.timestampText || null,
    // Do not change slug/canonicalUrl on refresh
  }
  if (item.tags && item.tags.length) {
    const tagRefs: any[] = []
    for (const tagNameRaw of item.tags) {
      const tagName = tagNameRaw.trim()
      if (!tagName) continue
      const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
      const tagId = `tag-${tagSlug}`
      await serverClient.createIfNotExists({ _id: tagId, _type: 'tag', name: tagName, slug: { current: tagSlug } })
      tagRefs.push({ _type: 'reference', _ref: tagId })
    }
    patch.tags = tagRefs.length ? tagRefs : null
  }
  const body = composeBodyBlocks(item)
  if (body) patch.body = body
  // Always update externalHtml if available
  if (item.bodyHtml) {
    patch.externalHtml = preserveNumbersInHtml(item.bodyHtml)
  }
  if (process.env.INGEST_WRITE_BODY === 'full') {
    patch.leadImageUrl = item.image || null
    patch.mediaCredits = item.credits || null
  }
  await serverClient.patch(draftId).set(patch).commit()
}

export type FeedConfig = { type: 'rss' | 'rss-tags' | 'atp-rss' | 'wta-news'; name: string; url: string }

export type FeedIngestReport = {
  feed: FeedConfig
  items: number
  created: number
  refreshed: number
  skipped: number
}

export type IngestSummary = {
  reports: FeedIngestReport[]
  totals: { created: number; refreshed: number; skipped: number }
}

// Built-in presets (expandable) – domains must respect ToS/robots
export const FEED_PRESETS: Record<string, FeedConfig> = {
  espn: { type: 'rss', name: 'ESPN Tennis', url: 'https://www.espn.com/espn/rss/tennis/news' },
  atp: { type: 'atp-rss', name: 'ATP Tour', url: 'https://www.atptour.com/en/media/rss-feed/xml-feed' },
  // Placeholder for future WTA (confirm official feed + terms before enabling)
  wta: { type: 'wta-news', name: 'WTA Tennis', url: 'https://www.wtatennis.com/news' },
}

function parseArgFlags(argv: string[]) {
  const out: { presets: string[]; legacy: boolean; help: boolean; list: boolean } = {
    presets: [],
    legacy: false,
    help: false,
    list: false,
  }
  for (const arg of argv.slice(2)) {
    if (/^ingest:/i.test(arg)) {
      out.presets.push(arg.split(':')[1].toLowerCase())
    } else if (arg === '--legacy-env') out.legacy = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--list' || arg === '-l') out.list = true
  }
  return out
}

export function feedsFromPresets(presets: string[]): FeedConfig[] {
  const feeds: FeedConfig[] = []
  for (const key of presets) {
    const preset = FEED_PRESETS[key]
    if (!preset) {
      console.warn(`[warn] Unknown preset '${key}', skipping.`)
      continue
    }
    feeds.push(preset)
  }
  return feeds
}

function loadFeeds(): FeedConfig[] {
  const flags = parseArgFlags(process.argv)
  if (flags.help) {
    console.log(`Usage: npm run ingest -- [options] [ingest:espn] [ingest:atp] [...]

Options:
  --list, -l        List built-in feed presets
  --legacy-env      Use legacy env-based FEEDS/FEED_NAME/FEED_URL loading
  --help, -h        Show this help

Presets:
  ${Object.keys(FEED_PRESETS).sort().join(', ')}

Examples:
  npm run ingest -- ingest:espn
  npm run ingest -- ingest:atp
  npm run ingest -- ingest:espn ingest:atp
  npm run ingest -- --legacy-env
`)
    process.exit(0)
  }
  if (flags.list) {
    console.log('Available presets:')
    for (const key of Object.keys(FEED_PRESETS).sort()) {
      const p = FEED_PRESETS[key]
      console.log(` - ${key}\t${p.type}\t${p.url}`)
    }
    process.exit(0)
  }
  if (flags.legacy) {
    // Backward-compatible path
    const list = process.env.FEEDS || ''
    const singleName = process.env.FEED_NAME
    const singleUrl = process.env.FEED_URL
    const feeds: FeedConfig[] = []
    if (list) {
      for (const raw of list.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [name, typeOrUrl, maybeUrl] = raw.split('|')
        const typeRaw = (maybeUrl ? typeOrUrl : 'rss').toLowerCase()
  const type = (['rss', 'rss-tags', 'atp-rss', 'wta-news'].includes(typeRaw) ? typeRaw : 'rss') as FeedConfig['type']
        const url = maybeUrl || typeOrUrl
        if (!name || !url) continue
        feeds.push({ type, name, url })
      }
      return feeds
    } else if (singleName && singleUrl) {
      return [{ type: 'rss', name: singleName, url: singleUrl }]
    }
    return [FEED_PRESETS.espn]
  }
  const chosen = flags.presets.length ? flags.presets : Object.keys(FEED_PRESETS)
  const feeds = feedsFromPresets(chosen)
  if (!feeds.length) feeds.push(FEED_PRESETS.espn)
  return feeds
}

function providerFor(config: FeedConfig): FeedProvider {
  switch (config.type) {
    case 'rss-tags':
      return new TaggedRssProvider(config.name, config.url)
    case 'atp-rss':
      return new AtpRssProvider(config.name, config.url)
    case 'wta-news':
      return new WtaNewsProvider(config.name, config.url)
    case 'rss':
    default:
      return new RssProvider(config.name, config.url)
  }
}

async function processItem(it: NormalizedItem, sourceKey: string, sourceId: string) {
  // Cross-domain number preservation: ensure digits never get lost before persisting
  if (it.bodyHtml) {
    const fixed = preserveNumbersInHtml(it.bodyHtml)
    it.bodyHtml = fixed
    if (!it.bodyText || it.bodyText.length < 16) {
      it.bodyText = htmlToPlainText(fixed)
    }
  } else if (it.bodyText) {
    // If we only have plain text, keep it as-is; nothing to repair structurally
  }
  const idHash = hashUrl(it.url)
  const already = await prisma.ingestedItem.findFirst({ where: { sourceKey, externalId: idHash } })
  if (already) {
    if (process.env.INGEST_REFRESH === 'true') {
      // Update ledger and Sanity draft
      await prisma.ingestedItem.update({
        where: { id: already.id },
        data: { raw: it as any, normalized: it as any, status: 'refreshed' },
      })
      await updateDraftFromItem(it, sourceId)
      return { refreshed: true }
    }
    return { skipped: true }
  }
  await prisma.ingestedItem.create({
    data: {
      sourceKey,
      externalId: idHash,
      raw: it as any,
      normalized: it as any,
      status: 'new',
    },
  })
  await createDraftFromItem(it, sourceId)
  return { skipped: false }
}

export async function ingestFeeds(feeds: FeedConfig[], options?: { logger?: Console }): Promise<IngestSummary> {
  const logger = options?.logger ?? console
  let totalCreated = 0
  let totalSkipped = 0
  let totalRefreshed = 0
  const reports: FeedIngestReport[] = []
  for (const cfg of feeds) {
    const provider = providerFor(cfg)
    const SOURCE_KEY = `${cfg.type}:${cfg.url}`
    const items = await provider.fetchNewItems()
    if (!items.length) {
      logger.log(`[${cfg.name}] No items found`)
      reports.push({ feed: cfg, items: 0, created: 0, refreshed: 0, skipped: 0 })
      continue
    }
    const sourceId = await upsertSource(cfg.name, cfg.url)
    let created = 0
    let refreshed = 0
    let skipped = 0
  for (const it of items) {
      if (process.env.INGEST_DEBUG === 'true') {
        const why: string[] = []
        if (!it.bodyText) why.push('no bodyText')
        if (!it.bodyHtml) why.push('no bodyHtml')
        if (!it.images || !it.images.length) why.push('no images')
        if (!it.videos || !it.videos.length) why.push('no videos')
        logger.log('[debug:item]', it.title, it.url, {
          hasBodyText: !!it.bodyText,
          hasBodyHtml: !!it.bodyHtml,
          images: it.images?.length || 0,
          videos: it.videos?.length || 0,
          why: why.join(', ') || 'ok',
        })
      }
      const res = await processItem(it, SOURCE_KEY, sourceId)
      if ((res as any).refreshed) {
        refreshed++
        totalRefreshed++
      } else if (res.skipped) {
        skipped++
        totalSkipped++
      } else {
        created++
        totalCreated++
      }
    }
    logger.log(`[${cfg.name}] processed=${items.length} created=${created} refreshed=${refreshed} skipped=${skipped}`)
    reports.push({ feed: cfg, items: items.length, created, refreshed, skipped })
  }
  logger.log(`Ingestion complete. created=${totalCreated} refreshed=${totalRefreshed} skipped=${totalSkipped}`)
  return { reports, totals: { created: totalCreated, refreshed: totalRefreshed, skipped: totalSkipped } }
}

async function main() {
  const feeds = loadFeeds()
  await ingestFeeds(feeds)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
