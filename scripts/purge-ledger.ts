import 'dotenv/config'
import readline from 'node:readline'
import { prisma } from '../lib/prisma'

async function prompt(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans) }))
}

async function main() {
  const sourceKey = process.env.SOURCE_KEY || ''
  const dryRun = process.env.DRY_RUN !== 'false'
  if (!sourceKey) {
    console.error('Missing SOURCE_KEY. Example: rss:https://www.espn.com/espn/rss/tennis/news')
    process.exit(1)
  }

  const count = await prisma.ingestedItem.count({ where: { sourceKey } })
  if (!count) {
    console.log(`No ledger entries for sourceKey=${sourceKey}`)
    return
  }

  console.log(`Found ${count} ledger row(s) for sourceKey=${sourceKey}`)
  if (dryRun) {
    console.log('Dry run. Set DRY_RUN=false to actually delete.')
    return
  }

  const ans = (await prompt('Type PURGE to delete these ledger rows: ')).trim()
  if (ans !== 'PURGE') {
    console.log('Aborted.')
    return
  }

  const res = await prisma.ingestedItem.deleteMany({ where: { sourceKey } })
  console.log(`Deleted ${res.count} row(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
