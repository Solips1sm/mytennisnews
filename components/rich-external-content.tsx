"use client"
import React, { useEffect, useMemo } from 'react'
import { useRef } from 'react'
import sanitizeHtml from 'sanitize-html'

type NodeLike = { type: string; attrs: Record<string, string>; children: NodeLike[]; text?: string; html?: string }

function normalizeSrc(src: string | null | undefined, reference?: string): string | undefined {
  if (!src) return undefined
  const trimmed = src.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).toString()
  } catch {
    if (reference) {
      try {
        const base = new URL(reference)
        return new URL(trimmed, base.origin).toString()
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
}

function parseBasicHtml(html: string): NodeLike[] {
  // Extremely small HTML parser sufficient for our sanitized subset.
  // Strategy: wrap in a container and use DOMParser (browser environment only).
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div data-root="root">${html}</div>`, 'text/html')
  const root = doc.querySelector('div[data-root="root"]')!
  const walk = (el: Element): NodeLike => {
    const node: NodeLike = { type: el.tagName.toLowerCase(), attrs: {}, children: [], html: el.innerHTML }
    for (const a of Array.from(el.attributes)) node.attrs[a.name] = a.value
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        const text = child.textContent || ''
        if (text.trim().length) node.children.push({ type: '#text', attrs: {}, children: [], text })
      } else if (child.nodeType === 1) {
        node.children.push(walk(child as Element))
      }
    }
    return node
  }
  return Array.from(root.children).map((c) => walk(c))
}

interface MediaMeta {
  caption?: string
  credit?: string
  byline?: string
}

function extractAtpMediaMeta(container: Element): MediaMeta | undefined {
  const credit = container.querySelector('.image-credit')?.textContent?.trim() || undefined
  const caption = container.querySelector('.title')?.textContent?.trim() || undefined
  const byline = container.querySelector('.photoBy')?.textContent?.trim() || undefined
  if (credit || caption || byline) return { credit, caption, byline }
  return undefined
}

function flattenText(node?: NodeLike): string | undefined {
  if (!node) return undefined
  if (node.type === '#text') return node.text
  return node.children.map((c) => flattenText(c) || '').join('').trim() || undefined
}

const UUID_IN_PARENS_REGEX = /\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\s*$/i

function stripEspnProfileIds(html: string): string {
  if (!html) return html

  const fallback = html.replace(
    /(>)([^<>]*?)(?:\s*\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\))(<\/a>)/gi,
    (_, open, name, __uuid, close) => `${open}${name.trim()}${close}`,
  )

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return fallback

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div data-root="root">${html}</div>`, 'text/html')
    const root = doc.querySelector('div[data-root="root"]')
    if (!root) return fallback

    const anchors = Array.from(root.querySelectorAll('a'))
    anchors.forEach((anchor) => {
      const text = anchor.textContent?.trim() || ''
      const match = text.match(/^(.+?)\s*\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)$/i)
      if (match) {
        const clean = match[1].replace(/\s+/g, ' ').trim()
        anchor.textContent = clean
      } else if (UUID_IN_PARENS_REGEX.test(text)) {
        anchor.textContent = text.replace(UUID_IN_PARENS_REGEX, '').trim()
      }
    })

    return root.innerHTML
  } catch {
    return fallback
  }
}

