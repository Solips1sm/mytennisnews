import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { runIngestCycle } from '../lib/workflows/ingest-cycle'

dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  const summary = await runIngestCycle({ logger: console })
  console.log('[cron-ingest] Summary', summary)
  if (summary.summary) {
    console.log('[cron-ingest] Feed totals', summary.summary.totals)
    summary.summary.reports.forEach((report) => {
      console.log('[cron-ingest] Feed report', {
        feed: report.feed.name,
        type: report.feed.type,
        items: report.items,
        created: report.created,
        refreshed: report.refreshed,
        skipped: report.skipped,
        blocked: report.blocked,
      })
    })
  } else {
    console.log('[cron-ingest] No summary returned (likely timeout or failure)')
  }
  if (summary.timedOut) {
    console.warn('[cron-ingest] Completed with timeout flag; consider raising CRON_INGEST_TIMEOUT_MS or inspecting ingestion runtime')
  }
}

main().catch((error) => {
  console.error('[cron-ingest] failed', error)
  process.exit(1)
})
