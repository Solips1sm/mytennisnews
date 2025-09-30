import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
import { ingestFeeds, feedsFromPresets, FEED_PRESETS, type FeedConfig } from '../lib/workflows/feed-ingestion'

// Ensure we load env from both root and cms/.env (for Studio-local flags)
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: false })
dotenvConfig({ path: path.resolve(process.cwd(), 'cms/.env'), override: false })

function parseArgFlags(argv: string[]) {
  const out: { presets: string[]; legacy: boolean; help: boolean; list: boolean } = {
    presets: [],
    legacy: false,
    help: false,
    list: false,
  }
  for (const arg of argv.slice(2)) {
    if (/^ingest:/i.test(arg)) {
      out.presets.push(arg.split(':')[1].toLowerCase())
    } else if (arg === '--legacy-env') out.legacy = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--list' || arg === '-l') out.list = true
  }
  return out
}

function loadFeeds(): FeedConfig[] {
  const flags = parseArgFlags(process.argv)
  if (flags.help) {
    console.log(`Usage: npm run ingest -- [options] [ingest:espn] [ingest:atp] [...]

Options:
  --list, -l        List built-in feed presets
  --legacy-env      Use legacy env-based FEEDS/FEED_NAME/FEED_URL loading
  --help, -h        Show this help

Presets:
  ${Object.keys(FEED_PRESETS).sort().join(', ')}

Examples:
  npm run ingest -- ingest:espn
  npm run ingest -- ingest:atp
  npm run ingest -- ingest:espn ingest:atp
  npm run ingest -- --legacy-env
`)
    process.exit(0)
  }
  if (flags.list) {
    console.log('Available presets:')
    for (const key of Object.keys(FEED_PRESETS).sort()) {
      const p = FEED_PRESETS[key]
      console.log(` - ${key}\t${p.type}\t${p.url}`)
    }
    process.exit(0)
  }
  if (flags.legacy) {
    // Backward-compatible path
    const list = process.env.FEEDS || ''
    const singleName = process.env.FEED_NAME
    const singleUrl = process.env.FEED_URL
    const feeds: FeedConfig[] = []
    if (list) {
      for (const raw of list.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [name, typeOrUrl, maybeUrl] = raw.split('|')
        const typeRaw = (maybeUrl ? typeOrUrl : 'rss').toLowerCase()
  const type = (['rss', 'rss-tags', 'atp-rss', 'wta-news'].includes(typeRaw) ? typeRaw : 'rss') as FeedConfig['type']
        const url = maybeUrl || typeOrUrl
        if (!name || !url) continue
        feeds.push({ type, name, url })
      }
      return feeds
    } else if (singleName && singleUrl) {
      return [{ type: 'rss', name: singleName, url: singleUrl }]
    }
    return [FEED_PRESETS.espn]
  }
  const chosen = flags.presets.length ? flags.presets : Object.keys(FEED_PRESETS)
  const feeds = feedsFromPresets(chosen)
  if (!feeds.length) feeds.push(FEED_PRESETS.espn)
  return feeds
}
async function main() {
  const feeds = loadFeeds()
  await ingestFeeds(feeds)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
