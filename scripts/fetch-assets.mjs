// Fetch external brand assets into public/logos without committing copyrighted binaries
// Usage: npm run assets:fetch
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const logosDir = path.resolve(process.cwd(), 'public', 'logos')

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
}

async function fetchToFile(url, outPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(outPath, buf)
  return outPath
}

async function main() {
  await ensureDir(logosDir)
  const tasks = []
  // ESPN wordmark from Wikimedia Commons (for nominative use overlay)
  tasks.push(
    fetchToFile(
      'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
      path.join(logosDir, 'espn.svg')
    ).then((p) => console.log(`Saved: ${p}`))
  )
  await Promise.all(tasks)
  console.log('Asset fetch complete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
