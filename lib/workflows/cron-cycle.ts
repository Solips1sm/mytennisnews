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
}

export type CronCycleOptions = {
  presets?: string[]
  concurrency?: number
  logger?: Console
  publishDryRun?: boolean
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
  }

  const concurrency = options.concurrency ?? resolveConcurrencyFromEnv() ?? 2
  const backfillSummary = await backfillMissingAIDrafts({ concurrency, logger })
  const publishSummary = await publishReadyArticles({ logger, dryRun: options.publishDryRun })

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
  }
}
