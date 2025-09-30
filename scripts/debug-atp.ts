import { extractATP } from '../lib/integrations/extractors/atp'
import { JSDOM } from 'jsdom'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: tsx scripts/debug-atp.ts <url>')
    process.exit(1)
  }
  const data = await extractATP(url)
  if (!data) {
    console.error('No data returned')
    process.exit(1)
  }
  console.log('--- bodyHtml snippet ---')
  console.log(data.bodyHtml?.slice(0, 500) || '[no body HTML]')
  const dom = new JSDOM(data.bodyHtml || '')
  const doc = dom.window.document
  const firstParagraph = doc.querySelector('p')
  if (firstParagraph) {
    console.log('First paragraph:', firstParagraph.textContent)
  }
  const targetPara = Array.from(doc.querySelectorAll('p')).find((p) => p.textContent?.includes('fought for'))
  if (targetPara) {
    console.log('Target paragraph:', targetPara.textContent)
  }
  const anchor = doc.querySelector("a[href*='marton-fucsovics']")
  if (anchor) {
    console.log('Anchor href:', anchor.getAttribute('href'))
    console.log('Anchor text:', anchor.textContent)
  }
  console.log('--- end ---')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
