import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import pLimit from 'p-limit'
import { serverClient } from '../lib/sanity'
import { OpenAIPipeline } from '../lib/integrations/ai/openai'
import { resolveVariantTargetCount } from '../lib/integrations/ai'
import { buildPromptArtifacts } from '../lib/integrations/ai/prompt-context'
import crypto from 'node:crypto'

// Load env from root and cms if present
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

interface ArticleLite {
  _id: string
  title: string
  excerpt?: string
  body?: any
  externalHtml?: string
  source?: { name?: string }
  canonicalUrl?: string
  leadImageUrl?: string
}

async function fetchById(id: string): Promise<ArticleLite | null> {
  const q = `*[_id==$id][0]{ _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name} }`
  return await serverClient.fetch(q, { id })
}

async function fetchBySlug(slug: string): Promise<ArticleLite | null> {
  const q = `*[_type=='article' && slug.current==$slug][0]{ _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name} }`
  return await serverClient.fetch(q, { slug })
}

async function fetchTargets(limit?: number): Promise<ArticleLite[]> {
  const q = `*[_type=="article" && (!defined(aiFinal.body) || aiFinal.body == "")][0...$lim]{
    _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name}
  }`
  const items: ArticleLite[] = await serverClient.fetch(q, { lim: limit || 200 })
  return items
}

async function runPipelineOnArticle(doc: ArticleLite, ai: OpenAIPipeline) {
  const title = doc.title
  const excerpt = doc.excerpt
  const artifacts = buildPromptArtifacts({
    body: doc.body,
    externalHtml: doc.externalHtml,
    canonicalUrl: doc.canonicalUrl,
    leadImageUrl: doc.leadImageUrl,
  })
  const bodyText = artifacts.bodyText
  const context = [doc.source?.name ? `Source: ${doc.source.name}` : null, doc.canonicalUrl ? `URL: ${doc.canonicalUrl}` : null]
    .filter(Boolean)
    .join(' | ')
  const desiredVariantCount = resolveVariantTargetCount(doc.source?.name)
  console.log(`[AI] Variants target for ${doc.source?.name || 'unknown source'}: ${desiredVariantCount}`)
  const rawVariants = await ai.generateVariants({
    title,
    excerpt,
    bodyText,
    context,
    linkReferences: artifacts.linkReferences,
    mediaReferences: artifacts.mediaReferences,
  }, desiredVariantCount)
  const finalDraft = await ai.synthesizeFinal(rawVariants, {
    title,
    excerpt,
    bodyText,
    context,
    linkReferences: artifacts.linkReferences,
    mediaReferences: artifacts.mediaReferences,
  })
  const variants = ai.finalizeDrafts(rawVariants, {
    linkReferences: artifacts.linkReferences,
    mediaReferences: artifacts.mediaReferences,
  })
  const patch: any = {
    aiVariants: variants.map((v) => ({ _key: crypto.randomBytes(8).toString('hex'), ...v })),
    aiFinal: { ...finalDraft, provider: ai.name, model: process.env.AI_MODEL || 'gpt-4o-mini', createdAt: new Date().toISOString() },
    status: 'review',
  }
  await serverClient.patch(doc._id).set(patch).commit()
}

export type BackfillSummary = {
  total: number
  processed: number
  failures: number
  durationMs: number
}

export type BackfillOptions = {
  limit?: number
  concurrency?: number
  dryRun?: boolean
  apiKey?: string
  logger?: Console
}

export async function backfillMissingAIDrafts(options: BackfillOptions = {}): Promise<BackfillSummary> {
  const started = Date.now()
  const logger = options.logger ?? console
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY missing')
  }
  const limit = options.limit
  const concurrency = Math.max(1, options.concurrency ?? 1)
  const ai = new OpenAIPipeline(apiKey)
  const targets = await fetchTargets(limit)
  const total = targets.length
  logger.log(`[AI] Backfill targets: ${total}`)
  if (!total) {
    return { total, processed: 0, failures: 0, durationMs: Date.now() - started }
  }
  if (options.dryRun) {
    targets.forEach((t) => logger.log('[AI] Would process:', t._id, t.title))
    return { total, processed: 0, failures: 0, durationMs: Date.now() - started }
  }
  let processed = 0
  let failures = 0
  const limiter = pLimit(concurrency)
  const tasks = targets.map((doc) =>
    limiter(async () => {
      const label = `${doc._id}`
      try {
        logger.log(`[AI] Generating -> ${label} :: ${doc.title}`)
        await runPipelineOnArticle(doc, ai)
        processed++
        logger.log(`[AI] Done (${processed}/${total}) ${label}`)
      } catch (e: any) {
        failures++
        logger.error(`[AI] Failed ${label}:`, e?.message || e)
      }
    })
  )
  await Promise.all(tasks)
  const durationMs = Date.now() - started
  logger.log(`Backfill complete. processed=${processed} failures=${failures} elapsed=${(durationMs / 1000).toFixed(1)}s`)
  return { total, processed, failures, durationMs }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('OPENAI_API_KEY missing')
    process.exit(1)
  }
  const idArg = process.argv.find((a) => a.startsWith('--id='))
  const slugArg = process.argv.find((a) => a.startsWith('--slug='))
  const idFragArg = process.argv.find((a) => a.startsWith('--id-frag='))
  const idEnvFlag = process.argv.includes('--id-env')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const concArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const dryRun = process.argv.includes('--dry-run')
  const max = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
  const concurrency = concArg ? Math.max(1, parseInt(concArg.split('=')[1], 10)) : 1

  const ai = new OpenAIPipeline(apiKey)

  // Single doc mode by id or slug
  if (idArg || slugArg || idFragArg || idEnvFlag) {
    const dryRun = process.argv.includes('--dry-run')
    let id = idArg ? idArg.split('=')[1] : undefined
    if (!id && idFragArg) {
      const frag = idFragArg.split('=')[1]
      if (frag) id = `article;${frag}`
    }
    if (!id && idEnvFlag) {
      id = process.env.AI_TARGET_ID
    }
    const slug = slugArg ? slugArg.split('=')[1] : undefined
    let doc: ArticleLite | null = null
    if (id) doc = await fetchById(id)
    else if (slug) doc = await fetchBySlug(slug)
    if (!doc) {
      console.error('No article found for', id ? `id=${id}` : `slug=${slug}`)
      return
    }
    if (dryRun) {
      console.log('[AI] Would process:', doc._id, doc.title)
      return
    }
    console.log('[AI] Generating ->', doc._id, '::', doc.title)
    await runPipelineOnArticle(doc, ai)
    console.log('[AI] Done (single)')
    return
  }

  await backfillMissingAIDrafts({ apiKey, limit: max, concurrency, dryRun })
}

main().catch((e) => { console.error(e); process.exit(1) })
