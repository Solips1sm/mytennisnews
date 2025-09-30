import { JSDOM } from 'jsdom'
import { extractESPN } from './espn'
import { extractATP } from './atp'
import { extractWTA } from './wta'
import { fetchRenderedHtml, shouldUseRenderedFetch } from '../util/rendered-fetch'
import { detectChallenge, type ChallengeDetection } from '../util/challenge-detector'

// Internal: version bump to invalidate stale build caches for extractor union
export const __EXTRACTOR_VERSION__ = 3

export type ExtractedArticle = {
  title?: string
  bodyHtml?: string
  bodyText?: string
  authors?: string[]
  timestampText?: string
  image?: string
  images?: string[]
  lang?: string
  _debug?: {
  extractor: 'espn' | 'generic' | 'atp' | 'wta'
    status?: number
    htmlLength?: number
    paragraphs?: number
    images?: number
    videos?: number
    htmlSavedPath?: string
    note?: string
  }
  challenge?: ChallengeDetection
}

// NOTE: loosen return type to accommodate site-specific extractor variance
export async function extractArticle(url: string): Promise<ExtractedArticle | null> {
  try {
    const host = new URL(url).hostname
    if (/(^|\.)espn\.com$/i.test(host)) {
      const es = await extractESPN(url)
      if (es) return es as any
    }
    if (/(^|\.)atptour\.com$/i.test(host)) {
      const atp = await extractATP(url)
      if (atp) {
        const base: ExtractedArticle = {
          title: atp.title,
          bodyHtml: atp.bodyHtml,
          bodyText: atp.bodyText,
          authors: atp.authors,
          timestampText: atp.timestampText,
          image: atp.image,
          images: atp.images,
          lang: undefined,
          _debug: { extractor: 'atp', status: atp._debug?.status, htmlLength: atp._debug?.htmlLength, paragraphs: atp._debug?.paragraphs, images: atp._debug?.images, videos: atp._debug?.videos, htmlSavedPath: atp._debug?.htmlSavedPath, note: atp._debug?.note }
        }
        const unified: any = { ...base }
        if ((atp as any).videos) unified.videos = (atp as any).videos
        if ((atp as any).credits) unified.credits = (atp as any).credits
        return unified
      }
    }
    if (/(^|\.)wtatennis\.com$/i.test(host)) {
      const wta = await extractWTA(url)
      if (wta) {
        const base: ExtractedArticle = {
          title: wta.title,
          bodyHtml: wta.bodyHtml,
          bodyText: wta.bodyText,
          authors: wta.authors,
          timestampText: wta.timestampText,
          image: wta.image,
          images: wta.images,
          lang: wta.lang,
          _debug: {
            extractor: 'wta',
            status: wta._debug?.status,
            htmlLength: wta._debug?.htmlLength,
            paragraphs: wta._debug?.paragraphs,
            images: wta._debug?.images,
            videos: wta._debug?.videos,
            htmlSavedPath: wta._debug?.htmlSavedPath,
            note: wta._debug?.note,
          },
        }
        const unified: any = { ...base }
        if (wta.videos) unified.videos = wta.videos
        if (wta.credits) unified.credits = wta.credits
        if (wta.tags) unified.tags = wta.tags
        if (wta.publishedAtIso) unified.publishedAtIso = wta.publishedAtIso
        return unified
      }
    }
    // Optional rendered fetch for dynamic sites (client-rendered digits)
    const preferRendered = shouldUseRenderedFetch(host)
    const attempts: Array<'rendered' | 'fetch'> = preferRendered ? ['rendered', 'fetch'] : ['fetch', 'rendered']
    let html: string | null = null
    let status: number | undefined
    let loader: 'rendered' | 'fetch' | undefined
    let lastChallenge: ChallengeDetection | null = null
    for (const attempt of attempts) {
      if (attempt === 'rendered') {
        const r = await fetchRenderedHtml(url, {
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          waitSelectors: ['article', 'main', 'time'],
          timeoutMs: 35000,
        })
        if (r.html) {
          const challenge = detectChallenge(r.html)
          if (challenge) {
            console.warn('[extractor] challenge via rendered fetch', challenge, { url, status: r.status })
            lastChallenge = challenge
            continue
          }
          html = r.html
          status = r.status
          loader = 'rendered'
          break
        }
      } else {
        const res = await fetch(url, { headers: { 'User-Agent': 'MyTennisNewsBot/1.0' } })
        if (!res.ok) continue
        const text = await res.text()
        if (!text) continue
        const challenge = detectChallenge(text)
        if (challenge) {
          console.warn('[extractor] challenge via direct fetch', challenge, { url, status: res.status })
          lastChallenge = challenge
          continue
        }
        html = text
        status = res.status
        loader = 'fetch'
        break
      }
    }
    if (!html) {
      if (lastChallenge) {
        return {
          challenge: lastChallenge,
          _debug: {
            extractor: 'generic',
            status,
            htmlLength: 0,
            note: `challenge:${lastChallenge.type}`,
          },
        }
      }
      return null
    }
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || undefined
    const lang = doc.documentElement.lang || undefined

    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined
    const images = Array.from(doc.querySelectorAll('img') as NodeListOf<HTMLImageElement>)
      .map((img) => img.getAttribute('src') || '')
      .filter(Boolean)

    // Heuristic: prefer <article> content; fallback to main; else body
  const container = doc.querySelector('article, main') || doc.body
    // Remove scripts/styles/navs/asides
    container
      .querySelectorAll('script, style, nav, aside, noscript')
      .forEach((el: Element) => el.remove())

    const paragraphs = Array.from(container.querySelectorAll('p') as NodeListOf<HTMLParagraphElement>)
  const bodyText = paragraphs.map((p) => p.textContent?.trim()).filter(Boolean).join('\n\n') || undefined
  const bodyHtml = container.innerHTML || undefined

    const authorMeta = doc.querySelector('meta[name="author"]')?.getAttribute('content')
    const authors: string[] | undefined = authorMeta ? [authorMeta] : undefined
    const timestampText =
      (doc.querySelector('.article-meta .timestamp') as HTMLElement | null)?.textContent?.trim() ||
      (doc.querySelector('time') as HTMLElement | null)?.textContent?.trim() ||
      undefined

    const debug: ExtractedArticle['_debug'] = {
      extractor: 'generic',
      status,
      htmlLength: html?.length || 0,
      paragraphs: paragraphs.length,
      images: images.length,
      videos: 0,
    }

    // Optional: save HTML to .debug if enabled
    if (process.env.INGEST_DEBUG_SAVE_HTML === 'true') {
      try {
        const { writeFile, mkdir } = await import('node:fs/promises')
        const path = await import('node:path')
        const crypto = await import('node:crypto')
        const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)
        const dir = path.resolve(process.cwd(), '.debug', 'html', 'generic')
        await mkdir(dir, { recursive: true })
        const file = path.join(dir, `${hash}.html`)
        const max = Math.max(0, parseInt(process.env.INGEST_DEBUG_MAX_HTML || '200000', 10))
        const content = max ? html.slice(0, max) : html
        await writeFile(file, content, 'utf8')
        debug.htmlSavedPath = file
      } catch {}
    }

    return { title, bodyHtml, bodyText, authors, timestampText, image: ogImage, images, lang, _debug: debug }
  } catch {
    return null
  }
}
