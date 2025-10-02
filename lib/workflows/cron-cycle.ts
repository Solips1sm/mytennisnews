import { ingestFeeds, feedsFromPresets, FEED_PRESETS, type IngestSummary, type PendingFeedState } from './feed-ingestion'
import { backfillMissingAIDrafts, type BackfillSummary } from './ai-backfill'
import { publishReadyArticles, type PublishSummary } from './publish-ready'

export type CronCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  usedPresets: string[]
  ingestion?: IngestSummary | null
  ingestionTimedOut?: boolean
  ingestionPendingFeeds?: PendingFeedState[] | null
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

function resolveIngestBudgetFromEnv(): number | undefined {
  const raw = process.env.CRON_INGEST_TIMEOUT_MS || process.env.CRON_STAGE_TIMEOUT_MS
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.min(parsed, 295_000)
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
  ingestionPending: PendingFeedState[]
  ingestionTimedOut: boolean
  options: CronCycleOptions
  logger: Console
}): Promise<{ scheduled: boolean; error?: string }> {
  const { startedAt, summary, skipBackfill, ingestionPending, ingestionTimedOut, options, logger } = params
  const hasPendingBackfill = Boolean(summary && summary.remaining > 0)
  const hasPendingIngestion = ingestionPending.length > 0

  if (!hasPendingBackfill && !hasPendingIngestion) {
    return { scheduled: false }
  }

  if (options.disableFollowup) {
    return { scheduled: false, error: 'disabled' }
  }

  if (skipBackfill && !hasPendingIngestion) {
    return { scheduled: false }
  }

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
    logger.log('[cron] Preparing follow-up trigger', {
      pendingBackfill: hasPendingBackfill ? summary?.remaining : 0,
      pendingIngestion: hasPendingIngestion
        ? ingestionPending.map((p) => ({
            feed: p.feed.name,
            remainingItems: p.remainingItems,
            nextItemUrl: p.nextItemUrl ?? null,
            lastProcessedUrl: p.lastProcessedUrl ?? null,
          }))
        : null,
      ingestionTimedOut,
    })
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        'x-cron-chain': String((options.chainDepth ?? 0) + 1),
        'x-cron-followup': '1',
      },
      body: JSON.stringify({
        reason: 'followup',
        backfillRemaining: summary?.remaining ?? null,
        ingestionPending: hasPendingIngestion
          ? ingestionPending.map((p) => ({
              feed: p.feed.name,
              remainingItems: p.remainingItems ?? null,
              nextItemUrl: p.nextItemUrl ?? null,
              lastProcessedUrl: p.lastProcessedUrl ?? null,
            }))
          : null,
        ingestionTimedOut,
      }),
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
  let ingestionTimedOut = false
  let ingestionPendingFeeds: PendingFeedState[] = []
  if (!feeds.length) {
    logger.warn('[cron] No valid feeds resolved; skipping ingestion step')
  } else {
    const ingestBudgetMs = resolveIngestBudgetFromEnv()
    const ingestResult = await ingestFeeds(feeds, { logger, timeBudgetMs: ingestBudgetMs })
    ingestionSummary = ingestResult.summary
    ingestionTimedOut = ingestResult.timedOut
    ingestionPendingFeeds = ingestResult.pendingFeeds
    if (ingestionTimedOut) {
      logger.warn('[cron] ingestion ended early due to time budget', {
        elapsedMs: ingestResult.elapsedMs,
        pendingFeeds: ingestionPendingFeeds.map((p) => ({
          feed: p.feed.name,
          processedItems: p.processedItems,
          remainingItems: p.remainingItems,
        })),
      })
    }
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
    ingestionPending: ingestionPendingFeeds,
    ingestionTimedOut,
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
    ingestionTimedOut,
    ingestionPendingFeeds: ingestionPendingFeeds.length ? ingestionPendingFeeds : null,
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
