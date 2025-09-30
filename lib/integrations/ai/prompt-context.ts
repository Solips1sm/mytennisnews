import { JSDOM } from 'jsdom'
import type { LinkReference, MediaReference } from './index'
import { htmlToPlainText } from '../util/number-preserver'

export function portableTextToPlain(body: any): string | undefined {
  if (!Array.isArray(body)) return undefined
  const parts: string[] = []
  for (const block of body) {
    if (block?._type === 'block' && Array.isArray(block.children)) {
      parts.push(block.children.map((child: any) => child?.text || '').join(''))
    }
  }
  return parts.join('\n\n').trim() || undefined
}

type MediaExtractionResult = {
  htmlWithTokens?: string
  mediaReferences: MediaReference[]
}

type ExtractionOptions = {
  externalHtml?: string
  canonicalUrl?: string
  leadImageUrl?: string
}

type LinkExtractionOptions = {
  body?: any
  externalHtml?: string
}

function resolveUrl(url: string | null | undefined, canonical?: string): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  if (!trimmed) return undefined
  try {
    if (/^https?:/i.test(trimmed)) return new URL(trimmed).toString()
    if (canonical) {
      const base = new URL(canonical)
      return new URL(trimmed, `${base.protocol}//${base.host}`).toString()
    }
  } catch {
    return trimmed
  }
  return trimmed
}

function extractLinks({ body, externalHtml }: LinkExtractionOptions): LinkReference[] {
  const map = new Map<string, LinkReference>()

  if (Array.isArray(body)) {
    for (const block of body) {
      if (!Array.isArray(block?.markDefs)) continue
      const markDefs = block.markDefs
      for (const def of markDefs) {
        if (def?._type === 'link' && typeof def.href === 'string') {
          const href = def.href.trim()
          if (!href) continue
          const text = Array.isArray(block.children)
            ? block.children
                .filter((child: any) => Array.isArray(child?.marks) && child.marks.includes(def._key))
                .map((child: any) => child?.text || '')
                .join('')
                .trim()
            : ''
          if (!text) continue
          const key = `${text.toLowerCase()}::${href}`
          if (!map.has(key)) {
            map.set(key, { text, url: href })
          }
        }
      }
    }
  }

  if (externalHtml) {
    try {
      const dom = new JSDOM(`<div id="ai-root">${externalHtml}</div>`)
      const doc = dom.window.document
      const anchors = Array.from(doc.querySelectorAll('a[href]'))
      for (const anchor of anchors) {
        const href = anchor.getAttribute('href') || ''
        const text = anchor.textContent?.trim() || ''
        if (!href || !text) continue
        const key = `${text.toLowerCase()}::${href}`
        if (!map.has(key)) {
          map.set(key, { text, url: href })
        }
      }
    } catch {
      /* ignore */
    }
  }

  return Array.from(map.values()).slice(0, 40)
}

