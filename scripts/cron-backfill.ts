import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { runBackfillCycle } from '../lib/workflows/backfill-cycle'

dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  console.log('[cron-backfill] Bootstrapping backfill cycle...')
  const summary = await runBackfillCycle({ logger: console })
  console.log('[cron-backfill] Summary', {
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationMs: summary.durationMs,
    processed: summary.summary?.processed ?? 0,
    failures: summary.summary?.failures ?? 0,
    backlogBefore: summary.summary?.backlogBefore ?? null,
    remaining: summary.remaining,
    timedOut: summary.timedOut,
  })
  if (summary.timedOut) {
    console.warn('[cron-backfill] Completed with timeout flag; consider raising CRON_BACKFILL_TIMEOUT_MS or reducing CRON_BACKFILL_LIMIT')
  }
}

main().catch((error) => {
  console.error('[cron-backfill] failed', error)
  process.exit(1)
})
