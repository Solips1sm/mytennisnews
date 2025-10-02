import {
  ingestFeeds,
  feedsFromPresets,
  FEED_PRESETS,
  type IngestSummary,
  type PendingFeedState,
} from './feed-ingestion'

export type IngestCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  presetsRequested: string[]
  presetsUsed: string[]
  summary: IngestSummary | null
  hasNewContent: boolean
  timedOut: boolean
  pendingFeeds: PendingFeedState[] | null
}

export type IngestCycleOptions = {
  presets?: string[]
  logger?: Console
  timeBudgetMs?: number
}

const DEFAULT_PRESETS = ['espn', 'atp', 'wta']
const DEFAULT_TIME_BUDGET_MS = 293_000

function resolvePresetsFromEnv(): string[] | undefined {
  const raw = process.env.CRON_FEEDS
  if (!raw) return undefined
  return raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

function resolveBudgetFromEnv(): number {
  const raw = process.env.CRON_INGEST_TIMEOUT_MS || process.env.CRON_STAGE_TIMEOUT_MS
  if (!raw) return DEFAULT_TIME_BUDGET_MS
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIME_BUDGET_MS
  }
  return Math.min(parsed, 295_000)
}

export async function runIngestCycle(options: IngestCycleOptions = {}): Promise<IngestCycleSummary> {
  const logger = options.logger ?? console
  const started = Date.now()
  const requestedPresets = options.presets ?? resolvePresetsFromEnv() ?? [...DEFAULT_PRESETS]
  const uniquePresets = Array.from(new Set(requestedPresets.map((key) => key.trim().toLowerCase()).filter(Boolean)))

  const unknownPresets = uniquePresets.filter((key) => !Object.prototype.hasOwnProperty.call(FEED_PRESETS, key))
  if (unknownPresets.length) {
    logger.warn('[ingest-cycle] Ignoring unknown feed presets', unknownPresets)
  }

  const validPresets = uniquePresets.filter((key) => Object.prototype.hasOwnProperty.call(FEED_PRESETS, key))
  const feeds = feedsFromPresets(validPresets.length ? validPresets : DEFAULT_PRESETS)

  const timeBudgetMs = options.timeBudgetMs ?? resolveBudgetFromEnv()
  logger.log('[ingest-cycle] Starting ingest run', {
    requestedPresets,
    validPresets: feeds.map((feed) => feed.name),
    timeBudgetMs,
  })
  let timedOut = false
  let summary: IngestSummary | null = null
  let pendingFeeds: PendingFeedState[] = []
  try {
    const result = await ingestFeeds(feeds, { logger, timeBudgetMs })
    summary = result.summary
    timedOut = result.timedOut
    pendingFeeds = result.pendingFeeds
    if (timedOut) {
      logger.warn('[ingest-cycle] time budget reached before completion', {
        elapsedMs: result.elapsedMs,
        pendingFeeds: result.pendingFeeds.map((p) => ({
          feed: p.feed.name,
          processedItems: p.processedItems,
          remainingItems: p.remainingItems,
          nextItemUrl: p.nextItemUrl ?? null,
          lastProcessedUrl: p.lastProcessedUrl ?? null,
        })),
      })
    }
  } catch (error) {
    logger.error('[ingest-cycle] failed', error)
    throw error
  }

  const finished = Date.now()
  const durationMs = finished - started
  const hasNewContent = Boolean(summary && summary.totals.created > 0)
  logger.log('[ingest-cycle] Completed', {
    durationMs,
    timedOut,
    totals: summary?.totals ?? null,
    hasNewContent,
  })

  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs,
    presetsRequested: requestedPresets,
    presetsUsed: feeds.map((feed) => feed.name),
    summary,
    hasNewContent,
    timedOut,
    pendingFeeds: pendingFeeds.length ? pendingFeeds : null,
  }
}
