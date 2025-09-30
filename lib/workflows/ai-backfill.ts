import crypto from 'node:crypto'
import { serverClient } from '../sanity'
import { OpenAIPipeline } from '../integrations/ai/openai'
import { resolveVariantTargetCount } from '../integrations/ai'
import { buildPromptArtifacts } from '../integrations/ai/prompt-context'
import { createLimiter } from '../utils/concurrency'

export interface ArticleLite {
  _id: string
  title: string
  excerpt?: string
  body?: any
  externalHtml?: string
  canonicalUrl?: string
  leadImageUrl?: string
  source?: { name?: string }
}

export async function fetchById(id: string): Promise<ArticleLite | null> {
  const q = `*[_id==$id][0]{ _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name} }`
  return await serverClient.fetch(q, { id })
}

export async function fetchBySlug(slug: string): Promise<ArticleLite | null> {
  const q = `*[_type=='article' && slug.current==$slug][0]{ _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name} }`
  return await serverClient.fetch(q, { slug })
}

export async function fetchTargets(limit?: number): Promise<ArticleLite[]> {
  const q = `*[_type=="article" && (!defined(aiFinal.body) || aiFinal.body == "")][0...$lim]{
    _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name}
  }`
  const items: ArticleLite[] = await serverClient.fetch(q, { lim: limit || 200 })
  return items
}

export function createPipeline(apiKey: string) {
  return new OpenAIPipeline(apiKey)
}

export async function runPipelineOnArticle(doc: ArticleLite, ai: OpenAIPipeline, logger: Console = console) {
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
  logger.log(`[AI] Variants target for ${doc.source?.name || 'unknown source'}: ${desiredVariantCount}`)
  const rawVariants = await ai.generateVariants(
    {
      title,
      excerpt,
      bodyText,
      context,
      linkReferences: artifacts.linkReferences,
      mediaReferences: artifacts.mediaReferences,
    },
    desiredVariantCount
  )
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
    aiFinal: {
      ...finalDraft,
      provider: ai.name,
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      createdAt: new Date().toISOString(),
    },
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
  if (!apiKey) throw new Error('OPENAI_API_KEY missing')
  const limit = options.limit
  const concurrency = Math.max(1, options.concurrency ?? 1)
  const ai = createPipeline(apiKey)
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
  const limiter = createLimiter(concurrency)
  const tasks = targets.map((doc) =>
    limiter(async () => {
      const label = `${doc._id}`
      try {
        logger.log(`[AI] Generating -> ${label} :: ${doc.title}`)
        await runPipelineOnArticle(doc, ai, logger)
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
