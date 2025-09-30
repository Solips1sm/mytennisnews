import crypto from 'node:crypto'
import { serverClient } from '../sanity'
import { OpenAIPipeline, type PipelineUsageEvent } from '../integrations/ai/openai'
import { resolveVariantTargetCount } from '../integrations/ai'
import { buildPromptArtifacts } from '../integrations/ai/prompt-context'
import { createLimiter } from '../utils/concurrency'
import { publishReadyArticles, type PublishSummary } from './publish-ready'

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

function missingAiBodyFilter(field: string) {
  return `(!defined(${field}) || coalesce(${field}, "") match "^[[:space:]]*$")`
}

export async function fetchTargets(limit?: number): Promise<ArticleLite[]> {
  const baseLimit = limit ?? 200
  const draftsQuery = `*[_type=="article" && _id in path('drafts.**') && ${missingAiBodyFilter('aiFinal.body')}][0...$lim]{
    _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name}
  }`
  const publishedQuery = `*[_type=="article" && !(_id in path('drafts.**')) && ${missingAiBodyFilter('aiFinal.body')} && !defined(*[_id == "drafts." + ^._id][0].aiFinal.body)][0...$lim]{
    _id, title, excerpt, body, externalHtml, canonicalUrl, leadImageUrl, source->{name}
  }`
  const [drafts, published] = await Promise.all([
    serverClient.fetch<ArticleLite[]>(draftsQuery, { lim: baseLimit }),
    serverClient.fetch<ArticleLite[]>(publishedQuery, { lim: baseLimit }),
  ])
  const combined = [...drafts, ...published]
  return limit ? combined.slice(0, limit) : combined
}

export async function countTargets(): Promise<number> {
  const [draftCount, publishedCount] = await Promise.all([
    serverClient.fetch<number>(
      `count(*[_type=="article" && _id in path('drafts.**') && ${missingAiBodyFilter('aiFinal.body')}])`
    ),
    serverClient.fetch<number>(
      `count(*[_type=="article" && !(_id in path('drafts.**')) && ${missingAiBodyFilter('aiFinal.body')} && !defined(*[_id == "drafts." + ^._id][0].aiFinal.body)])`
    ),
  ])
  const total = (typeof draftCount === 'number' ? draftCount : 0) + (typeof publishedCount === 'number' ? publishedCount : 0)
  return total
}

export function createPipeline(apiKey: string, options?: { onUsage?: (event: PipelineUsageEvent) => void }) {
  return new OpenAIPipeline(apiKey, process.env.AI_MODEL || 'gpt-5-mini', {
    onUsage: options?.onUsage,
  })
}

export async function runPipelineOnArticle(doc: ArticleLite, ai: OpenAIPipeline, logger: Console = console) {
  const usageBefore = ai.getUsageSummary().totals
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
      model: process.env.AI_MODEL || 'gpt-5-mini',
      createdAt: new Date().toISOString(),
    },
    status: 'review',
  }
  await serverClient.patch(doc._id).set(patch).commit()

  const usageAfter = ai.getUsageSummary().totals
  const deltaRequests = usageAfter.requests - usageBefore.requests
  const deltaPrompt = usageAfter.promptTokens - usageBefore.promptTokens
  const deltaCompletion = usageAfter.completionTokens - usageBefore.completionTokens
  const deltaTotal = usageAfter.totalTokens - usageBefore.totalTokens
  const deltaDuration = usageAfter.totalDurationMs - usageBefore.totalDurationMs
  const avgLatency = deltaRequests > 0 ? Math.round(deltaDuration / deltaRequests) : 0
  logger.log('[AI] Usage summary', {
    docId: doc._id,
    requests: deltaRequests,
    promptTokens: deltaPrompt,
    completionTokens: deltaCompletion,
    totalTokens: deltaTotal,
    avgLatencyMs: avgLatency,
  })
  logger.log('[AI] Draft metrics', {
    docId: doc._id,
    variants: variants.map((variant) => ({
      titleLength: variant.title?.length || 0,
      bodyLength: variant.body?.length || 0,
    })),
    final: {
      titleLength: finalDraft.title?.length || 0,
      bodyLength: finalDraft.body?.length || 0,
    },
  })
}

export type BackfillSummary = {
  backlogBefore: number
  total: number
  processed: number
  failures: number
  durationMs: number
  remaining: number
  autoPublish?: PublishSummary | null
}

export type BackfillOptions = {
  limit?: number
  concurrency?: number
  dryRun?: boolean
  apiKey?: string
  logger?: Console
  autoPublish?: boolean
}

export async function backfillMissingAIDrafts(options: BackfillOptions = {}): Promise<BackfillSummary> {
  const started = Date.now()
  const logger = options.logger ?? console
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY missing')
  const limit = options.limit
  const concurrency = Math.max(1, options.concurrency ?? 1)
  const shouldAutoPublish = options.autoPublish ?? true
  let autoPublishSummary: PublishSummary | null = null
  if (shouldAutoPublish) {
    autoPublishSummary = await publishReadyArticles({ logger, dryRun: options.dryRun })
    if (autoPublishSummary) {
      logger.log('[AI] Auto-publish summary', autoPublishSummary)
    }
  }
  const backlogBefore = await countTargets()
  logger.log(`[AI] Backfill backlog: ${backlogBefore}`)
  if (!backlogBefore) {
    return { backlogBefore, total: 0, processed: 0, failures: 0, durationMs: Date.now() - started, remaining: 0, autoPublish: autoPublishSummary }
  }
  const ai = createPipeline(apiKey, {
    onUsage: (event: PipelineUsageEvent) => {
      logger.log('[AI] Request usage', {
        label: event.label,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        totalTokens: event.totalTokens,
        durationMs: event.durationMs,
      })
    },
  })
  const targets = await fetchTargets(limit && limit > 0 ? limit : undefined)
  const total = targets.length
  logger.log(`[AI] Backfill targets: ${total}`)
  if (!total) {
    return {
      backlogBefore,
      total,
      processed: 0,
      failures: 0,
      durationMs: Date.now() - started,
      remaining: backlogBefore,
      autoPublish: autoPublishSummary,
    }
  }
  if (options.dryRun) {
    targets.forEach((t) => logger.log('[AI] Would process:', t._id, t.title))
    return {
      backlogBefore,
      total,
      processed: 0,
      failures: 0,
      durationMs: Date.now() - started,
      remaining: backlogBefore,
      autoPublish: autoPublishSummary,
    }
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
  const remaining = Math.max(0, backlogBefore - processed)
  return { backlogBefore, total, processed, failures, durationMs, remaining, autoPublish: autoPublishSummary }
}
