import { JSDOM } from 'jsdom'
import sanitizeHtml from 'sanitize-html'
import { detectChallenge, type ChallengeDetection } from '../util/challenge-detector'

type LoaderSource = 'fetch' | 'puppeteer'

export type WTAExtracted = {
  title?: string
  excerpt?: string
  bodyHtml?: string
  bodyText?: string
  authors?: string[]
  timestampText?: string
  publishedAtIso?: string
  tags?: string[]
  image?: string
  images?: string[]
  videos?: Array<{ title?: string; embedUrl?: string; url?: string; thumbnail?: string }>
  credits?: string
  lang?: string
  _debug?: {
    extractor: 'wta'
    status?: number
    htmlLength?: number
    paragraphs?: number
    images?: number
    videos?: number
    anchors?: number
    loader?: LoaderSource
    sanitized?: boolean
    htmlSavedPath?: string
    note?: string
  }
  challenge?: ChallengeDetection
}

const ORIGIN = 'https://www.wtatennis.com'

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
    const TimeoutError = (puppeteerModule as any).errors?.TimeoutError
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()
    const waitUntil = (process.env.INGEST_WTA_PUPPETEER_WAIT || 'domcontentloaded') as
      | 'load'
      | 'domcontentloaded'
      | 'networkidle0'
      | 'networkidle2'
    const timeoutMs = Math.max(1000, parseInt(process.env.INGEST_WTA_PUPPETEER_TIMEOUT || '4500', 10))
    let html: string | null = null
    try {
      await page.goto(url, { waitUntil, timeout: timeoutMs })
    } catch (err) {
      if (!TimeoutError || !(err instanceof TimeoutError)) {
        throw err
      }
    }
  await page.waitForSelector('[data-player]', { timeout: timeoutMs }).catch(() => undefined)
  const extraWait = Math.max(0, parseInt(process.env.INGEST_WTA_PUPPETEER_EXTRA_WAIT || '0', 10))
    if (extraWait) {
      await new Promise((resolve) => setTimeout(resolve, extraWait))
    }
    try {
      html = await page.content()
    } catch {
      html = null
    }
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

function resolveBodyContainer(doc: Document): HTMLElement {
  return (
    (doc.querySelector('.js-article-body') as HTMLElement | null) ||
    (doc.querySelector('.article-page__body') as HTMLElement | null) ||
    (doc.querySelector('article.article-page') as HTMLElement | null) ||
    (doc.querySelector('article') as HTMLElement | null) ||
    doc.body
  )
}

const defaultAllowedAttributes = (sanitizeHtml.defaults.allowedAttributes || {}) as Record<string, string[]>

const SANITIZE_ALLOWED_TAGS = Array.from(
  new Set([...sanitizeHtml.defaults.allowedTags, 'figure', 'figcaption', 'iframe', 'br'])
)

const SANITIZE_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  ...defaultAllowedAttributes,
  a: Array.from(new Set([...(defaultAllowedAttributes.a || []), 'href', 'rel', 'target'])),
  img: Array.from(
    new Set([...(defaultAllowedAttributes.img || []), 'src', 'alt', 'title', 'width', 'height', 'loading'])
  ),
  iframe: ['src', 'title', 'allow', 'allowfullscreen', 'width', 'height'],
  figure: ['data-caption'],
}

const SANITIZE_ALLOWED_CLASSES: sanitizeHtml.IOptions['allowedClasses'] = {
  blockquote: ['twitter-tweet'],
}

const SANITIZE_IFRAME_HOSTS = [
  'www.youtube.com',
  'player.vimeo.com',
  'w.soundcloud.com',
  'www.dailymotion.com',
  'www.instagram.com',
  'platform.twitter.com',
]

