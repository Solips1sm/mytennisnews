import { ingestFeeds, feedsFromPresets, FEED_PRESETS, type IngestSummary } from './feed-ingestion'

export type IngestCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  presetsRequested: string[]
  presetsUsed: string[]
  summary: IngestSummary | null
  hasNewContent: boolean
  timedOut: boolean
}

export type IngestCycleOptions = {
  presets?: string[]
  logger?: Console
  timeBudgetMs?: number
}

const DEFAULT_PRESETS = ['espn', 'atp', 'wta']
const DEFAULT_TIME_BUDGET_MS = 240_000

class IngestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Ingest cycle exceeded allotted time (${timeoutMs}ms) before completion`)
    this.name = 'IngestTimeoutError'
  }
}

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

  const ingestPromise = ingestFeeds(feeds, { logger })
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      timedOut = true
      reject(new IngestTimeoutError(timeBudgetMs))
    }, timeBudgetMs)
    ingestPromise
      .then(() => {
        clearTimeout(timer)
      })
      .catch(() => {
        clearTimeout(timer)
      })
  })

  try {
    summary = await Promise.race([ingestPromise, timeoutPromise])
  } catch (error) {
    if (error instanceof IngestTimeoutError) {
      logger.error('[ingest-cycle] timed out before completion', { timeBudgetMs })
    } else {
      logger.error('[ingest-cycle] failed', error)
      throw error
    }
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
  }
}
