import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import {
  backfillMissingAIDrafts,
  fetchById,
  fetchBySlug,
  createPipeline,
  runPipelineOnArticle,
  type ArticleLite,
} from '../lib/workflows/ai-backfill'
import { publishReadyArticles } from '../lib/workflows/publish-ready'

// Load env from root and cms if present
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

async function main() {
  const apiKey = process.env.GROK_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('GROK_API_KEY missing (fall back to OPENAI_API_KEY optional)')
    process.exit(1)
  }
  const idArg = process.argv.find((a) => a.startsWith('--id='))
  const slugArg = process.argv.find((a) => a.startsWith('--slug='))
  const idFragArg = process.argv.find((a) => a.startsWith('--id-frag='))
  const idEnvFlag = process.argv.includes('--id-env')
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const concArg = process.argv.find((a) => a.startsWith('--concurrency='))
  const dryRun = process.argv.includes('--dry-run')
  const max = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
  const concurrency = concArg ? Math.max(1, parseInt(concArg.split('=')[1], 10)) : 1

  const ai = createPipeline(apiKey)

  // Single doc mode by id or slug
  if (idArg || slugArg || idFragArg || idEnvFlag) {
    let id = idArg ? idArg.split('=')[1] : undefined
    if (!id && idFragArg) {
      const frag = idFragArg.split('=')[1]
      if (frag) id = `article;${frag}`
    }
    if (!id && idEnvFlag) {
      id = process.env.AI_TARGET_ID
    }
    const slug = slugArg ? slugArg.split('=')[1] : undefined
    let doc: ArticleLite | null = null
    if (id) doc = await fetchById(id)
    else if (slug) doc = await fetchBySlug(slug)
    if (!doc) {
      console.error('No article found for', id ? `id=${id}` : `slug=${slug}`)
      return
    }
    if (dryRun) {
      console.log('[AI] Would process:', doc._id, doc.title)
      return
    }
    console.log('[AI] Generating ->', doc._id, '::', doc.title)
    await runPipelineOnArticle(doc, ai)
    console.log('[AI] Done (single)')
    return
  }

  const publishSummary = await publishReadyArticles({ logger: console, dryRun })
  console.log('[publish] summary', publishSummary)

  await backfillMissingAIDrafts({ apiKey, limit: max, concurrency, dryRun, autoPublish: false })
}

main().catch((e) => { console.error(e); process.exit(1) })
