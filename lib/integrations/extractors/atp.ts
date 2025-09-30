import { JSDOM } from 'jsdom'
import { detectChallenge, type ChallengeDetection } from '../util/challenge-detector'

type LoaderSource = 'fetch' | 'puppeteer'

export type ATPExtracted = {
  title?: string
  bodyText?: string
  bodyHtml?: string
  authors?: string[]
  timestampText?: string
  primaryTag?: string
  tagline?: string
  images?: string[]
  image?: string
  videos?: Array<{ title?: string; embedUrl?: string; url?: string; thumbnail?: string }>
  credits?: string
  _debug?: {
    extractor: 'atp'
    status?: number
    htmlLength?: number
    paragraphs?: number
    images?: number
    videos?: number
    loader?: LoaderSource
    htmlSavedPath?: string
    note?: string
  }
  challenge?: ChallengeDetection
}

async function loadViaFetch(url: string): Promise<{ html: string; status: number } | null> {
  const res = await fetch(url, { headers: { 'User-Agent': 'MyTennisNewsBot/1.0' } })
  if (!res.ok) return null
  const html = await res.text()
  return { html, status: res.status }
}

async function loadViaPuppeteer(url: string): Promise<string | null> {
  let browser: import('puppeteer').Browser | null = null
  try {
    const puppeteerModule = await import('puppeteer')
    const puppeteer = puppeteerModule.default ?? puppeteerModule
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    const waitUntil = (process.env.INGEST_ATP_PUPPETEER_WAIT || 'networkidle2') as
      | 'load'
      | 'domcontentloaded'
      | 'networkidle0'
      | 'networkidle2'
    const timeoutMs = Math.max(10000, parseInt(process.env.INGEST_ATP_PUPPETEER_TIMEOUT || '45000', 10))
    await page.goto(url, { waitUntil, timeout: timeoutMs })
    const extraWait = Math.max(0, parseInt(process.env.INGEST_ATP_PUPPETEER_EXTRA_WAIT || '0', 10))
    if (extraWait) {
      await new Promise((resolve) => setTimeout(resolve, extraWait))
    }
    const html = await page.content()
    return html
  } catch {
    return null
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        /* ignore */
      }
    }
  }
}

