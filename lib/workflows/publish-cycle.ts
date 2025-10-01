import { publishReadyArticles, type PublishSummary } from './publish-ready'

export type PublishCycleSummary = {
  startedAt: string
  finishedAt: string
  durationMs: number
  dryRun: boolean
  summary: PublishSummary | null
  timedOut: boolean
}

export type PublishCycleOptions = {
  dryRun?: boolean
  logger?: Console
  timeBudgetMs?: number
}

const DEFAULT_TIME_BUDGET_MS = 120_000

class PublishTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Publish cycle exceeded allotted time (${timeoutMs}ms) before completion`)
    this.name = 'PublishTimeoutError'
  }
}

function resolveDryRunFromEnv(): boolean {
  const raw = process.env.CRON_PUBLISH_DRY_RUN
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

function resolveBudgetFromEnv(): number {
  const raw = process.env.CRON_PUBLISH_TIMEOUT_MS || process.env.CRON_STAGE_TIMEOUT_MS
  if (!raw) return DEFAULT_TIME_BUDGET_MS
  const parsed = parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIME_BUDGET_MS
  }
  return Math.min(parsed, 295_000)
}

export async function runPublishCycle(options: PublishCycleOptions = {}): Promise<PublishCycleSummary> {
  const logger = options.logger ?? console
  const started = Date.now()
  const dryRun = options.dryRun ?? resolveDryRunFromEnv()
  const timeBudgetMs = options.timeBudgetMs ?? resolveBudgetFromEnv()
  logger.log('[publish-cycle] Starting publish run', {
    dryRun,
    timeBudgetMs,
  })

  let summary: PublishSummary | null = null
  let timedOut = false

  const publishPromise = publishReadyArticles({ logger, dryRun })

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      timedOut = true
      reject(new PublishTimeoutError(timeBudgetMs))
    }, timeBudgetMs)
    publishPromise
      .then(() => {
        clearTimeout(timer)
      })
      .catch(() => {
        clearTimeout(timer)
      })
  })

  try {
    summary = await Promise.race([publishPromise, timeoutPromise])
  } catch (error) {
    if (error instanceof PublishTimeoutError) {
      logger.error('[publish-cycle] timed out before completion', { timeBudgetMs })
    } else {
      logger.error('[publish-cycle] failed', error)
      throw error
    }
  }

  const finished = Date.now()
  const durationMs = finished - started
  logger.log('[publish-cycle] Completed', {
    durationMs,
    timedOut,
    dryRun,
    totalCandidates: summary?.totalCandidates ?? 0,
    published: summary?.published ?? 0,
    skipped: summary?.skipped ?? 0,
    errors: summary?.errors ?? 0,
  })

  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    durationMs,
    dryRun,
    summary,
    timedOut,
  }
}
