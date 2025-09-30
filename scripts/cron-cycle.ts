import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { feedsFromPresets, ingestFeeds, FEED_PRESETS } from './ingest-feeds'
import { backfillMissingAIDrafts } from './ai-backfill'
import { publishReadyArticles } from '../lib/workflows/publish-ready'

// Load env from root and cms for parity with other scripts
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

const logger: Console = console

function ms(duration: number): string {
  if (duration >= 60_000) return `${(duration / 60_000).toFixed(2)}m`
  if (duration >= 1_000) return `${(duration / 1_000).toFixed(2)}s`
  return `${duration}ms`
}

function resolveFeedPresets(): string[] {
  const raw = process.env.CRON_FEEDS
  if (!raw) return ['espn', 'atp', 'wta']
  return raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
}

async function run() {
  const started = Date.now()
  logger.log(`[cron] Starting cycle at ${new Date().toISOString()}`)
  const presetKeys = resolveFeedPresets()
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
  if (!feeds.length) {
    logger.warn('[cron] No valid feeds resolved; skipping ingestion step')
  } else {
    await ingestFeeds(feeds, { logger })
  }

  const concurrency = process.env.CRON_AI_CONCURRENCY ? Math.max(1, parseInt(process.env.CRON_AI_CONCURRENCY, 10)) : 2
  const backfillSummary = await backfillMissingAIDrafts({ concurrency, logger })
  logger.log('[cron] AI backfill summary', backfillSummary)

  const publishSummary = await publishReadyArticles({ logger })
  logger.log('[cron] Publish summary', publishSummary)

  const elapsed = Date.now() - started
  logger.log(`[cron] Cycle complete in ${ms(elapsed)}`)
}

run().catch((error) => {
  logger.error('[cron] Cycle failed', error)
  process.exit(1)
})
