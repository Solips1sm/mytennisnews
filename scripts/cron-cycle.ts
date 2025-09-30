import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { runCronCycle } from '../lib/workflows/cron-cycle'

// Load env from root and cms for parity with other scripts
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  const summary = await runCronCycle({ logger: console })
  console.log('[cron] Summary', summary)
}

main().catch((error) => {
  console.error('[cron] Cycle failed', error)
  process.exit(1)
})