function sanitizeBodyHtml(html: string): string {
  if (!html) return ''
  return sanitizeHtml(html, {
    allowedTags: SANITIZE_ALLOWED_TAGS,
    allowedAttributes: SANITIZE_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowedIframeHostnames: SANITIZE_IFRAME_HOSTS,
    allowedClasses: SANITIZE_ALLOWED_CLASSES,
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href?.trim()
        if (!href) {
          return { tagName: 'span', attribs: {} }
        }
        const relTokens = new Set<string>()
        if (attribs.rel) {
          attribs.rel
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean)
            .forEach((token) => relTokens.add(token))
        }
        relTokens.add('noopener')
        relTokens.add('noreferrer')
        const resultAttribs: Record<string, string> = {
          href,
          rel: Array.from(relTokens).join(' '),
        }
        if (attribs.target === '_blank') {
          resultAttribs.target = '_blank'
        }
        return { tagName: 'a', attribs: resultAttribs }
      },
      iframe: (_tagName, attribs) => {
        const src = attribs.src?.trim()
        if (!src) {
          return { tagName: 'div', attribs: {} }
        }
        const resultAttribs: Record<string, string> = { src }
        if (attribs.title) resultAttribs.title = attribs.title
        if (attribs.allow) resultAttribs.allow = attribs.allow
        if (attribs.allowfullscreen) resultAttribs.allowfullscreen = 'true'
        if (attribs.width) resultAttribs.width = attribs.width
        if (attribs.height) resultAttribs.height = attribs.height
        return { tagName: 'iframe', attribs: resultAttribs }
      },
    },
  }).trim()
}

function toAbsoluteUrl(input: string | null | undefined, base = ORIGIN): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed, base).toString()
  } catch {
    return trimmed
  }
}

function normalizeDate(input: string | undefined | null): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const cleaned = trimmed.replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1')
  const tryDates = [trimmed, cleaned]
  for (const candidate of tryDates) {
    const timestamp = Date.parse(candidate)
    if (!Number.isNaN(timestamp)) {
      return new Date(timestamp).toISOString()
    }
  }
  return undefined
}

function findDatePublishedFromLdJson(doc: Document): string | undefined {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
  const seen = new Set<string>()
  const visit = (node: any): string | undefined => {
    if (!node || typeof node !== 'object') return undefined
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item)
        if (found) return found
      }
      return undefined
    }
    if (typeof node.datePublished === 'string') return node.datePublished
    if (typeof node['@graph'] === 'object') {
      const found = visit(node['@graph'])
      if (found) return found
    }
    for (const value of Object.values(node)) {
      if (typeof value === 'string') {
        if (value.includes('T') && value.includes(':')) {
          if (!seen.has(value)) {
            seen.add(value)
            const iso = normalizeDate(value)
            if (iso) return iso
          }
        }
      } else if (typeof value === 'object') {
        const found = visit(value)
        if (found) return found
      }
    }
    return undefined
  }
  for (const script of scripts) {
    const json = script.textContent?.trim()
    if (!json) continue
    try {
      const parsed = JSON.parse(json)
      const found = visit(parsed)
      if (found) return found
    } catch {
      continue
    }
  }
  return undefined
}

function extractAuthorNames(doc: Document): string[] | undefined {
  const names = new Set<string>()
  const selectors = [
    '.article-page__content-author .name',
    '.article-page__byline .name',
    'meta[name="author"]',
  ]
  for (const selector of selectors) {
    if (selector.startsWith('meta')) {
      const meta = doc.querySelector(selector) as HTMLMetaElement | null
      const content = meta?.getAttribute('content')?.trim()
      if (content) names.add(content)
      continue
    }
    doc.querySelectorAll(selector).forEach((el) => {
      const text = el.textContent?.trim()
      if (text) names.add(text)
    })
  }
  return names.size ? Array.from(names) : undefined
}

