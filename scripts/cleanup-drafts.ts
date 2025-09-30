import 'dotenv/config'
import readline from 'node:readline'
import { serverClient } from '../lib/sanity'

async function prompt(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans) }))
}

async function main() {
  const olderThanIso = process.env.CLEANUP_OLDER_THAN // ISO date string
  const dryRun = process.env.DRY_RUN !== 'false'
  const tag = process.env.CLEANUP_TAG // optional tag filter

  let filter = `_id in path('drafts.**') && _type == "article"`
  const params: Record<string, any> = {}
  if (olderThanIso) {
    filter += ` && defined(publishedAt) && publishedAt < $olderThan`
    params.olderThan = olderThanIso
  }
  if (tag) {
    filter += ` && $tag in tags[]->name`
    params.tag = tag
  }

  const docs = await serverClient.fetch(`*[_type == "article" && ${filter}] { _id, title, slug }`, params)
  if (!docs.length) {
    console.log('No draft articles matched the criteria.')
    return
  }

  console.log(`Found ${docs.length} draft article(s) to delete.`)
  if (dryRun) {
    console.log('Dry run: listing IDs only. Set DRY_RUN=false to actually delete.')
    docs.slice(0, 20).forEach((d: any) => console.log(`- ${d._id} ${d.title || ''}`))
    if (docs.length > 20) console.log('...')
    return
  }

  const ans = (await prompt('Type DELETE to confirm removing these drafts: ')).trim()
  if (ans !== 'DELETE') {
    console.log('Aborted.')
    return
  }

  const tx = serverClient.transaction()
  for (const d of docs) tx.delete(d._id)
  await tx.commit()
  console.log('Draft deletion complete.')
}

main().catch((e) => { console.error(e); process.exit(1) })