function wrapLooseTextNodes(html: string): string {
  if (!html) return html
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html
  }
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div data-root="root">${html}</div>`, 'text/html')
    const root = doc.querySelector('div[data-root="root"]')
    if (!root) return html

    const WRAPPABLE = new Set(['div', 'section', 'article', 'main', 'blockquote'])
    const SKIP_CLASS = /(ext-embed|ext-twitter|ext-video|ext-social)/

    const processElement = (el: Element) => {
      const tag = el.tagName.toLowerCase()
      const shouldWrap = WRAPPABLE.has(tag) && !SKIP_CLASS.test(el.className || '')
      const children = Array.from(el.childNodes)
      children.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const raw = child.textContent || ''
          const trimmed = raw.replace(/[\u00A0]+/g, ' ').trim()

          if (!trimmed) {
            if (shouldWrap) {
              el.removeChild(child)
            } else {
              child.textContent = ''
            }
            return
          }

          if (shouldWrap) {
            const segments = trimmed
              .split(/\n{2,}|\r{2,}/)
              .map((segment) => segment.trim())
              .filter(Boolean)

            let previous: ChildNode | null = child
            segments.forEach((segment) => {
              const p = doc.createElement('p')
              p.textContent = segment
              if (previous && previous.parentNode === el) {
                el.insertBefore(p, previous.nextSibling)
                previous = p
              } else {
                el.insertBefore(p, child)
                previous = p
              }
            })
            el.removeChild(child)
          } else {
            child.textContent = trimmed
          }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          processElement(child as Element)
        }
      })
    }

    processElement(root)
    return root.innerHTML
  } catch {
    return html
  }
}

export function RichExternalContent({ html, sourceHost, primaryImageUrl }: { html: string; sourceHost?: string; primaryImageUrl?: string }) {
  const isESPN = !!sourceHost?.includes('espn.com')
  const isBrowser = typeof window !== 'undefined' && typeof DOMParser !== 'undefined'
  const containerRef = useRef<HTMLDivElement>(null)
  const sanitized = useMemo(() => {
    return sanitizeHtml(html, {
  allowedTags: [ 'p', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'img', 'h2', 'h3', 'h4', 'br', 'span', 'div', 'picture', 'source', 'iframe', 'sup', 'sub' ],
  allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'class'],
        source: ['srcset', 'type', 'media'],
        picture: ['class'],
  iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'data-tweet-id'],
        '*': ['class']
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      exclusiveFilter(frame: any) {
        const cls = frame.attribs?.class || ''
        if (/\b(content-reactions|reactions-allowed|share-popup|inline-share-tools|social-share|article-social|story-features)\b/.test(cls)) return true
        if (isESPN && frame.tag === 'span' && /\btimestamp\b/.test(cls)) return true
        return false
      },
      transformTags: {
        a: (tagName: string, attribs: Record<string, string>) => {
          const rel = attribs.rel ? `${attribs.rel} noopener noreferrer` : 'noopener noreferrer'
          return { tagName: 'a', attribs: { ...attribs, rel } }
        },
        iframe: (tagName: string, attribs: Record<string, string>) => {
          const src = attribs.src || ''
          const isTwitter = /platform\.twitter\.com\/embed\/Tweet\.html/i.test(src) || /twitter\.com|x\.com/i.test(src)
          const isBrightcove = /players\.brightcove\.net/i.test(src)
          const isYouTube = /youtu\.be|youtube\.com/i.test(src)
          const isKnown = isTwitter || isBrightcove || isYouTube
          if (!src || !isKnown) return { tagName: 'span', attribs: {}, text: '' } as any
          const safe: Record<string, string> = { ...attribs }
          // Drop inline styles to prevent layout breaks/overlay
          delete (safe as any).style
          if (isTwitter) {
            safe.title = safe.title || 'X Post'
            safe.allowfullscreen = 'true'
            safe.scrolling = 'no'
            safe.frameborder = '0'
            // Ensure consistent responsive styling
            const prev = (safe as any).class || ''
            ;(safe as any).class = [prev, 'ext-embed', 'ext-twitter'].filter(Boolean).join(' ')
          } else if (isBrightcove || isYouTube) {
            safe.title = safe.title || (isBrightcove ? 'Brightcove Player' : 'YouTube Player')
            safe.allow = safe.allow || 'encrypted-media; picture-in-picture; fullscreen'
            safe.allowfullscreen = 'true'
            safe.frameborder = '0'
            safe.width = safe.width || '560'
            safe.height = safe.height || '315'
            // Ensure consistent responsive styling
            const prev = (safe as any).class || ''
            ;(safe as any).class = [prev, 'ext-embed', isBrightcove ? 'ext-brightcove' : 'ext-youtube', 'ext-video']
              .filter(Boolean)
              .join(' ')
          }
          return { tagName: 'iframe', attribs: safe } as any
        },
        blockquote: (tagName: string, attribs: Record<string, string>) => {
          // Preserve twitter blockquotes; actual embedding handled in React render
          const cls = attribs.class || ''
          if (/\btwitter-tweet\b/.test(cls)) {
            return { tagName: 'blockquote', attribs: { ...attribs, class: cls } } as any
          }
          return { tagName, attribs }
        },
        div: (tagName: string, attribs: Record<string, string>) => {
          if (!isESPN) return { tagName, attribs }
          const cls = attribs.class || ''
          if (/\barticle-meta\b/.test(cls)) {
            return { tagName: 'div', attribs: { ...attribs, class: 'article-meta mytn-article-meta inline-flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1' } }
          }
          if (/\bauthor\b/.test(cls)) {
            return { tagName: 'span', attribs: { class: 'author inline-flex items-center rounded-full border bg-background/80 px-2 py-0.5 text-xs' } } as any
          }
          return { tagName, attribs }
        },
        ul: (tagName: string, attribs: Record<string, string>) => {
          if (!isESPN) return { tagName, attribs }
          const cls = attribs.class || ''
          if (/\bauthors\b/.test(cls)) {
            return { tagName: 'ul', attribs: { class: 'authors m-0 flex list-none items-center gap-2 p-0' } } as any
          }
          return { tagName, attribs }
        },
        li: (tagName: string, attribs: Record<string, string>) => {
          if (!isESPN) return { tagName, attribs }
            return { tagName: 'li', attribs: { class: 'm-0 p-0' } }
        },
      },
    })
  }, [html, isESPN])

  const sanitizedWithoutIds = useMemo(() => stripEspnProfileIds(sanitized), [sanitized])

  const normalized = useMemo(() => wrapLooseTextNodes(sanitizedWithoutIds), [sanitizedWithoutIds])

  const sanitizedWithoutPrimary = useMemo(() => {
    if (!primaryImageUrl) return normalized
    const normalizedPrimary = normalizeSrc(primaryImageUrl)
    if (!normalizedPrimary) return normalized

    if (isBrowser && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(`<div data-root="root">${normalized}</div>`, 'text/html')
        const root = doc.querySelector('div[data-root="root"]')
        if (!root) return normalized
        const images = Array.from(root.querySelectorAll('img'))
        images.forEach((img) => {
          const src = img.getAttribute('src')
          const normalized = normalizeSrc(src, primaryImageUrl)
          if (normalized && normalized === normalizedPrimary) {
            const wrapper = img.closest('.main-image, figure, picture')
            if (wrapper && wrapper.contains(img) && wrapper.querySelectorAll('img').length === 1) {
              wrapper.remove()
            } else {
              img.remove()
            }
          }
        })
        return root.innerHTML
      } catch {
        // fall through to string replacement
      }
    }

    const pattern = new RegExp(`<([^>]+)?img[^>]+src=["']${normalizedPrimary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>[\\s]*</?(?:picture|figure)[^>]*>?`, 'gi')
    const simpleImgPattern = new RegExp(`<img[^>]+src=["']${normalizedPrimary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'gi')
    let result = normalized.replace(pattern, '')
    result = result.replace(simpleImgPattern, '')
    return result
  }, [primaryImageUrl, normalized, isBrowser])

  const enhanced = useMemo(() => {
    const socialLinkRegex = /<p>(\s*)<a([^>]+href=\"[^\"]*(?:twitter\.com|x\.com|instagram\.com|youtu\.be|youtube\.com)[^\"]*)\"[^>]*>[^<]+<\/a>(\s*)<\/p>/gi
    return sanitizedWithoutPrimary.replace(socialLinkRegex, (m) => (/ext-social/.test(m) ? m : `<div class=\"ext-social\">${m}</div>`))
  }, [sanitizedWithoutPrimary])

  // Build React tree with image replacement
  // Hydration-safe render: always output the same sanitized HTML on server and client,
  // then progressively enhance (tweets/videos) after mount.
  const reactTree = useMemo(() => [
    <div key="html" dangerouslySetInnerHTML={{ __html: enhanced }} />
  ], [enhanced])
  

  // Resize Twitter iframes to maintain readable height and cap width at 75% of article column.
  // If height would overflow the viewport, reduce width to fit height-wise.
  useEffect(() => {
    if (!isBrowser) return
    const root = containerRef.current
    if (!root) return
    const wrappers = Array.from(root.querySelectorAll('.ext-twitter')) as HTMLElement[]
    if (!wrappers.length) return

    const BASE_W = 550
    const BASE_H = 874 // typical default from Twitter embeds
    const RATIO = BASE_H / BASE_W
  const MIN_H = 320
  const MAX_H = 1000

    const resizeOne = (wrapper: HTMLElement) => {
      const iframe = wrapper.querySelector('iframe') as HTMLIFrameElement | null
      if (!iframe) return
  const rect = wrapper.getBoundingClientRect()
  const currentWidth = rect.width || iframe.clientWidth || BASE_W
  const viewportCap = Math.max(MIN_H, Math.floor(window.innerHeight * 0.85))
  const rawHeight = Math.round(currentWidth * RATIO)
  const cappedByViewport = Math.min(rawHeight, viewportCap)
  const targetHeight = Math.max(MIN_H, Math.min(MAX_H, cappedByViewport))
      iframe.style.width = '100%'
      iframe.style.height = `${targetHeight}px`
      iframe.setAttribute('height', String(targetHeight))
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) resizeOne(entry.target as HTMLElement)
    })

    wrappers.forEach((wrapper) => {
      resizeOne(wrapper)
      ro.observe(wrapper)
    })

    const onWindowResize = () => {
      wrappers.forEach(resizeOne)
    }

    window.addEventListener('resize', onWindowResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onWindowResize)
      ro.disconnect()
    }
  }, [enhanced, isBrowser])

  // Post-mount enhancement: convert any preserved Twitter blockquotes into iframes
  useEffect(() => {
    if (!isBrowser) return
    const root = containerRef.current
    if (!root) return
    const blocks = Array.from(root.querySelectorAll('blockquote.twitter-tweet')) as HTMLElement[]
    blocks.forEach((b, i) => {
      const html = b.innerHTML || ''
      const m = html.match(/status\/(\d{5,})/)
      const id = m?.[1]
      if (!id) return
      const wrap = document.createElement('div')
      wrap.className = 'ext-embed ext-twitter not-prose my-4'
      const iframe = document.createElement('iframe')
      iframe.src = `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(id)}&theme=light&hideCard=false&hideThread=false`
      iframe.title = 'X Post'
      iframe.scrolling = 'no'
      iframe.setAttribute('allow', 'encrypted-media; picture-in-picture; fullscreen')
      iframe.setAttribute('frameborder', '0')
      iframe.style.width = '100%'
      iframe.style.display = 'block'
      wrap.appendChild(iframe)
      b.replaceWith(wrap)
    })
  }, [enhanced, isBrowser])
  return (
    <div
      ref={containerRef}
      className="prose prose-neutral dark:prose-invert w-full max-w-none [&_a]:underline"
      style={{ maxWidth: 'var(--article-content-max)' }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .ext-embed{width:100%;max-width:var(--article-content-max,clamp(75%,82%,1200px));margin:1.75rem auto;display:block;position:relative;transition:none!important}
          .ext-embed iframe{display:block;width:100%!important;max-width:100%!important;height:auto;border:0;transition:none!important}
          .ext-twitter{width:100%;max-width:var(--article-content-max,clamp(75%,82%,1200px));margin:2rem auto;transform:none;will-change:auto}
          .ext-twitter iframe{width:100%!important;max-width:100%!important;border:0;display:block;transition:none!important}
          @media (max-width: 640px){.ext-embed,.ext-twitter{max-width:100%;width:100%}}
          .ext-video .aspect-video{position:relative}
          .ext-video .aspect-video iframe{position:absolute;inset:0;width:100%;height:100%}
        `,
        }}
      />
      {reactTree}
    </div>
  )
}
