import { JSDOM } from 'jsdom'
import { detectChallenge, type ChallengeDetection } from '../util/challenge-detector'

export type ESPNExtracted = {
  title?: string
  bodyText?: string
  bodyHtml?: string
  authors?: string[]
  timestampText?: string
  images?: string[]
  image?: string
  videos?: Array<{ title?: string; url?: string; embedUrl?: string; thumbnail?: string }>
  credits?: string
  _debug?: {
    extractor: 'espn'
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

export async function extractESPN(url: string): Promise<ESPNExtracted | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MyTennisNewsBot/1.0' } })
    if (!res.ok) return null
    const html = await res.text()
    const challenge = detectChallenge(html)
    if (challenge) {
      console.warn('[extract:espn] challenge detected', challenge, { url, status: res.status })
      return {
        challenge,
        _debug: {
          extractor: 'espn',
          status: res.status,
          htmlLength: html.length,
          note: `challenge:${challenge.type}`,
        },
      }
    }
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || undefined
    const article = doc.querySelector('section#article-feed article.article') || doc.querySelector('article') || doc.body
    // remove non-content elements
    article.querySelectorAll('script, style, nav, aside, noscript').forEach((el) => el.remove())
    // strip ESPN reaction/share and related UI widgets inside the article
    article
      .querySelectorAll(
        [
          '.content-reactions',
          '.reactions-allowed',
          '.share-popup',
          '.inline-share-tools',
          '[data-behavior*="share"]',
          '.social-share',
          '.article-social',
          '.story-features',
        ].join(', ')
      )
      .forEach((el) => el.remove())

    const authors = Array.from(article.querySelectorAll('.authors .author'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean) as string[]
    const timestampText = article.querySelector('.timestamp')?.textContent?.trim() || undefined
    const bodyContainer = article.querySelector('.article-body') || article
    const paragraphs = Array.from(bodyContainer.querySelectorAll('p'))
    const bodyText = paragraphs.map((p) => p.textContent?.trim()).filter(Boolean).join('\n\n') || undefined
    const bodyHtml = bodyContainer.innerHTML || undefined

    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined
    const images = Array.from(doc.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') || '')
      .filter((src) => !!src && !src.startsWith('data:'))

    const videos: ESPNExtracted['videos'] = []
    // ESPN embeds: figure.iframe-video, figure.video, or any figure with data-video
    const figureNodes = Array.from(
      article.querySelectorAll('figure.iframe-video, figure.video, figure[data-video]') as NodeListOf<HTMLElement>
    )
    for (const fig of figureNodes) {
      let embedUrl: string | undefined
      let thumbnail: string | undefined
      let vtitle: string | undefined

      const iframe = fig.querySelector('iframe') as HTMLIFrameElement | null
      if (iframe?.getAttribute('src')) embedUrl = iframe.getAttribute('src') || undefined

      // Parse data-video attr for ID: e.g., "watch,640,360,46195286,..."
      if (!embedUrl) {
        const dataVideo = fig.getAttribute('data-video') || ''
        if (dataVideo) {
          const parts = dataVideo.split(',')
          const idToken = parts.find((p) => /^(\d{6,})$/.test(p.trim()))
          if (idToken) embedUrl = `https://www.espn.com/watch/syndicatedplayer?id=${idToken.trim()}`
        }
      }

      // Fallback: span.video-play-button[data-id]
      if (!embedUrl) {
        const play = fig.querySelector('span.video-play-button') as HTMLElement | null
        const idAttr = play?.getAttribute('data-id')
        if (idAttr) embedUrl = `https://www.espn.com/watch/syndicatedplayer?id=${idAttr}`
      }

      // Thumbnail from picture>source[srcset] or img[src]
      const sourceEl = fig.querySelector('picture source') as HTMLSourceElement | null
      const srcset = sourceEl?.getAttribute('srcset') || ''
      if (srcset) {
        // pick first URL
        const first = srcset.split(',')[0]?.trim().split(' ')[0]
        if (first) thumbnail = first
      }
      if (!thumbnail) {
        const imgEl = fig.querySelector('img') as HTMLImageElement | null
        thumbnail = imgEl?.getAttribute('src') || undefined
      }

      // Title from figcaption or data-title
      vtitle =
        fig.querySelector('figcaption .headline')?.textContent?.trim() ||
        fig.querySelector('figcaption')?.textContent?.trim() ||
        fig.getAttribute('data-title') ||
        undefined

      if (embedUrl || thumbnail || vtitle) {
        videos.push({ title: vtitle, embedUrl, thumbnail })
      }
    }

    const credits = doc.querySelector('.PageFooter__Legal__Copyright')?.textContent?.trim()

    const debug: ESPNExtracted['_debug'] = {
      extractor: 'espn',
      status: res.status,
      htmlLength: html?.length || 0,
      paragraphs: paragraphs.length,
      images: images.length,
      videos: videos.length,
    }

    // Optional: save HTML for debugging
    if (process.env.INGEST_DEBUG_SAVE_HTML === 'true') {
      try {
        const { writeFile, mkdir } = await import('node:fs/promises')
        const path = await import('node:path')
        const crypto = await import('node:crypto')
        const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 12)
        const dir = path.resolve(process.cwd(), '.debug', 'html', 'espn')
        await mkdir(dir, { recursive: true })
        const file = path.join(dir, `${hash}.html`)
        const max = Math.max(0, parseInt(process.env.INGEST_DEBUG_MAX_HTML || '200000', 10))
        const content = max ? html.slice(0, max) : html
        await writeFile(file, content, 'utf8')
        debug.htmlSavedPath = file
      } catch {}
    }

    return { title, bodyText, bodyHtml, authors, timestampText, image: ogImage, images, videos, credits, _debug: debug }
  } catch {
    return null
  }
}
