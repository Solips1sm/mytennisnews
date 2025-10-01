import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { runPublishCycle } from '../lib/workflows/publish-cycle'

dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  console.log('[cron-publish] Bootstrapping publish cycle...')
  const summary = await runPublishCycle({ logger: console })
  console.log('[cron-publish] Summary', {
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationMs: summary.durationMs,
    dryRun: summary.dryRun,
    totalCandidates: summary.summary?.totalCandidates ?? 0,
    published: summary.summary?.published ?? 0,
    skipped: summary.summary?.skipped ?? 0,
    errors: summary.summary?.errors ?? 0,
    timedOut: summary.timedOut,
  })
  if (summary.timedOut) {
    console.warn('[cron-publish] Completed with timeout flag; consider raising CRON_PUBLISH_TIMEOUT_MS')
  }
}

main().catch((error) => {
  console.error('[cron-publish] failed', error)
  process.exit(1)
})
