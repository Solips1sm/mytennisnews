import { ingestFeeds, feedsFromPresets, FEED_PRESETS, type IngestSummary } from './feed-ingestion'
import { backfillMissingAIDrafts, type BackfillSummary } from './ai-backfill'
import { publishReadyArticles, type PublishSummary } from './publish-ready'

export type CronCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  usedPresets: string[]
  ingestion?: IngestSummary | null
  backfill?: BackfillSummary | null
  publish?: PublishSummary | null
  backfillSkipped?: boolean
  backfillLimit?: number | null
  backfillBacklog?: number | null
  backfillRemaining?: number | null
  followupScheduled?: boolean
  followupError?: string | null
  chainDepth: number
}

export type CronCycleOptions = {
  presets?: string[]
  concurrency?: number
  logger?: Console
  publishDryRun?: boolean
  skipBackfill?: boolean
  backfillLimit?: number
  chainDepth?: number
  disableFollowup?: boolean
}

function resolvePresetsFromEnv(): string[] | undefined {
  const raw = process.env.CRON_FEEDS
  if (!raw) return undefined
  return raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function resolveConcurrencyFromEnv(): number | undefined {
  const raw = process.env.CRON_AI_CONCURRENCY
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function resolveSkipBackfillFromEnv(): boolean | undefined {
  const raw = process.env.CRON_AI_SKIP
  if (!raw) return undefined
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return undefined
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function resolveBackfillLimitFromEnv(): number | undefined {
  const raw = process.env.CRON_AI_LIMIT
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

const DEFAULT_BACKFILL_LIMIT = 2

function resolveSelfTriggerUrl(): string | undefined {
  return process.env.CRON_SELF_TRIGGER_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL
}

function resolveSelfTriggerDelayMs(): number {
  const raw = process.env.CRON_SELF_TRIGGER_DELAY_MS
  if (!raw) return 0
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function resolveSelfTriggerMaxDepth(): number {
  const raw = process.env.CRON_SELF_TRIGGER_MAX
  if (!raw) return 10
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10
}

function resolveSelfTriggerSafetyWindow(): number {
  const raw = process.env.CRON_SELF_TRIGGER_SAFE_WINDOW_MS
  if (!raw) return 285000
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 285000
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function triggerFollowupIfNeeded(params: {
  startedAt: Date
  summary: BackfillSummary | null
  skipBackfill: boolean
  options: CronCycleOptions
  logger: Console
}): Promise<{ scheduled: boolean; error?: string }> {
  const { startedAt, summary, skipBackfill, options, logger } = params
  if (!summary) return { scheduled: false }
  if (summary.remaining <= 0) return { scheduled: false }
  if (options.disableFollowup) return { scheduled: false }
  if (skipBackfill) return { scheduled: false }

  const maxDepth = resolveSelfTriggerMaxDepth()
  const currentDepth = options.chainDepth ?? 0
  if (maxDepth >= 0 && currentDepth >= maxDepth) {
    logger.warn(`[cron] Follow-up skipped. Chain depth ${currentDepth} exceeds limit ${maxDepth}`)
    return { scheduled: false, error: 'max-depth' }
  }

  const url = resolveSelfTriggerUrl()
  if (!url) {
    logger.warn('[cron] Follow-up skipped. CRON_SELF_TRIGGER_URL (or fallback URL) is not configured')
    return { scheduled: false, error: 'missing-url' }
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    logger.warn('[cron] Follow-up skipped. CRON_SECRET missing for authorization')
    return { scheduled: false, error: 'missing-secret' }
  }

  const delayMs = resolveSelfTriggerDelayMs()
  if (delayMs > 0) {
    const elapsed = Date.now() - startedAt.getTime()
    const safetyWindow = resolveSelfTriggerSafetyWindow()
    const remainingBudget = Math.max(0, safetyWindow - elapsed)
    if (remainingBudget <= 0) {
      logger.warn('[cron] Follow-up delay skipped due to limited execution budget')
    } else {
      const waitMs = Math.min(delayMs, remainingBudget)
      if (waitMs > 0) {
        logger.log(`[cron] Waiting ${waitMs}ms before scheduling follow-up`)
        await wait(waitMs)
      }
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        'x-cron-chain': String((options.chainDepth ?? 0) + 1),
        'x-cron-followup': '1',
      },
      body: JSON.stringify({ reason: 'backfill-remaining' }),
    })
    if (!response.ok) {
      const text = await response.text()
      logger.error(`[cron] Follow-up trigger failed (${response.status})`, text)
      return { scheduled: false, error: `http-${response.status}` }
    }
    logger.log('[cron] Follow-up trigger dispatched')
    return { scheduled: true }
  } catch (err: any) {
    logger.error('[cron] Follow-up trigger error', err)
    return { scheduled: false, error: err?.message || 'unknown-error' }
  }
}

export async function runCronCycle(options: CronCycleOptions = {}): Promise<CronCycleSummary> {
  const logger = options.logger ?? console
  const started = new Date()
  const presetKeysFromEnv = resolvePresetsFromEnv()
  const presetKeys = options.presets ?? presetKeysFromEnv ?? ['espn', 'atp', 'wta']
  if (!presetKeys.length) {
    logger.warn('[cron] No feed presets configured; defaulting to espn, atp, wta')
    presetKeys.push('espn', 'atp', 'wta')
  }

  const unknown = presetKeys.filter((key) => !Object.prototype.hasOwnProperty.call(FEED_PRESETS, key))
  if (unknown.length) {
    logger.warn('[cron] Unknown feed presets ignored:', unknown.join(', '))
  }

  const validPresets = presetKeys.filter((key) => Object.prototype.hasOwnProperty.call(FEED_PRESETS, key))
  const feeds = feedsFromPresets(validPresets)

  let ingestionSummary: IngestSummary | null = null
  if (!feeds.length) {
    logger.warn('[cron] No valid feeds resolved; skipping ingestion step')
  } else {
    ingestionSummary = await ingestFeeds(feeds, { logger })
    if ((ingestionSummary?.totals?.blocked ?? 0) > 0) {
      logger.warn(
        { blockedItems: ingestionSummary?.totals?.blocked },
        '[cron] ingestion blocked items detected'
      )
    }
  }

  const skipBackfill = options.skipBackfill ?? resolveSkipBackfillFromEnv() ?? false
  const resolvedBackfillLimit = options.backfillLimit ?? resolveBackfillLimitFromEnv()
  const effectiveBackfillLimit =
    resolvedBackfillLimit === undefined ? DEFAULT_BACKFILL_LIMIT : resolvedBackfillLimit
  const limitForRun = effectiveBackfillLimit && effectiveBackfillLimit > 0 ? effectiveBackfillLimit : undefined
  let backfillSummary: BackfillSummary | null = null
  if (skipBackfill) {
    logger.log('[cron] AI backfill skipped via configuration')
  } else {
    const concurrency = options.concurrency ?? resolveConcurrencyFromEnv() ?? 2
    logger.log(
      `[cron] AI backfill window: limit=${limitForRun ?? 'unbounded'} concurrency=${concurrency} chainDepth=${
        options.chainDepth ?? 0
      }`
    )
    backfillSummary = await backfillMissingAIDrafts({ concurrency, limit: limitForRun, logger })
  }
  const publishSummary = await publishReadyArticles({ logger, dryRun: options.publishDryRun })

  const followupResult = await triggerFollowupIfNeeded({
    startedAt: started,
    summary: backfillSummary,
    skipBackfill,
    options,
    logger,
  })

  const finished = new Date()
  const durationMs = finished.getTime() - started.getTime()
  return {
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs,
    usedPresets: validPresets,
    ingestion: ingestionSummary,
    backfill: backfillSummary,
    publish: publishSummary,
    backfillSkipped: skipBackfill,
    backfillLimit: effectiveBackfillLimit ?? null,
    backfillBacklog: backfillSummary?.backlogBefore ?? null,
    backfillRemaining: backfillSummary?.remaining ?? null,
    followupScheduled: followupResult.scheduled,
    followupError: followupResult.error ?? null,
    chainDepth: options.chainDepth ?? 0,
  }
}