function cleanContainer(container: HTMLElement, origin: string, doc: Document) {
  const unwrapElement = (el: Element) => {
    const parent = el.parentElement
    if (!parent) return
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el)
    }
    parent.removeChild(el)
  }

  const removalSelectors = [
    'script',
    'style',
    'noscript',
    'form',
    'svg',
    '.articleWidget',
    '.embeddable-related-articles',
    '.related-videos',
    '.responsive-ad',
    '.advert',
    '.article-page__sidebar',
    '.article-page__sidebar-item',
    '.share-widget',
    '.js-share-widget',
    '.article-page__content-author',
    '.article-page__end-marker',
    '.pager',
  ]
  container.querySelectorAll(removalSelectors.join(', ')).forEach((el) => el.remove())

  Array.from(container.querySelectorAll('[class*="player-headshot"], .article-page__player-tooltip-img')).forEach((el) =>
    el.remove()
  )

  Array.from(container.querySelectorAll('img') as NodeListOf<HTMLImageElement>).forEach((img) => {
    const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original')
    if (!img.getAttribute('src') && dataSrc) {
      img.setAttribute('src', dataSrc)
    }
    const src = img.getAttribute('src')
    if (!src) return
    const abs = toAbsoluteUrl(src, origin)
    if (abs) img.setAttribute('src', abs)
  })

  Array.from(container.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>).forEach((a) => {
    const href = a.getAttribute('href')
    if (!href) return
    const abs = toAbsoluteUrl(href, origin)
    if (abs) a.setAttribute('href', abs)
    if (!a.getAttribute('rel')) {
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })

  Array.from(container.querySelectorAll('.article-page__player-tooltip')).forEach((tooltip) => {
    const primary = tooltip.querySelector('a.article-page__player-tooltip-simple') as HTMLAnchorElement | null
    const fallback = tooltip.querySelector('a[href]') as HTMLAnchorElement | null
    const nameText = primary?.textContent?.trim() || tooltip.getAttribute('data-player-name')?.trim()
    const candidateHref = primary?.getAttribute('href') || fallback?.getAttribute('href') || tooltip.getAttribute('data-player-url')
    const cleanName = nameText || tooltip.textContent?.split('View Profile')[0]?.trim() || ''
    const href = toAbsoluteUrl(candidateHref, origin)
    if (href && cleanName) {
      const anchor = doc.createElement('a')
      anchor.setAttribute('href', href)
      anchor.setAttribute('rel', 'noopener noreferrer')
      anchor.textContent = cleanName
      tooltip.replaceWith(anchor)
    } else if (cleanName) {
      tooltip.replaceWith(doc.createTextNode(cleanName))
    } else {
      tooltip.replaceWith(doc.createTextNode(''))
    }
  })

  Array.from(container.querySelectorAll('a')).forEach((anchor) => {
    const text = anchor.textContent?.replace(/\s+/g, ' ').trim()
    if (!text) return
    if (/^view profile$/i.test(text)) {
      anchor.remove()
    }
  })

  Array.from(container.querySelectorAll('div, span, strong, em')).forEach((node) => {
    if (node.childElementCount) return
    if ((node.textContent || '').trim()) return
    node.remove()
  })

  Array.from(container.querySelectorAll('p span')).forEach((span) => {
    const hasNonWhitespaceText = Array.from(span.childNodes).some(
      (node) => node.nodeType === 3 && (node.textContent || '').trim()
    )
    if (!span.children.length || hasNonWhitespaceText) return
    if (span.childElementCount === 1) {
      unwrapElement(span)
      return
    }
    const allEmpty = Array.from(span.children).every((child) => !(child.textContent || '').trim())
    if (allEmpty) unwrapElement(span)
  })

  Array.from(container.querySelectorAll('p')).forEach((p) => {
    const anchor = p.querySelector('a[href]') as HTMLAnchorElement | null
    if (!anchor) return
    const anchorText = anchor.textContent?.trim() || ''
    const paragraphText = p.textContent?.trim() || ''
    if (!anchorText || anchorText !== paragraphText) return
    const collected: string[] = []
    let next = p.nextSibling
  while (next && next.nodeType === 3) {
      const textContent = next.textContent || ''
      if (textContent.trim()) collected.push(textContent)
      const toRemove = next
      next = next.nextSibling
      toRemove.parentNode?.removeChild(toRemove)
    }
    if (!collected.length) return
    const merged = collected.join(' ').replace(/\s+/g, ' ').trim()
    const anchorClone = anchor.cloneNode(true) as HTMLAnchorElement
    p.innerHTML = ''
    p.appendChild(anchorClone)
    p.appendChild(doc.createTextNode(` ${merged}`))
  })
}

function textFromNodes(nodes: NodeListOf<Element>): string[] {
  return Array.from(nodes)
    .map((el) => el.textContent?.trim())
    .filter((text): text is string => !!text)
}