function extractMedia({ externalHtml, canonicalUrl, leadImageUrl }: ExtractionOptions): MediaExtractionResult {
  if (!externalHtml) return { mediaReferences: [] }
  try {
    const dom = new JSDOM(`<div id="ai-root">${externalHtml}</div>`)
    const doc = dom.window.document
    const root = doc.getElementById('ai-root') as HTMLElement | null
    if (!root) return { mediaReferences: [] }

    const mediaReferences: MediaReference[] = []
    const seen = new Set<string>()
    let imgIdx = 0
    let videoIdx = 0
    let embedIdx = 0

    const annotate = (
      el: Element,
      entry: Omit<MediaReference, 'token'> & { preferFigure?: boolean; html?: string },
    ) => {
      let token: string | undefined
      if (entry.type === 'image') token = `[[IMG:${++imgIdx}]]`
      else if (entry.type === 'video') token = `[[VIDEO:${++videoIdx}]]`
      else token = `[[EMBED:${++embedIdx}]]`
      const media: MediaReference = {
        token,
        type: entry.type,
        url: entry.url,
        description: entry.description,
        caption: entry.caption,
        html: entry.html,
      }
      mediaReferences.push(media)
      const replacement = doc.createElement('p')
      replacement.textContent = token
      const target = entry.preferFigure && el.closest('figure') ? el.closest('figure')! : el
      target.replaceWith(replacement)
    }

    const nodeList = Array.from(root.querySelectorAll('figure, picture, img, iframe, video, blockquote.twitter-tweet, div[data-oembed-url]'))
    for (const node of nodeList) {
      if (!(node instanceof dom.window.HTMLElement)) continue
      if (node.dataset.aiMediaVisited === '1') continue
      let type: MediaReference['type'] | undefined
      let url: string | undefined
      let description: string | undefined
  let caption: string | undefined
  let originalHtml: string | undefined

      const figure = node.closest('figure') || (node.tagName === 'FIGURE' ? node : null)
      const targetEl = figure ?? node

      if (figure) {
        const figcaption = figure.querySelector('figcaption')
        caption = figcaption?.textContent?.trim() || undefined
      }

      if (targetEl.querySelector('img')) {
        const img = targetEl.querySelector('img')!
        url = resolveUrl(img.getAttribute('src'), canonicalUrl)
        if (leadImageUrl && url && leadImageUrl === url) {
          targetEl.dataset.aiMediaVisited = '1'
          continue
        }
        type = 'image'
        description = img.getAttribute('alt') || img.getAttribute('title') || undefined
        originalHtml = (targetEl as HTMLElement).outerHTML
      } else if (targetEl.querySelector('video')) {
        const video = targetEl.querySelector('video')!
        url = resolveUrl(video.getAttribute('src') || video.getAttribute('data-src'), canonicalUrl)
        type = 'video'
        description = video.getAttribute('title') || video.getAttribute('aria-label') || undefined
        originalHtml = (targetEl as HTMLElement).outerHTML
      } else if (targetEl.querySelector('iframe') || targetEl.getAttribute('data-oembed-url')) {
        const iframe = targetEl.querySelector('iframe')
        const dataUrl = targetEl.getAttribute('data-oembed-url')
        const src = iframe?.getAttribute('src') || dataUrl
        url = resolveUrl(src, canonicalUrl)
        const embedSrc = (src || '').toLowerCase()
        if (/youtube|vimeo|brightcove|dazn|dailymotion/.test(embedSrc)) type = 'video'
        else type = 'embed'
        description = iframe?.getAttribute('title') || targetEl.getAttribute('aria-label') || undefined
        originalHtml = (targetEl as HTMLElement).outerHTML
      } else if (targetEl.matches('blockquote.twitter-tweet')) {
        const link = targetEl.querySelector('a[href]')
        url = resolveUrl(link?.getAttribute('href') || '', canonicalUrl)
        type = 'embed'
        description = targetEl.textContent?.trim().slice(0, 120)
        originalHtml = (targetEl as HTMLElement).outerHTML
      }

      if (!type || !url) {
        targetEl.dataset.aiMediaVisited = '1'
        continue
      }

      if (seen.has(`${type}:${url}`)) {
        targetEl.dataset.aiMediaVisited = '1'
        continue
      }
      seen.add(`${type}:${url}`)
      targetEl.dataset.aiMediaVisited = '1'

  annotate(targetEl, { type, url, description, caption, html: originalHtml, preferFigure: true })
    }

    return { mediaReferences, htmlWithTokens: root.innerHTML }
  } catch {
    return { mediaReferences: [] }
  }
}

export function buildPromptArtifacts(options: {
  body?: any
  externalHtml?: string
  canonicalUrl?: string
  leadImageUrl?: string
}): {
  bodyText?: string
  linkReferences?: LinkReference[]
  mediaReferences?: MediaReference[]
} {
  const { body, externalHtml, canonicalUrl, leadImageUrl } = options
  const linkReferences = extractLinks({ body, externalHtml })

  const { mediaReferences, htmlWithTokens } = extractMedia({ externalHtml, canonicalUrl, leadImageUrl })

  const plainBody = portableTextToPlain(body)
  let bodyText = plainBody

  if (!bodyText && htmlWithTokens) {
    bodyText = htmlToPlainText(htmlWithTokens)
  } else if (!bodyText && externalHtml) {
    bodyText = htmlToPlainText(externalHtml)
  }

  if (!bodyText && Array.isArray(linkReferences) && linkReferences.length) {
    const summary = linkReferences.map((ref) => `${ref.text} -> ${ref.url}`).join('\n')
    bodyText = summary
  }

  return {
    bodyText,
    linkReferences: linkReferences.length ? linkReferences : undefined,
    mediaReferences: mediaReferences.length ? mediaReferences : undefined,
  }
}
