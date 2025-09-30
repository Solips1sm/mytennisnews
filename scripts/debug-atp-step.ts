import { JSDOM } from 'jsdom'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('usage: tsx scripts/debug-atp-step.ts <url>')
    process.exit(1)
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'MyTennisNewsBot/1.0' } })
  const html = await res.text()
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const summary = (label: string) => {
    const para = Array.from(doc.querySelectorAll('p')).find((p) => p.textContent?.includes('fought for'))
    console.log(label, '=>', para?.textContent?.trim())
  }

  summary('raw')

  const container =
    doc.querySelector('.atp_article') ||
    doc.querySelector('article') ||
    doc.querySelector("[class*='article']") ||
    doc.querySelector('main') ||
    doc.body

  // removal steps mimic extractor
  Array.from(container.querySelectorAll('script, style, nav, aside, noscript, form')).forEach((el) => el.remove())
  summary('after removing script/style/etc')

  container
    .querySelectorAll(
      [
        '.atp_article-news',
        '.atp_article-videos',
        '.article-recommendation',
        '.splide',
        '.readmore',
        '.share-tools',
        '.social-share',
        '.atp_social',
        '.newsletter-signup',
        '.ad-container',
        '.advertisement',
      ].join(', ')
    )
    .forEach((el) => el.remove())
  summary('after removing promo blocks')

  // remove duplicates metadata
  Array.from(container.querySelectorAll('.tag, .tagline, .timestamp, .main-video-content')).forEach((el) => el.remove())
  summary('after removing metadata blocks')

  // numbers restoration loop from extractor
  const isOnlyPunctuation = (s: string) => /^[\s,.;:–—()\[\]{}|/*+\-\s]*$/.test(s)
  const pickNumericToken = (val: string): string | undefined => {
    const m = val.match(/\d{1,4}(?:[.,]\d{1,3})?(?:\s*[–—-]\s*\d{1,4}(?:[.,]\d{1,3})?)*/)
    return m ? m[0] : undefined
  }
  const allEls = Array.from(container.querySelectorAll('*')) as Element[]
  allEls.forEach((el) => {
    const current = (el.textContent || '').trim()
    if (current && !isOnlyPunctuation(current)) return
    let injected: string | undefined
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('data-') || name === 'aria-label' || name === 'title') {
        const v = attr.value || ''
        const found = pickNumericToken(v)
        if (found) {
          injected = found
          break
        }
      }
    }
    if (!injected) return
    el.textContent = injected
  })
  summary('after numeric hydrate loop')

  summary('before paragraph cleanup')

  const paragraphs = Array.from(container.querySelectorAll('p'))
  const sponsorPatterns = [/lexus/gi, /infosys/gi, /emirates/gi, /rolex/gi]
  const emojiRegex = /[\p{Extended_Pictographic}\u200d\uFE0F\u20E3]/gu
  const smartQuoteEntityRegex = /&(ldquo|rdquo|lsquo|rsquo);/gi
  const dashEntities = /&(mdash|ndash);/gi
  const quoteHeuristic = (t: string) => {
    const trimmed = t.trim()
    if (trimmed.length < 8) return false
    return /^([“"'])(.+)([”"'])$/.test(trimmed) && trimmed.length < 420
  }
  const isSocialLike = (t: string) => {
    const trimmed = t.trim()
    if (trimmed.length < 12) return false
    const hasHandle = /@\w{2,}/.test(trimmed)
    const hasPic = /pic\.twitter\.com|t\.co\//i.test(trimmed)
    const hasHash = /#[a-z0-9_]+/i.test(trimmed)
    return (hasHandle && (hasHash || hasPic)) || hasPic
  }
  paragraphs.forEach((p, idx) => {
    let htmlFrag = p.innerHTML
    if (htmlFrag.includes('3-6') || htmlFrag.includes('3-6 6-1')) {
      console.log('Paragraph before cleanup', idx, htmlFrag)
    }
  sponsorPatterns.forEach((re) => (htmlFrag = htmlFrag.replace(re, '')))
    if (htmlFrag.includes('3-6') || htmlFrag.includes('6-1')) console.log(' after sponsor clean', idx, htmlFrag)
  htmlFrag = htmlFrag.replace(emojiRegex, '')
    if (htmlFrag.includes('3-6') || htmlFrag.includes('6-1')) console.log(' after emoji clean', idx, htmlFrag)
  htmlFrag = htmlFrag.replace(smartQuoteEntityRegex, '"')
    if (htmlFrag.includes('3-6') || htmlFrag.includes('6-1')) console.log(' after smart quotes', idx, htmlFrag)
  htmlFrag = htmlFrag.replace(dashEntities, (m, g1) => (g1 === 'mdash' ? '—' : '–'))
    if (htmlFrag.includes('3-6') || htmlFrag.includes('6-1')) console.log(' after dash entity', idx, htmlFrag)
  htmlFrag = htmlFrag.replace(/\s+/g, ' ').trim()
    if (htmlFrag.includes('3-6') || htmlFrag.includes('6-1')) console.log(' after whitespace', idx, htmlFrag)
    if (!htmlFrag) {
      p.remove()
      return
    }
    if (htmlFrag.includes('3-6')) {
      console.log('Paragraph after cleanup branch calc', idx, htmlFrag)
    }
    if (quoteHeuristic(htmlFrag)) {
      const wrapper = p.ownerDocument!.createElement('div')
      wrapper.className = 'ext-quote'
      const block = p.ownerDocument!.createElement('blockquote')
      block.innerHTML = htmlFrag
      wrapper.appendChild(block)
      p.replaceWith(wrapper)
    } else if (isSocialLike(htmlFrag)) {
      const wrapper = p.ownerDocument!.createElement('div')
      wrapper.className = 'ext-social'
      const inner = p.ownerDocument!.createElement('p')
      inner.innerHTML = htmlFrag
      wrapper.appendChild(inner)
      p.replaceWith(wrapper)
    } else {
      p.innerHTML = htmlFrag
    }
  })

  summary('after paragraph cleanup')

  const bodyHtml = container.innerHTML
  let cleanedBodyHtml = bodyHtml ? bodyHtml.replace(/\{\{[^{}]{0,120}\}\}/g, '') : undefined
  summary('after final cleanup')
  console.log('final paragraph HTML:', Array.from((new JSDOM(cleanedBodyHtml || '')).window.document.querySelectorAll('p')).find((p) => p.textContent?.includes('fought for'))?.innerHTML)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