// Focused extractor for atptour.com articles (News / Tournament reports)
export async function extractATP(url: string): Promise<ATPExtracted | null> {
  try {
    const headlessPrimary = process.env.INGEST_ATP_USE_PUPPETEER !== 'false'
    let loader: LoaderSource = headlessPrimary ? 'puppeteer' : 'fetch'
    let status: number | undefined
    let html: string | null = null
    let lastChallenge: ChallengeDetection | null = null

    if (headlessPrimary) {
      const headlessHtml = await loadViaPuppeteer(url)
      if (headlessHtml) {
        const challenge = detectChallenge(headlessHtml)
        if (challenge) {
          console.warn('[extract:atp] challenge via puppeteer', challenge, { url })
          lastChallenge = challenge
        } else {
          html = headlessHtml
        }
      }
    }

    if (!html) {
      const fetched = await loadViaFetch(url)
      if (fetched) {
        status = fetched.status
        const challenge = detectChallenge(fetched.html)
        if (challenge) {
          console.warn('[extract:atp] challenge via fetch', challenge, { url, status })
          lastChallenge = challenge
        } else {
          html = fetched.html
          loader = 'fetch'
        }
      }
    }

    if (!html && !headlessPrimary) {
      const headlessHtml = await loadViaPuppeteer(url)
      if (headlessHtml) {
        const challenge = detectChallenge(headlessHtml)
        if (challenge) {
          console.warn('[extract:atp] challenge via fallback puppeteer', challenge, { url })
          lastChallenge = challenge
        } else {
          html = headlessHtml
          loader = 'puppeteer'
        }
      }
    }

    if (!html) {
      if (lastChallenge) {
        return {
          challenge: lastChallenge,
          _debug: {
            extractor: 'atp',
            status,
            loader,
            note: `challenge:${lastChallenge.type}`,
          },
        }
      }
      return null
    }

    let dom = new JSDOM(html)
    let doc = dom.window.document

  const title = doc.querySelector('h1, h2')?.textContent?.trim() || doc.title || undefined
  // Capture headline-adjacent metadata before stripping
  const primaryTag = doc.querySelector('.tag')?.textContent?.trim() || undefined
  const tagline = doc.querySelector('.tagline')?.textContent?.trim() || undefined

    // Prefer explicit ATP structural classes
    let container =
      (doc.querySelector('.atp_article') as HTMLElement | null) ||
      (doc.querySelector('article') as HTMLElement | null) ||
      (doc.querySelector("[class*='article']") as HTMLElement | null) ||
      (doc.querySelector('main') as HTMLElement | null) ||
      doc.body

    const ensureContainer = async () => {
      const textLength = container?.textContent?.trim().length ?? 0
      if (textLength > 0) return
      if (loader === 'fetch') {
        const headlessHtml = await loadViaPuppeteer(url)
        if (!headlessHtml) return
        html = headlessHtml
        loader = 'puppeteer'
        dom = new JSDOM(html)
        doc = dom.window.document
        container =
          (doc.querySelector('.atp_article') as HTMLElement | null) ||
          (doc.querySelector('article') as HTMLElement | null) ||
          (doc.querySelector("[class*='article']") as HTMLElement | null) ||
          (doc.querySelector('main') as HTMLElement | null) ||
          doc.body
      } else {
        const fetched = await loadViaFetch(url)
        if (!fetched) return
        html = fetched.html
        status = fetched.status
        loader = 'fetch'
        dom = new JSDOM(html)
        doc = dom.window.document
        container =
          (doc.querySelector('.atp_article') as HTMLElement | null) ||
          (doc.querySelector('article') as HTMLElement | null) ||
          (doc.querySelector("[class*='article']") as HTMLElement | null) ||
          (doc.querySelector('main') as HTMLElement | null) ||
          doc.body
      }
    }

    if (!container || !(container.textContent?.trim())) {
      await ensureContainer()
    }

    if (!container) return null

    // Remove ATP head-to-head landing/statistics composite blocks (cause template artifacts)
    // Known wrappers / markers: .atp_h2h-landing, .h2h-content, elements with classes beginning with atp_head2head
    Array.from(container.querySelectorAll('.atp_h2h-landing, .h2h-content, [class*="atp_head2head"], .h2h-data, .h2h-content *'))
      .forEach((el) => {
        const root = el.closest('.atp_h2h-landing, .h2h-content')
        if (root) {
          root.remove()
          return
        }
        el.remove()
      })

    Array.from(container.querySelectorAll('.atp_h2h-landing, .atp_h2h-landing *')).forEach((el) => {
      const landing = el.closest('.atp_h2h-landing')
      if (landing) landing.remove()
    })

  // Remove global noise early (but keep iframes long enough to capture recognized embeds)
  container.querySelectorAll('script, style, nav, aside, noscript, form').forEach((el) => el.remove())

    Array.from(container.querySelectorAll('.atp_social, .atp_social *')).forEach((node) => {
      const bar = node.closest('.atp_social')
      if (bar) bar.remove()
    })
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
          '.atp_social', /* explicit social share bar */
          '.newsletter-signup',
          '.ad-container',
          '.advertisement',
        ].join(', ')
      )
      .forEach((el) => el.remove())

    // Identify cutoff markers such as embedded newsletter script placeholders
    const rawHTMLBeforeCleanup = container.innerHTML
    // Cut off content at first [NEWSLETTER FORM] marker if present
    const markerNode = Array.from(container.querySelectorAll('p, div')).find((n) =>
      /\[NEWSLETTER FORM\]/i.test(n.textContent || '')
    )
    if (markerNode) {
      let sib = markerNode
      while (sib && sib.nextSibling) {
        sib.parentNode?.removeChild(sib.nextSibling)
      }
      markerNode.parentNode?.removeChild(markerNode)
    }
    // Remove placeholder artifacts like [ATP APP] (newsletter already removed)
    container.querySelectorAll('p').forEach((p) => {
      if (/\[(ATP APP)\]/i.test(p.textContent || '')) p.remove()
    })

  // Remove duplicated headline metadata blocks from body container early to avoid repeating after lead image rendering.
  Array.from(container.querySelectorAll('.tag, .tagline, .timestamp, .main-video-content')).forEach((el) => el.remove())

  // Collect primary media (main image & credit block)
    const mainImageEl = container.querySelector('.main-image img, img') as HTMLImageElement | null
    const ogImage =
      doc.querySelector("meta[property='og:image']")?.getAttribute('content') ||
      mainImageEl?.getAttribute('src') ||
      undefined

    // Build image list (normalize relative URLs) BEFORE media pruning
    const imageOrigin = 'https://www.atptour.com/'
    const normalizeImageSrc = (src: string) => {
      const abs = src.startsWith('http') ? src : new URL(src, imageOrigin).toString()
      return abs.replace(/[#?].*$/, '')
    }

    Array.from(container.querySelectorAll('a[href*="it-all-adds-up-hub" i]')).forEach((a) => {
      const wrapper = a.closest('p, div, section, figure')
      if (wrapper) wrapper.remove()
      else a.remove()
    })

    Array.from(container.querySelectorAll('img[alt*="it all adds up" i]')).forEach((img) => {
      const wrapper = img.closest('p, div, section, figure, a')
      if (wrapper) wrapper.remove()
      else img.remove()
    })

    Array.from(container.querySelectorAll('a[href*="/apps" i]')).forEach((a) => {
      const href = a.getAttribute('href') || ''
      const alt = a.querySelector('img')?.getAttribute('alt') || ''
      if (/atp[\s|-]*wta\s+live\s+app/i.test(alt) || /utm_campaign=app_banner/i.test(href)) {
        const wrapper = a.closest('p, div, section, figure')
        if (wrapper) wrapper.remove()
        else a.remove()
      }
    })

    const seenImages = new Set<string>()
    const orderedImages: string[] = []
    Array.from(container.querySelectorAll('img')).forEach((img) => {
      const rawSrc = img.getAttribute('src') || ''
      if (!rawSrc || rawSrc.startsWith('data:')) {
        const wrapper = img.closest('figure, picture, div, p')
        if (wrapper && wrapper.querySelectorAll('img').length === 1) wrapper.remove()
        else img.remove()
        return
      }
      let abs: string
      try {
        abs = rawSrc.startsWith('http') ? rawSrc : new URL(rawSrc, imageOrigin).toString()
      } catch {
        img.remove()
        return
      }
      const key = normalizeImageSrc(abs)
      if (seenImages.has(key)) {
        const wrapper = img.closest('figure, picture, div, p')
        if (wrapper && wrapper.querySelectorAll('img').length === 1) wrapper.remove()
        else img.remove()
        return
      }
      seenImages.add(key)
      orderedImages.push(abs)
      img.setAttribute('src', abs)
    })
    let images = orderedImages

  // Extract inline video gallery cards (card-link--video) and iframe players
  const videos: ATPExtracted['videos'] = []
    Array.from(doc.querySelectorAll('.card-link--video') as NodeListOf<HTMLAnchorElement>).forEach((a) => {
      const thumb = a.querySelector('img')?.getAttribute('src')
      const titleNode = a.querySelector('.title')
      const vtitle = titleNode?.textContent?.trim() || undefined
      // Videos on ATP are not simple iframes; keep link as embed reference
      if (thumb || vtitle) {
        const absThumb = thumb ? (thumb.startsWith('http') ? thumb : new URL(thumb, 'https://www.atptour.com/').toString()) : undefined
        const href = a.getAttribute('href') || undefined
        const absHref = href ? (href.startsWith('http') ? href : new URL(href, 'https://www.atptour.com/').toString()) : undefined
        videos.push({ title: vtitle, thumbnail: absThumb, url: absHref })
      }
    })
    // Convert Brightcove video-js blocks to embeddable iframes
    Array.from(container.querySelectorAll('video-js[data-video-id]') as NodeListOf<HTMLElement>).forEach((vj) => {
      const account = vj.getAttribute('data-account') || ''
      const player = vj.getAttribute('data-player') || ''
      const videoId = vj.getAttribute('data-video-id') || ''
      if (!account || !player || !videoId) return
      // Build Brightcove iframe URL
      const src = `https://players.brightcove.net/${account}/${player}/index.html?videoId=${encodeURIComponent(videoId)}`
      const iframe = vj.ownerDocument!.createElement('iframe')
      iframe.setAttribute('src', src)
      iframe.setAttribute('title', 'Brightcove Player')
      iframe.setAttribute('allow', 'encrypted-media; fullscreen; picture-in-picture')
      iframe.setAttribute('allowfullscreen', 'true')
      iframe.setAttribute('frameborder', '0')
      iframe.setAttribute('width', '560')
      iframe.setAttribute('height', '315')
      const wrap = vj.ownerDocument!.createElement('div')
      wrap.className = 'ext-video ext-brightcove'
      wrap.appendChild(iframe)
      vj.replaceWith(wrap)
      videos.push({ title: 'Brightcove Video', embedUrl: src, url: src, thumbnail: undefined })
    })

    // Capture recognized iframe embeds (Brightcove / YouTube / Twitter) and replace unknowns only
    Array.from(container.querySelectorAll('iframe') as NodeListOf<HTMLIFrameElement>).forEach((iframe) => {
      const src = iframe.getAttribute('src') || ''
      if (!src) return
      const isBrightcove = /players\.brightcove\.net/i.test(src)
      const isYouTube = /youtube\.com|youtu\.be/i.test(src)
      const isTwitter = /platform\.twitter\.com\/embed\/Tweet\.html|twitter\.com|x\.com/i.test(src)
      if (isTwitter) {
        // Keep Twitter iframe as-is; renderer will wrap appropriately
        return
      }
      if (!(isBrightcove || isYouTube)) {
        // Remove non-whitelisted iframe entirely
        iframe.remove()
        return
      }
      let videoId: string | undefined
      if (isBrightcove) {
        try {
          const u = new URL(src)
          videoId = u.searchParams.get('videoId') || undefined
        } catch {}
      } else if (isYouTube) {
        try {
          const u = new URL(src)
          if (u.searchParams.get('v')) videoId = u.searchParams.get('v') || undefined
          else if (/\/embed\/(.+)/.test(u.pathname)) videoId = u.pathname.split('/embed/')[1]?.split(/[?&#]/)[0]
        } catch {}
      }
      videos.push({ embedUrl: src, url: src, title: isYouTube ? 'YouTube Video' : isBrightcove ? 'Video' : undefined })
      // For Brightcove/YouTube iframes present directly, keep them – do not downgrade to link here.
      // Ensure they are wrapped for styling consistency
      const wrap = iframe.ownerDocument!.createElement('div')
      wrap.className = isBrightcove ? 'ext-video ext-brightcove' : 'ext-video ext-youtube'
      iframe.replaceWith(wrap)
      wrap.appendChild(iframe)
    })

    // Authors & byline
    const authors: string[] = []
    const authorMeta = doc.querySelector("meta[name='author']")?.getAttribute('content')
    if (authorMeta) authors.push(authorMeta)
    const bylineCandidate = doc.querySelector('.photoBy, .byline, [class*="byline"], .main-video-content .photoBy')?.textContent || ''
    if (bylineCandidate) {
      const match = bylineCandidate.match(/by\s+([A-Z][A-Za-z\s.'-]+)/i)
      if (match && match[1]) authors.push(match[1].trim())
      else authors.push(bylineCandidate.trim())
    }
    const dedupedAuthors = Array.from(new Set(authors.map((a) => a.trim()).filter(Boolean)))

    const timestampText =
      doc.querySelector('.timestamp')?.textContent?.trim() ||
      doc.querySelector('time')?.textContent?.trim() ||
      undefined

    // Credits: within image-credit or caption elements
    let credits: string | undefined
    const creditNode = container.querySelector('.image-credit, .credit, .credits, figcaption, .main-video-content .image-credit')
    if (creditNode?.textContent) credits = creditNode.textContent.trim()
    if (!credits) {
      const possible = Array.from(container.querySelectorAll('p, span')).find((el) => /credit|getty|reuters|ap photo/i.test(el.textContent || ''))
      if (possible) credits = possible.textContent?.trim()
    }

    // Normalize relative asset & anchor URLs in-place for bodyHtml fidelity
    Array.from(container.querySelectorAll('img') as NodeListOf<HTMLImageElement>).forEach((img) => {
      const src = img.getAttribute('src')
      if (src && !/^https?:/i.test(src)) {
        try { img.setAttribute('src', new URL(src, 'https://www.atptour.com/').toString()) } catch {}
      }
    })
    Array.from(container.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>).forEach((a) => {
      const href = a.getAttribute('href')
      if (href && /^\//.test(href)) {
        try { a.setAttribute('href', new URL(href, 'https://www.atptour.com/').toString()) } catch {}
      }
    })

    // Restore client-rendered numeric placeholders (points, ranks, scores) from any data-* attributes, aria-label, or title.
    // Broad strategy:
    // - If an element's visible text is empty or only punctuation like '-' '+' ',' '(' ')', hydrate it from any numeric-bearing attribute.
    // - Preserve explicit sign characters ('+' / '−' / '-') and ordinal suffixes ('st','nd','rd','th') when present in current text.
    const isOnlyPunctuation = (s: string) => /^[\s,.;:–—()\[\]{}|/*+\-\s]*$/.test(s)
    const pickNumericToken = (val: string): string | undefined => {
      // Matches numbers, optional thousands separators, ranges (3-6), lists (3-6, 6-1, 7-5)
      const m = val.match(/\d{1,4}(?:[.,]\d{1,3})?(?:\s*[–—-]\s*\d{1,4}(?:[.,]\d{1,3})?)*(?:\s*,\s*\d{1,4}(?:[.,]\d{1,3})?(?:\s*[–—-]\s*\d{1,4}(?:[.,]\d{1,3})?)*)*/)
      return m ? m[0] : undefined
    }
    const allEls = Array.from(container.querySelectorAll('*')) as Element[]
    allEls.forEach((el) => {
      let current = (el.textContent || '').trim()
      // If current has non-punctuation, skip
      if (current && !isOnlyPunctuation(current)) return
      // Search attributes on element for numeric tokens
      let injected: string | undefined
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('data-') || name === 'aria-label' || name === 'title') {
          const v = attr.value || ''
          const found = pickNumericToken(v)
          if (found) { injected = found; break }
        }
      }
      if (!injected) return
      // Preserve sign if present in current punctuation content (e.g., '+' or '−')
      const hasPlus = /\+/.test(current)
      const hasMinus = /−|(^|\s)-(\s|$)/.test(current)
      const sign = hasPlus ? '+' : hasMinus ? '-' : ''
      // Preserve ordinal suffix if the element currently contains only the suffix (e.g., 'th')
      const ordMatch = current.match(/\b(st|nd|rd|th)\b/i)
      if (ordMatch && /^([stndrh]|th)+$/i.test(current.replace(/\s+/g, ''))) {
        el.textContent = `${injected}${ordMatch[1].toLowerCase()}`
      } else {
        el.textContent = sign ? `${sign}${injected}` : injected
      }
    })

    // Secondary pass: within each paragraph, if we still see clearly empty numeric slots like '( )' or '(,)' etc.,
    // and the paragraph contains exactly one numeric token in any descendant attributes, inject it into the first empty slot.
    Array.from(container.querySelectorAll('p, strong, em')).forEach((p) => {
      const txt = p.textContent || ''
      if (!/[()]/.test(txt)) return
      const hasDigits = /\d/.test(txt)
      if (hasDigits) return // nothing to do
      // Collect candidate tokens from descendant attributes
      let candidate: string | undefined
      Array.from(p.querySelectorAll('*')).some((d) => {
        for (const attr of Array.from(d.attributes)) {
          const name = attr.name.toLowerCase()
          if (name.startsWith('data-') || name === 'aria-label' || name === 'title') {
            const tok = pickNumericToken(attr.value || '')
            if (tok) { candidate = tok; return true }
          }
        }
        return false
      })
      if (candidate) {
        p.innerHTML = p.innerHTML.replace(/\((?:\s|,|&nbsp;)*\)/, `(${candidate})`)
      }
    })

    // After structural removals process paragraphs for quotes / sponsors / social
    const paragraphs = Array.from(container.querySelectorAll('p'))
    const sponsorPatterns = [
      /lexus/gi,
      /infosys/gi,
      /emirates/gi,
      /rolex/gi,
    ]
  const emojiRegex = /[\p{Extended_Pictographic}\u200d\uFE0F\u20E3]/gu
    const smartQuoteEntityRegex = /&(ldquo|rdquo|lsquo|rsquo);/gi
    const dashEntities = /&(mdash|ndash);/gi
    // Stricter quote heuristic: only treat as quote if wrapped in leading & trailing quote characters.
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
    paragraphs.forEach((p) => {
      let htmlFrag = p.innerHTML
      sponsorPatterns.forEach((re) => (htmlFrag = htmlFrag.replace(re, '')))
      htmlFrag = htmlFrag.replace(emojiRegex, '')
      htmlFrag = htmlFrag.replace(smartQuoteEntityRegex, '"')
      htmlFrag = htmlFrag.replace(dashEntities, (m, g1) => (g1 === 'mdash' ? '—' : '–'))
      htmlFrag = htmlFrag.replace(/\s+/g, ' ').trim()
      if (!htmlFrag) {
        p.remove()
        return
      }
      if (quoteHeuristic(htmlFrag)) {
        const wrapper = p.ownerDocument!.createElement('div')
        wrapper.className = 'ext-quote'
        const block = p.ownerDocument!.createElement('blockquote')
        const trimmed = htmlFrag.trim()
        const unitalic = /^(?:<(?:em|i)>)+[\s\S]*?(?:<\/(?:em|i)>)+$/i.test(trimmed)
          ? trimmed.replace(/<\/?(?:em|i)>/gi, '').trim()
          : htmlFrag
        block.innerHTML = unitalic
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
    const serializedBlocks = Array.from(container.querySelectorAll('p, blockquote'))
    const bodyText =
      serializedBlocks
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join('\n\n') || undefined
    const bodyHtml = container.innerHTML || undefined

    // Final scrub: remove leftover handlebars/Angular-esque tokens like {{player.X}} that slipped through
    let cleanedBodyHtml = bodyHtml ? bodyHtml.replace(/\{\{[^{}]{0,120}\}\}/g, '') : undefined
    if (cleanedBodyHtml && /atp_head2head|h2h/i.test(cleanedBodyHtml)) {
      // Defensive: if any nested H2H remnants remain (hidden inputs etc.), strip them explicitly
      cleanedBodyHtml = cleanedBodyHtml
        .replace(/<input[^>]*atp_head2head[^>]*>/gi, '')
        .replace(/<div[^>]*class="[^"]*(?:atp_h2h-landing|h2h-content)[^>]*>[\s\S]*?<\/div>/gi, '')
    }

    const debug: ATPExtracted['_debug'] = {
      extractor: 'atp',
      status,
      htmlLength: html.length,
      paragraphs: paragraphs.length,
      images: images.length,
      videos: videos.length,
      loader,
    }

    if (process.env.INGEST_DEBUG_SAVE_HTML === 'true') {
      try {
        const { writeFile, mkdir } = await import('node:fs/promises')
        const path = await import('node:path')
        const crypto = await import('node:crypto')
        const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)
        const dir = path.resolve(process.cwd(), '.debug', 'html', 'atp')
        await mkdir(dir, { recursive: true })
        const file = path.join(dir, `${hash}.html`)
        const max = Math.max(0, parseInt(process.env.INGEST_DEBUG_MAX_HTML || '200000', 10))
        const content = max ? html.slice(0, max) : html
        await writeFile(file, content, 'utf8')
        debug.htmlSavedPath = file
      } catch {}
    }

    return {
      title,
      bodyText,
      bodyHtml: cleanedBodyHtml,
      authors: dedupedAuthors.length ? dedupedAuthors : undefined,
      timestampText,
      primaryTag,
      tagline,
      image: ogImage,
      images: images.length ? images : undefined,
  videos: videos.length ? videos : undefined,
      credits,
      _debug: debug,
    }
  } catch {
    return null
  }
}