export async function extractWTA(url: string): Promise<WTAExtracted | null> {
  try {
    const headlessPrimary = process.env.INGEST_WTA_USE_PUPPETEER !== 'false'
    let loader: LoaderSource = headlessPrimary ? 'puppeteer' : 'fetch'
    let status: number | undefined
    let html: string | null = null
    let lastChallenge: ChallengeDetection | null = null

    if (headlessPrimary) {
      const headlessHtml = await loadViaPuppeteer(url)
      if (headlessHtml) {
        const challenge = detectChallenge(headlessHtml)
        if (challenge) {
          console.warn('[extract:wta] challenge via puppeteer', challenge, { url })
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
          console.warn('[extract:wta] challenge via fetch', challenge, { url, status })
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
          console.warn('[extract:wta] challenge via fallback puppeteer', challenge, { url })
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
            extractor: 'wta',
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
    let container = resolveBodyContainer(doc)

    const ensureContainer = async (): Promise<ChallengeDetection | null> => {
      const textLength = container?.textContent?.trim().length ?? 0
      if (container && textLength > 0) return null
      const headlessHtml = await loadViaPuppeteer(url)
      if (!headlessHtml) return null
      html = headlessHtml
      const challenge = detectChallenge(html)
      if (challenge) {
        console.warn('[extract:wta] challenge detected during ensureContainer', challenge, { url })
        lastChallenge = challenge
        return challenge
      }
      loader = 'puppeteer'
      dom = new JSDOM(html)
      doc = dom.window.document
      container = resolveBodyContainer(doc)
      return null
    }

    if (!container || !(container.textContent?.trim())) {
      const ensureChallenge = await ensureContainer()
      if (ensureChallenge) {
        return {
          challenge: ensureChallenge,
          _debug: {
            extractor: 'wta',
            status,
            loader: 'puppeteer',
            note: `challenge:${ensureChallenge.type}`,
          },
        }
      }
    }

    if (!container) {
      if (lastChallenge) {
        return {
          challenge: lastChallenge,
          _debug: {
            extractor: 'wta',
            status,
            loader,
            note: `challenge:${lastChallenge.type}`,
          },
        }
      }
      return null
    }

    const origin = new URL(url).origin || ORIGIN
    cleanContainer(container, origin, doc)

  let rawInnerHtml = container.innerHTML || ''
  let sanitizedHtml = sanitizeBodyHtml(rawInnerHtml)

    const needsPlayerAnchors = loader === 'fetch' && /View Profile/i.test(rawInnerHtml)

    if (!sanitizedHtml || needsPlayerAnchors) {
      if (loader === 'puppeteer') {
        const fetched = await loadViaFetch(url)
        if (fetched) {
          html = fetched.html
          status = fetched.status
          const challenge = detectChallenge(html)
          if (challenge) {
            console.warn('[extract:wta] challenge detected during ensureContainer fetch', challenge, { url, status })
            lastChallenge = challenge
            return {
              challenge,
              _debug: {
                extractor: 'wta',
                status,
                loader: 'fetch',
                note: `challenge:${challenge.type}`,
              },
            }
          }
          loader = 'fetch'
          dom = new JSDOM(html)
          doc = dom.window.document
          container = resolveBodyContainer(doc)
          if (container) {
            cleanContainer(container, origin, doc)
            sanitizedHtml = sanitizeBodyHtml(container.innerHTML || '')
          }
        }
      } else {
        const headlessHtml = await loadViaPuppeteer(url)
        if (headlessHtml) {
          html = headlessHtml
          const challenge = detectChallenge(html)
          if (challenge) {
            console.warn('[extract:wta] challenge detected during sanitize fallback', challenge, { url })
            lastChallenge = challenge
            return {
              challenge,
              _debug: {
                extractor: 'wta',
                status,
                loader: 'puppeteer',
                note: `challenge:${challenge.type}`,
              },
            }
          }
          loader = 'puppeteer'
          dom = new JSDOM(html)
          doc = dom.window.document
          container = resolveBodyContainer(doc)
          if (container) {
            cleanContainer(container, origin, doc)
            rawInnerHtml = container.innerHTML || ''
            sanitizedHtml = sanitizeBodyHtml(rawInnerHtml)
          }
        }
      }
    }

    let bodyHtml: string | undefined = sanitizedHtml || undefined
    let bodyText: string | undefined
    let paragraphCount = 0
    let anchorCount = 0
    let sanitizedDoc: Document | null = null

    if (bodyHtml) {
      const sanitizedDom = new JSDOM(`<body>${bodyHtml}</body>`)
      sanitizedDoc = sanitizedDom.window.document
      const textSegments = Array.from(sanitizedDoc.querySelectorAll('p, li, blockquote'))
        .map((el) => el.textContent?.trim())
        .filter((text): text is string => !!text)
      paragraphCount = textSegments.length
      bodyText = textSegments.join('\n\n') || undefined
      anchorCount = sanitizedDoc.querySelectorAll('a[href]').length
    } else {
      const textSegments = Array.from(container.querySelectorAll('p, li, blockquote'))
        .map((el) => el.textContent?.trim())
        .filter((text): text is string => !!text)
      paragraphCount = textSegments.length
      bodyText = textSegments.join('\n\n') || undefined
    }

    const lang = doc.documentElement.lang || undefined
    const title =
      doc.querySelector('.article-page__header-title')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      doc.title ||
      undefined
    const excerpt =
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      undefined

    const tagNodes = doc.querySelectorAll('.article-page__header-content .badge__label')
    const tags = textFromNodes(tagNodes)

    const timestampNodes = Array.from(doc.querySelectorAll('.article-page__header-publishdate'))
    let timestampText: string | undefined
    let publishedAtIso: string | undefined
    for (const node of timestampNodes) {
      const text = node.textContent?.trim()
      if (!text) continue
      if (!timestampText) timestampText = text
      if (!publishedAtIso) {
        if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text)) {
          publishedAtIso = normalizeDate(text)
        }
      }
    }

    if (!publishedAtIso) {
      const metaCandidates = [
        doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content'),
        doc.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content'),
        doc.querySelector('meta[name="datePublished"]')?.getAttribute('content'),
        doc.querySelector('meta[name="publish-date"]')?.getAttribute('content'),
      ]
      for (const candidate of metaCandidates) {
        const iso = normalizeDate(candidate || undefined)
        if (iso) {
          publishedAtIso = iso
          break
        }
      }
    }

    if (!publishedAtIso) {
      const ldIso = findDatePublishedFromLdJson(doc)
      if (ldIso) publishedAtIso = ldIso
    }

    const authors = extractAuthorNames(doc)

    const imageMeta = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const image = toAbsoluteUrl(imageMeta, origin)
    const imageSet = new Set<string>()
    if (image) imageSet.add(image)
    const imageSource: Document | Element = sanitizedDoc ?? container
    Array.from(imageSource.querySelectorAll('img')).forEach((img) => {
      const src = (img as HTMLImageElement).getAttribute('src')
      const abs = toAbsoluteUrl(src, origin)
      if (abs) imageSet.add(abs)
    })
    const images = imageSet.size ? Array.from(imageSet) : undefined

    const videos: WTAExtracted['videos'] = []
    Array.from(doc.querySelectorAll('[data-video-info]') as NodeListOf<HTMLElement>).forEach((node) => {
      const data = node.getAttribute('data-video-info')
      if (!data) return
      try {
        const parsed = JSON.parse(data)
        const thumbnail = toAbsoluteUrl(parsed?.thumbnailUrl || parsed?.thumbnail?.onDemandUrl, origin)
        const mediaId = parsed?.mediaId || parsed?.mediaGuid
        const accountId = parsed?.accountId || parsed?.account
        const playerId = node.getAttribute('data-player-id') || 'default'
        let embedUrl: string | undefined
        if (accountId && mediaId) {
          embedUrl = `https://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${encodeURIComponent(mediaId)}`
        }
        videos.push({
          title: parsed?.title,
          embedUrl,
          url: embedUrl,
          thumbnail,
        })
      } catch {
        /* ignore */
      }
    })

    const creditsCandidate = doc.querySelector(
      '.article-page__header-image-wrapper figcaption, .article-page__header-caption, .article-page__header-credit'
    )
    const credits = creditsCandidate?.textContent?.trim() || undefined

    const debug: WTAExtracted['_debug'] = {
      extractor: 'wta',
      status,
      htmlLength: html.length,
      paragraphs: paragraphCount,
      images: images?.length || 0,
      videos: videos?.length || 0,
      anchors: anchorCount,
      loader,
      sanitized: !!bodyHtml,
    }

    if (process.env.INGEST_DEBUG_RAW === 'true') {
      debug.note = (rawInnerHtml || '').slice(0, 2000)
    }

    if (process.env.INGEST_DEBUG_SAVE_HTML === 'true') {
      try {
        const { mkdir, writeFile } = await import('node:fs/promises')
        const path = await import('node:path')
        const crypto = await import('node:crypto')
        const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)
        const dir = path.resolve(process.cwd(), '.debug', 'html', 'wta')
        await mkdir(dir, { recursive: true })
        const file = path.join(dir, `${hash}.html`)
        const max = Math.max(0, parseInt(process.env.INGEST_DEBUG_MAX_HTML || '200000', 10))
        const snippet = max ? html.slice(0, max) : html
        await writeFile(file, snippet, 'utf8')
        debug.htmlSavedPath = file
      } catch {
        /* swallow */
      }
    }

    return {
      title,
      excerpt,
      bodyHtml,
      bodyText,
      authors,
      timestampText,
      publishedAtIso,
      tags: tags.length ? tags : undefined,
      image,
      images,
      videos: videos?.length ? videos : undefined,
      credits,
      lang,
      _debug: debug,
    }
  } catch {
    return null
  }
}

export const __test__ = {
  cleanContainer,
  sanitizeBodyHtml,
}