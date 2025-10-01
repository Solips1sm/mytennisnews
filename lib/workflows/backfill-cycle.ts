import { backfillMissingAIDrafts, type BackfillSummary } from './ai-backfill'

export type BackfillCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  limit: number
  concurrency: number
  summary: BackfillSummary | null
  remaining: number
  timedOut: boolean
}

export type BackfillCycleOptions = {
  limit?: number
  concurrency?: number
  logger?: Console
  timeBudgetMs?: number
}

const DEFAULT_LIMIT = 1
const DEFAULT_CONCURRENCY = 1
const DEFAULT_TIME_BUDGET_MS = 240_000

class BackfillTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Backfill cycle exceeded allotted time (${timeoutMs}ms) before completion`)
    this.name = 'BackfillTimeoutError'
  }
}

function resolveLimitFromEnv(): number {
  const raw = process.env.CRON_BACKFILL_LIMIT ?? process.env.CRON_AI_LIMIT
  if (!raw) return DEFAULT_LIMIT
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return parsed
}

function resolveConcurrencyFromEnv(): number {
  const raw = process.env.CRON_BACKFILL_CONCURRENCY ?? process.env.CRON_AI_CONCURRENCY
  if (!raw) return DEFAULT_CONCURRENCY
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CONCURRENCY
  return parsed
}

function resolveBudgetFromEnv(): number {
  const raw = process.env.CRON_BACKFILL_TIMEOUT_MS || process.env.CRON_STAGE_TIMEOUT_MS
  if (!raw) return DEFAULT_TIME_BUDGET_MS
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIME_BUDGET_MS
  }
  return Math.min(parsed, 295_000)
}

export async function runBackfillCycle(options: BackfillCycleOptions = {}): Promise<BackfillCycleSummary> {
  const logger = options.logger ?? console
  const started = Date.now()
  const limit = Math.max(1, options.limit ?? resolveLimitFromEnv())
  const concurrency = Math.max(1, options.concurrency ?? resolveConcurrencyFromEnv())
  const timeBudgetMs = options.timeBudgetMs ?? resolveBudgetFromEnv()
  logger.log('[backfill-cycle] Starting backfill run', {
    limit,
    concurrency,
    timeBudgetMs,
  })

  let summary: BackfillSummary | null = null
  let timedOut = false

  const backfillPromise = backfillMissingAIDrafts({
    limit,
    concurrency,
    logger,
    autoPublish: false,
  })

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      timedOut = true
      reject(new BackfillTimeoutError(timeBudgetMs))
    }, timeBudgetMs)
    backfillPromise
      .then(() => {
        clearTimeout(timer)
      })
      .catch(() => {
        clearTimeout(timer)
      })
  })

  try {
    summary = await Promise.race([backfillPromise, timeoutPromise])
  } catch (error) {
    if (error instanceof BackfillTimeoutError) {
      logger.error('[backfill-cycle] timed out before completion', { timeBudgetMs })
    } else {
      logger.error('[backfill-cycle] failed', error)
      throw error
    }
  }

  const finished = Date.now()
  const durationMs = finished - started
  const remaining = summary?.remaining ?? 0
  logger.log('[backfill-cycle] Completed', {
    durationMs,
    timedOut,
    processed: summary?.processed ?? 0,
    failures: summary?.failures ?? 0,
    backlogBefore: summary?.backlogBefore ?? null,
    remaining,
  })

  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs,
    limit,
    concurrency,
    summary,
    remaining,
    timedOut,
  }
}
