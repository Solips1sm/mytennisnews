import crypto from 'node:crypto'
import OpenAI from 'openai'
import { JSDOM } from 'jsdom'
import {
  AIPipelineProvider,
  DraftVariant,
  LinkReference,
  MediaReference,
  GenerateArticleOptions,
  GenerateArticleBundleOptions,
} from './index'

export type PipelineUsageEvent = {
  id: string
  label: string
  model: string
  temperature: number
  durationMs: number
  createdAt: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type PipelineUsageSummary = {
  totals: {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalDurationMs: number
    averageTokensPerRequest: number
    averageLatencyMs: number
  }
  byLabel: Record<string, {
    requests: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    totalDurationMs: number
    averageTokensPerRequest: number
    averageLatencyMs: number
  }>
  events: PipelineUsageEvent[]
}

type RequestMeta = {
  label: string
}

function cryptoRandomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return crypto.randomBytes(12).toString('hex')
}

const sysBase = `You are a visionary tennis feature writer and editor. Your copy reads like a courtside dispatch that marries tactics, psychology, and atmosphere. Refresh the language, paraphrase faithfully, and verify details; if uncertain, acknowledge the gap. The tone is human, confident, and poetic without drifting into purple prose.

Direction conventions: prefer "inside-in", "inside-out", "crosscourt", and "down-the-line" for ball flights. Avoid "ad court" / "deuce court" labels except when discussing formations. Terminology: use "slice" / "underspin" (not "slider"), and describe patterns as "1–2" or "one–two" (never "serve+1").

Structure rules:
• Use two or three <h2> subheads after the opener; each is 4–8 words, written in sentence case (only proper nouns capitalized), and previews the emotional or tactical pivot that follows.
• Keep paragraphs grouped beneath the relevant subhead; each paragraph is compact, propulsive, and never reads like a checklist or blueprint.
• Quotes (when derived from source) use <div class="ext-quote"><blockquote>...</blockquote></div> and appear after paragraph 2.
• Do not fabricate social embeds. Place provided embed tokens on their own paragraph and never wrap commentary in <div class="ext-social"> unless the embed itself requires that wrapper.
• Never fabricate quotes or social posts. Do not add trailing citation blocks.
• Keep attributions inside the flow; limit the exact phrase "according to" to a single use, and vary verbs for additional references.
• Never repeat the same player's full name twice in a row; favor pronouns or descriptors for subsequent mentions.
• Strip sponsor fluff unless critical for context, remove emojis/hashtags while preserving meaning, avoid ALL-CAPS anywhere in the story, and never print bare URLs in the narrative.`

// NOTE: Media token preservation (future enhancement):
// Upstream ingestion can supply bodyText containing placeholders like [[IMG:1]], [[VIDEO:2]].
// Prompts below now include instructions to preserve such tokens exactly if present.

const MEDIA_ALLOWED_ATTRS = new Set([
  'class',
  'href',
  'src',
  'srcset',
  'sizes',
  'alt',
  'title',
  'width',
  'height',
  'allow',
  'allowfullscreen',
  'frameborder',
  'scrolling',
  'loading',
  'rel',
  'target',
  'type',
  'media',
  'data-tweet-id',
  'data-video-id',
  'data-account',
  'data-player',
  'data-src',
  'data-provider',
  'data-playlist-id',
  'data-brightcove-account',
  'data-brightcove-player',
  'data-brightcove-video-id',
  'data-oembed-url',
  'data-caption',
  'data-embed-url',
  'aria-label',
])

const MEDIA_ALLOWED_DATA_ATTRS = new Set([
  'data-tweet-id',
  'data-video-id',
  'data-account',
  'data-player',
  'data-src',
  'data-provider',
  'data-playlist-id',
  'data-brightcove-account',
  'data-brightcove-player',
  'data-brightcove-video-id',
  'data-oembed-url',
  'data-caption',
  'data-embed-url',
  'data-instgrm-captioned',
  'data-instgrm-permalink',
  'data-instgrm-version',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanMediaElement(el: Element) {
  Array.from(el.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase()
    if (name === 'style' || name === 'id' || name === 'contenteditable' || name.startsWith('on')) {
      el.removeAttribute(attr.name)
      return
    }
    if (name.startsWith('data-') && !MEDIA_ALLOWED_DATA_ATTRS.has(name)) {
      el.removeAttribute(attr.name)
      return
    }
    if (!MEDIA_ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name)
    }
  })

  const tag = el.tagName.toLowerCase()
  if (tag === 'a') {
    const href = el.getAttribute('href')
    if (!href) {
      el.remove()
      return
    }
    const rel = el.getAttribute('rel') || ''
    const relSet = new Set(rel.split(/\s+/).filter(Boolean))
    relSet.add('noopener')
    relSet.add('noreferrer')
    el.setAttribute('rel', Array.from(relSet).join(' '))
  }
  if (tag === 'img') {
    if (!el.getAttribute('loading')) el.setAttribute('loading', 'lazy')
    if (!el.getAttribute('alt') && el.getAttribute('title')) {
      el.setAttribute('alt', el.getAttribute('title') || '')
    }
  }

  Array.from(el.children).forEach((child) => cleanMediaElement(child as Element))
}

function buildMediaHtmlFromRef(ref: MediaReference): string | undefined {
  const original = ref.html
  if (original) {
    try {
      const dom = new JSDOM(`<div data-root="root">${original}</div>`)
      const doc = dom.window.document
      const root = doc.querySelector('div[data-root="root"]')
      if (root) {
        const twitter = root.querySelector('blockquote.twitter-tweet')
        if (twitter) {
          const anchor = twitter.querySelector('a[href]')
          const tweetHref = anchor?.getAttribute('href') || anchor?.textContent || ''
          const tweetMatch = tweetHref.match(/status(?:es)?\/(\d{5,})/i)
          const tweetId = tweetMatch?.[1]
          twitter.querySelectorAll('script').forEach((s) => s.remove())
          cleanMediaElement(twitter)
          if (tweetId) {
            const iframeSrc = `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(tweetId)}&theme=light&hideCard=false&hideThread=false`
            return `<div class="ext-embed ext-twitter"><iframe src="${iframeSrc}" title="X Post" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen frameborder="0" scrolling="no"></iframe></div>`
          }
          twitter.setAttribute(
            'class',
            Array.from(new Set((twitter.getAttribute('class') || '').split(/\s+/).concat('twitter-tweet').filter(Boolean))).join(' '),
          )
          return twitter.outerHTML
        }
        const instagram = root.querySelector('blockquote.instagram-media')
        if (instagram) {
          const instagramClone = instagram.cloneNode(true) as HTMLElement
          cleanMediaElement(instagramClone)
          const hostWrapper = instagram.closest('aside.instagram-post') || instagram.closest('div.instagram-post')
          if (hostWrapper) {
            const wrapperClone = hostWrapper.cloneNode(false) as HTMLElement
            cleanMediaElement(wrapperClone)
            wrapperClone.innerHTML = ''
            wrapperClone.appendChild(instagramClone)
            return `${wrapperClone.outerHTML}<script async src="https://www.instagram.com/embed.js"></script>`
          }
          return `<div class="ext-embed ext-instagram">${instagramClone.outerHTML}<script async src="https://www.instagram.com/embed.js"></script></div>`
        }
        const figure = root.querySelector('figure')
        if (figure) {
          cleanMediaElement(figure)
          if (ref.caption && !figure.querySelector('figcaption')) {
            const figcaption = doc.createElement('figcaption')
            figcaption.textContent = ref.caption
            figure.appendChild(figcaption)
          }
          return figure.outerHTML
        }
        const iframe = root.querySelector('iframe')
        if (iframe) {
          cleanMediaElement(iframe)
          return iframe.outerHTML
        }
        const img = root.querySelector('img')
        if (img) {
          cleanMediaElement(img)
          const wrapper = doc.createElement('figure')
          wrapper.appendChild(img.cloneNode(true))
          if (ref.caption) {
            const figcaption = doc.createElement('figcaption')
            figcaption.textContent = ref.caption
            wrapper.appendChild(figcaption)
          }
          return wrapper.innerHTML ? `<figure>${wrapper.innerHTML}</figure>` : img.outerHTML
        }
        const first = root.firstElementChild
        if (first) {
          cleanMediaElement(first)
          return first.outerHTML
        }
      }
    } catch {
      // fallback handled below
    }
  }

  if (ref.type === 'image' && ref.url) {
    const caption = ref.caption ? `<figcaption>${escapeHtml(ref.caption)}</figcaption>` : ''
    const alt = escapeHtml(ref.description || '')
    return `<figure><img src="${ref.url}" alt="${alt}" loading="lazy" />${caption}</figure>`
  }

  if (ref.type === 'video' && ref.url) {
    const lower = ref.url.toLowerCase()
    if (/players\.brightcove\.net/.test(lower)) {
      let account: string | undefined
      let player: string | undefined
      let videoId: string | undefined
      try {
        const u = new URL(ref.url)
        const parts = u.pathname.split('/').filter(Boolean)
        account = parts[0]
        player = parts[1]
        videoId = u.searchParams.get('videoId') || undefined
      } catch {
        /* ignore */
      }
      const attrs: string[] = [
        'class="ext-video ext-brightcove ext-embed"',
        `data-provider="brightcove"`,
        `data-src="${escapeHtml(ref.url)}"`,
      ]
      if (account) attrs.push(`data-account="${escapeHtml(account)}"`)
      if (player) attrs.push(`data-player="${escapeHtml(player)}"`)
      if (videoId) attrs.push(`data-video-id="${escapeHtml(videoId)}"`)
      const label = escapeHtml(ref.description || ref.caption || 'Open video ↗')
      return `<div ${attrs.join(' ')}><a href="${escapeHtml(ref.url)}" target="_blank" rel="noopener noreferrer">${label}</a></div>`
    }
    if (/youtube\.com|youtu\.be/.test(lower)) {
      const title = escapeHtml(ref.description || 'YouTube video')
      return `<div class="ext-embed ext-video ext-youtube"><div class="aspect-video"><iframe src="${ref.url}" title="${title}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen frameborder="0"></iframe></div></div>`
    }
    const title = escapeHtml(ref.description || 'Embedded video')
    return `<div class="ext-embed ext-video"><iframe src="${ref.url}" title="${title}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen frameborder="0"></iframe></div>`
  }

  if (ref.type === 'embed' && ref.url) {
    return `<blockquote class="twitter-tweet"><a href="${ref.url}">${ref.url}</a></blockquote>`
  }

  return undefined
}

function extractHighlightedPhrase(ref: LinkReference, placeholderText: Map<string, string>): string | undefined {
  const fromContext = ref.context?.match(/«([^»]+)»/)
  if (fromContext?.[1]) return fromContext[1].trim()
  if (ref.token && placeholderText.has(ref.token)) return placeholderText.get(ref.token)
  return undefined
}

function buildCandidatePhrases(ref: LinkReference, placeholderText: Map<string, string>): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (value?: string) => {
    const normalized = value?.replace(/[«»]/g, '').trim()
    if (!normalized || normalized.length <= 1) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    ordered.push(normalized)
  }

  push(extractHighlightedPhrase(ref, placeholderText))
  push(ref.text)

  const baseVariants = [...ordered]
  for (const value of baseVariants) {
    const words = value.split(/\s+/).filter(Boolean)
    if (words.length > 3) push(words.slice(-3).join(' '))
    if (words.length > 2) push(words.slice(-2).join(' '))
    if (words.length > 1) push(words[words.length - 1])
  }

  return ordered
}

function buildSearchPattern(phrase: string): RegExp | undefined {
  const trimmed = phrase.trim()
  if (!trimmed) return undefined
  let pattern = ''
  let lastWasSpace = false
  for (const char of trimmed) {
    if (/\s/.test(char)) {
      if (!lastWasSpace) {
        pattern += '\\s+'
        lastWasSpace = true
      }
      continue
    }
    lastWasSpace = false
    if (char === '\'' || char === '’') {
      pattern += "['’]"
    } else {
      pattern += escapeRegExp(char)
    }
  }
  if (!pattern) return undefined
  return new RegExp(pattern, 'gi')
}

type NormalizedLinkReference = LinkReference & { url: string; text: string; token: string }

function applyLinkReferences(doc: Document, root: HTMLElement, references: LinkReference[]): void {
  if (!references?.length) return

  const normalizedRefs = references
    .map((ref, idx) => {
      const url = ref.url?.trim()
      const text = ref.text?.trim()
      const token = ref.token?.trim() || `ref-${idx + 1}`
      if (!url || !text) return null
      return { ...ref, url, text, token } as NormalizedLinkReference
    })
    .filter((ref): ref is NormalizedLinkReference => Boolean(ref))

  if (!normalizedRefs.length) return

  const refByToken = new Map<string, NormalizedLinkReference>()
  normalizedRefs.forEach((ref) => {
    refByToken.set(ref.token, ref)
  })

  const urlSet = new Set(normalizedRefs.map((ref) => ref.url))
  Array.from(root.querySelectorAll('a[href]')).forEach((anchor) => {
    const href = (anchor.getAttribute('href') || '').trim()
    if (href && urlSet.has(href)) {
      const textNode = doc.createTextNode(anchor.textContent || '')
      anchor.replaceWith(textNode)
    }
  })

  const placeholderText = new Map<string, string>()
  Array.from(root.querySelectorAll('ref')).forEach((node) => {
    const token = (node.getAttribute('data-ref') || node.getAttribute('data-token') || '').trim()
    const textValue = node.textContent || ''
    if (token && textValue.trim() && !placeholderText.has(token)) {
      placeholderText.set(token, textValue.trim())
    }
    node.replaceWith(doc.createTextNode(textValue))
  })

  const placeholderPattern = /\[\[REF:(\d+)\]\]/gi
  const replacePlaceholders = () => {
    const walker = doc.createTreeWalker(root, doc.defaultView!.NodeFilter.SHOW_TEXT)
    let current = walker.nextNode() as Text | null
    while (current) {
      const value = current.nodeValue || ''
      if (!placeholderPattern.test(value)) {
        current = walker.nextNode() as Text | null
        continue
      }
      placeholderPattern.lastIndex = 0
      const fragment = doc.createDocumentFragment()
      let lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = placeholderPattern.exec(value))) {
        const start = match.index
        if (start > lastIndex) fragment.appendChild(doc.createTextNode(value.slice(lastIndex, start)))
        const token = `ref-${match[1]}`
  const ref = refByToken.get(token)
        const fallback = ref?.text || ''
        if (fallback) fragment.appendChild(doc.createTextNode(fallback))
        lastIndex = placeholderPattern.lastIndex
      }
      if (lastIndex < value.length) fragment.appendChild(doc.createTextNode(value.slice(lastIndex)))
      current.parentNode?.replaceChild(fragment, current)
      current = walker.nextNode() as Text | null
    }
  }
  replacePlaceholders()

  const paragraphs = Array.from(root.querySelectorAll('p'))
  const textNodeType = doc.defaultView!.Node.TEXT_NODE
  const filter = {
    acceptNode(node: Node) {
      if (node.nodeType !== textNodeType) return doc.defaultView!.NodeFilter.FILTER_REJECT
      const parent = (node as Text).parentElement
      if (!parent) return doc.defaultView!.NodeFilter.FILTER_REJECT
      if (parent.closest('a, ref')) return doc.defaultView!.NodeFilter.FILTER_REJECT
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'CODE', 'PRE'].includes(parent.tagName)) {
        return doc.defaultView!.NodeFilter.FILTER_REJECT
      }
      if (!((node as Text).nodeValue || '').trim()) {
        return doc.defaultView!.NodeFilter.FILTER_SKIP
      }
      return doc.defaultView!.NodeFilter.FILTER_ACCEPT
    },
  }

  const findParagraphIndex = (element: Element | null): number => {
    if (!element) return -1
    const para = element.closest('p')
    if (!para) return -1
    return paragraphs.indexOf(para)
  }

  const dedupeTrailingDuplicate = (anchor: HTMLAnchorElement) => {
    const anchorText = anchor.textContent?.replace(/[\s\u00A0]+/g, ' ').trim()
    if (!anchorText) return
    const anchorLower = anchorText.toLowerCase()

    const maybeTrimNode = (target: Node | null): boolean => {
      if (!target || target.nodeType !== textNodeType) return false
      let value = (target as Text).nodeValue || ''
      if (!value) return false
      const leadingSpaceMatch = value.match(/^([\s\u00A0]+)/)
      const leading = leadingSpaceMatch ? leadingSpaceMatch[0] : ''
      let remainder = value.slice(leading.length)
      if (!remainder.toLowerCase().startsWith(anchorLower)) return false
      remainder = remainder.slice(anchorText.length)
      ;(target as Text).nodeValue = `${leading}${remainder}`
      return true
    }

    if (maybeTrimNode(anchor.nextSibling)) return
    let parent: HTMLElement | null = anchor.parentElement
    while (parent && parent !== root) {
      if (maybeTrimNode(parent.nextSibling)) break
      parent = parent.parentElement
    }
  }

  const wrapMatch = (node: Text, start: number, end: number, ref: NormalizedLinkReference) => {
    const value = node.nodeValue || ''
    const before = value.slice(0, start)
    const matched = value.slice(start, end)
    const after = value.slice(end)
    const anchor = doc.createElement('a')
    anchor.setAttribute('href', ref.url)
    anchor.setAttribute('rel', 'noopener noreferrer')
    anchor.setAttribute('target', '_blank')
    anchor.textContent = matched || ref.text || matched
    const frag = doc.createDocumentFragment()
    if (before) frag.appendChild(doc.createTextNode(before))
    frag.appendChild(anchor)
    if (after) frag.appendChild(doc.createTextNode(after))
    const parent = node.parentNode
    parent?.replaceChild(frag, node)
    if (anchor.isConnected) {
      dedupeTrailingDuplicate(anchor)
    }
  }

  const usedUrls = new Set<string>()

  const attemptPlacement = (ref: NormalizedLinkReference, candidates: string[], allowEarly: boolean): boolean => {
    for (const phrase of candidates) {
      const pattern = buildSearchPattern(phrase)
      if (!pattern) continue
      const walker = doc.createTreeWalker(root, doc.defaultView!.NodeFilter.SHOW_TEXT, filter as any)
      let textNode = walker.nextNode() as Text | null
      while (textNode) {
        const content = textNode.nodeValue || ''
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(content))) {
          const start = match.index
          const end = start + match[0].length
          const parent = textNode.parentElement
          if (!parent) continue
          const paraIndex = findParagraphIndex(parent)
          if (!allowEarly && paraIndex !== -1 && paraIndex < 2) continue
          const trimmed = match[0].replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '')
          if (!trimmed || trimmed.length <= 1) continue
          wrapMatch(textNode, start, end, ref)
          return true
        }
        textNode = walker.nextNode() as Text | null
      }
    }
    return false
  }

  for (const ref of normalizedRefs) {
    if (usedUrls.has(ref.url)) continue
    const candidates = buildCandidatePhrases(ref, placeholderText)
    const placedLate = attemptPlacement(ref, candidates, false)
    if (placedLate || attemptPlacement(ref, candidates, true)) {
      usedUrls.add(ref.url)
    }
  }

  cleanupBareUrls(doc, root, normalizedRefs)
}

function pruneEmptyNodes(root: HTMLElement) {
  const blockTags = new Set(['figure', 'blockquote', 'div', 'iframe', 'video'])
  const doc = root.ownerDocument

  root.querySelectorAll('p').forEach((p) => {
    const parent = p.parentNode
    if (!parent) return

    const replacements: Node[] = []
    let workingPara: HTMLParagraphElement | null = doc.createElement('p')

    while (p.firstChild) {
      const child = p.firstChild
      const isElement = child.nodeType === 1
      const tag = isElement ? (child as Element).tagName.toLowerCase() : undefined

      if (tag && blockTags.has(tag)) {
        if (workingPara && workingPara.childNodes.length) {
          replacements.push(workingPara)
          workingPara = doc.createElement('p')
        }
        replacements.push(child)
      } else {
        if (!workingPara) workingPara = doc.createElement('p')
        workingPara.appendChild(child)
      }
    }

    if (workingPara && workingPara.childNodes.length) {
      replacements.push(workingPara)
    }

    // Remove empty paragraph nodes
    const filtered = replacements.filter((node) => {
      if (node.nodeType !== 1) return true
      const el = node as HTMLElement
      if (el.tagName.toLowerCase() !== 'p') return true
      return el.textContent?.trim() || el.querySelector('img,figure,iframe,video,blockquote,div')
    })

    if (!filtered.length) {
      parent.removeChild(p)
      return
    }

    for (const node of filtered) {
      parent.insertBefore(node, p)
    }
    parent.removeChild(p)
  })

  Array.from(root.querySelectorAll('div')).forEach((div) => {
    if (!div.className && !div.textContent?.trim() && !div.querySelector('*')) {
      div.remove()
    }
  })
}

function cleanupBareUrls(doc: Document, root: HTMLElement, refs: NormalizedLinkReference[]) {
  if (!refs.length) return
  const urlSet = new Set<string>()
  refs.forEach((ref) => {
    const trimmed = ref.url.trim()
    const withoutSlash = trimmed.replace(/\/*$/, '')
    urlSet.add(trimmed)
    urlSet.add(withoutSlash)
    urlSet.add(trimmed.toLowerCase())
    urlSet.add(withoutSlash.toLowerCase())
  })
  const walker = doc.createTreeWalker(root, doc.defaultView!.NodeFilter.SHOW_TEXT)
  const urlRegex = /\s*(\(?)(https?:\/\/[^\s)]+)(\)?)/gi
  let node = walker.nextNode() as Text | null
  while (node) {
    const original = node.nodeValue || ''
    if (!original || original.toLowerCase().indexOf('http') === -1) {
      node = walker.nextNode() as Text | null
      continue
    }
    let changed = false
    const updated = original.replace(urlRegex, (match, _leadingParen, rawUrl) => {
      const trimmed = rawUrl.trim().replace(/[)\],.;!?]+$/g, '')
      const normalized = trimmed.replace(/\/*$/, '')
      const lower = trimmed.toLowerCase()
      const lowerNormalized = normalized.toLowerCase()
      const matches = urlSet.has(trimmed) || urlSet.has(normalized) || urlSet.has(lower) || urlSet.has(lowerNormalized)
      if (!matches) return match
      changed = true
      const spacePrefix = /^\s+/.test(match) ? ' ' : ''
      const spaceSuffix = /\s+$/.test(match) ? ' ' : ''
      return `${spacePrefix}${spaceSuffix}`
    })
    if (changed) {
      node.nodeValue = updated.replace(/\s{2,}/g, ' ')
    }
    node = walker.nextNode() as Text | null
  }
}

function stripMisplacedSocialWrappers(root: HTMLElement) {
  const socials = Array.from(root.querySelectorAll('div.ext-social')) as HTMLElement[]
  socials.forEach((wrapper) => {
    if (wrapper.querySelector('iframe, blockquote, .ext-embed, figure')) return
    const text = wrapper.textContent || ''
    if (/\[\[(?:EMBED|IMG|VIDEO):\d+\]\]/.test(text)) return
    const parent = wrapper.parentNode
    while (wrapper.firstChild) {
      parent?.insertBefore(wrapper.firstChild, wrapper)
    }
    wrapper.remove()
  })
}

const MIN_HEADING_WORDS = 3
const MAX_HEADING_WORDS = 9

const LOWERCASE_WORDS = new Set(['and', 'as', 'at', 'but', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with'])

function normalizeHeadingCase(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const normalized = tokens.map((token, idx) => {
    const leading = token.match(/^["'“”‘’(]+/)?.[0] ?? ''
    const trailing = token.match(/["'“”‘’)\],:;!?]+$/)?.[0] ?? ''
    const core = token.slice(leading.length, token.length - trailing.length)
    if (!core) return `${leading}${trailing}`
    const isAllCaps = core === core.toUpperCase() && /[A-Z]/.test(core)
    const isLowerConnector = LOWERCASE_WORDS.has(core.toLowerCase())
    let body: string
    if (idx === 0) {
      const lower = core.toLowerCase()
      body = lower.charAt(0).toUpperCase() + lower.slice(1)
    } else if (isLowerConnector) {
      body = core.toLowerCase()
    } else if (isAllCaps) {
      body = core.length <= 3 ? core : core.charAt(0).toUpperCase() + core.slice(1).toLowerCase()
    } else if (/^[A-Z]/.test(core)) {
      body = core
    } else {
      body = core.toLowerCase()
    }
    return `${leading}${body}${trailing}`
  })
  return normalized.join(' ')
}

function deriveHeadingText(paragraph: HTMLElement): string | undefined {
  const raw = paragraph.textContent?.replace(/[\s\u00A0]+/g, ' ').trim() || ''
  if (!raw) return undefined
  if (raw.length < 40) return undefined
  if (/\[\[(?:EMBED|IMG|VIDEO):\d+\]\]/.test(raw)) return undefined
  const firstSentence = raw.split(/(?<=[.!?])\s+/)[0] || raw
  let cleaned = firstSentence.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '')
  cleaned = cleaned.replace(/\([^)]*\)$/g, '').replace(/[:;]+$/g, '').trim()
  if (!cleaned) return undefined
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length < MIN_HEADING_WORDS) return undefined
  let limited = words.slice(0, Math.min(MAX_HEADING_WORDS, words.length)).join(' ')
  limited = limited.replace(/[,–—-]+$/g, '').trim()
  if (!limited) return undefined
  return normalizeHeadingCase(limited)
}

function ensureSectionHeadings(root: HTMLElement, minHeadings = 2) {
  const doc = root.ownerDocument
  const existing = Array.from(root.querySelectorAll('h2, h3')) as HTMLElement[]
  if (existing.length >= minHeadings) return
  const paragraphs = Array.from(root.querySelectorAll('p')).filter((p) => {
    const text = p.textContent?.trim() || ''
    if (!text) return false
    if (/\[\[(?:EMBED|IMG|VIDEO):\d+\]\]/.test(text)) return false
    if (p.closest('div.ext-quote')) return false
    return true
  })
  if (paragraphs.length < 3) return
  const needed = Math.min(minHeadings - existing.length, 3)
  if (needed <= 0) return
  const inserted: string[] = existing.map((h) => (h.textContent || '').trim().toLowerCase())
  const segmentSize = Math.floor(paragraphs.length / (needed + 1)) || 1
  for (let i = 1; i <= needed; i++) {
    const targetIdx = Math.min(paragraphs.length - 1, Math.max(1, segmentSize * i))
    const paragraph = paragraphs[targetIdx]
    if (!paragraph || paragraph.previousElementSibling && /h[23]/i.test(paragraph.previousElementSibling.tagName)) continue
    const headingText = deriveHeadingText(paragraph) || `Section ${i + existing.length}`
    if (!headingText) continue
    const normalized = headingText.toLowerCase()
    if (inserted.includes(normalized)) continue
    const heading = doc.createElement('h2')
    heading.textContent = headingText
    paragraph.parentNode?.insertBefore(heading, paragraph)
    inserted.push(normalized)
  }
}

type PipelineOptions = {
  baseURL?: string
  maxOutputTokens?: number
  promptTokenLimit?: number
  totalTokenBudget?: number
  onUsage?: (event: PipelineUsageEvent) => void
}

const DEFAULT_MODEL = 'grok-4-fast-reasoning'
const DEFAULT_BASE_URL = 'https://api.x.ai/v1'
const DEFAULT_MAX_OUTPUT_TOKENS = 480
const DEFAULT_PROMPT_TOKEN_LIMIT = 2_000_000
const DEFAULT_TOTAL_TOKEN_BUDGET = 4_000_000

export class OpenAIPipeline implements AIPipelineProvider {
  name = 'xai-grok'
  private client: OpenAI
  private model: string
  private usageEvents: PipelineUsageEvent[] = []
  private onUsage?: (event: PipelineUsageEvent) => void
  private maxOutputTokens: number
  private baseURL: string
  private promptTokenLimit: number
  private totalTokenBudget: number

  constructor(apiKey: string, model = process.env.AI_MODEL || DEFAULT_MODEL, options?: PipelineOptions) {
  this.baseURL = options?.baseURL || process.env.AI_BASE_URL || DEFAULT_BASE_URL
  const resolvedMax = options?.maxOutputTokens ?? Number(process.env.AI_MAX_OUTPUT_TOKENS || DEFAULT_MAX_OUTPUT_TOKENS)
  this.maxOutputTokens = Number.isFinite(resolvedMax) && resolvedMax > 0 ? resolvedMax : DEFAULT_MAX_OUTPUT_TOKENS
    const resolvedPromptLimit = options?.promptTokenLimit ?? Number(process.env.AI_PROMPT_TOKEN_LIMIT || DEFAULT_PROMPT_TOKEN_LIMIT)
    this.promptTokenLimit = Number.isFinite(resolvedPromptLimit) && resolvedPromptLimit > 0 ? resolvedPromptLimit : DEFAULT_PROMPT_TOKEN_LIMIT
    const resolvedTotalBudget = options?.totalTokenBudget ?? Number(process.env.AI_TOTAL_TOKEN_BUDGET || DEFAULT_TOTAL_TOKEN_BUDGET)
    this.totalTokenBudget = Number.isFinite(resolvedTotalBudget) && resolvedTotalBudget > 0 ? resolvedTotalBudget : DEFAULT_TOTAL_TOKEN_BUDGET
    this.client = new OpenAI({ apiKey, baseURL: this.baseURL })
    this.model = model || DEFAULT_MODEL
    this.onUsage = options?.onUsage
  }

  private async jsonRequest(prompt: string, temperature: number, meta: RequestMeta): Promise<string> {
    if (this.promptTokenLimit) {
      const approxTokens = Math.ceil(prompt.length / 4)
      if (approxTokens > this.promptTokenLimit) {
        console.warn('[ai] prompt estimated tokens exceed configured limit', {
          label: meta.label,
          approxTokens,
          limit: this.promptTokenLimit,
        })
      }
    }
    const useResponses = /^gpt-5/i.test(this.model)
    const started = Date.now()
    if (useResponses) {
      const res = await this.client.responses.create({
        model: this.model,
        instructions: sysBase,
        input: prompt,
        max_output_tokens: this.maxOutputTokens,
      })
      this.recordUsage(meta, temperature, Date.now() - started, (res as any)?.usage)
      // SDK provides concatenated text convenience
      return (res as any).output_text ?? JSON.stringify(res)
    }
    const { choices } = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: sysBase }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' as any },
      temperature,
      max_tokens: this.maxOutputTokens,
    }).then((res) => {
      this.recordUsage(meta, temperature, Date.now() - started, res.usage)
      return res
    })
    return choices[0]?.message?.content || '{}'
  }

  private recordUsage(meta: RequestMeta, temperature: number, durationMs: number, usage: any) {
    const promptTokens = usage?.prompt_tokens ?? usage?.promptTokens ?? 0
    const completionTokens = usage?.completion_tokens ?? usage?.completionTokens ?? 0
    const totalTokens = usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens + completionTokens)
    const event: PipelineUsageEvent = {
      id: cryptoRandomId(),
      label: meta.label,
      model: this.model,
      temperature,
      durationMs,
      createdAt: new Date().toISOString(),
      promptTokens,
      completionTokens,
      totalTokens,
    }
    this.usageEvents.push(event)
    if (this.totalTokenBudget && event.totalTokens > this.totalTokenBudget) {
      console.warn('[ai] total token usage exceeded configured budget', {
        label: meta.label,
        totalTokens: event.totalTokens,
        configuredBudget: this.totalTokenBudget,
      })
    }
    if (this.onUsage) this.onUsage(event)
  }

  getUsageSummary(): PipelineUsageSummary {
    const totals = this.usageEvents.reduce((acc, evt) => {
      acc.requests += 1
      acc.promptTokens += evt.promptTokens
      acc.completionTokens += evt.completionTokens
      acc.totalTokens += evt.totalTokens
      acc.totalDurationMs += evt.durationMs
      return acc
    }, { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, totalDurationMs: 0 })
    const byLabel: PipelineUsageSummary['byLabel'] = {}
    for (const evt of this.usageEvents) {
      const bucket = byLabel[evt.label] ||= {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalDurationMs: 0,
        averageTokensPerRequest: 0,
        averageLatencyMs: 0,
      }
      bucket.requests += 1
      bucket.promptTokens += evt.promptTokens
      bucket.completionTokens += evt.completionTokens
      bucket.totalTokens += evt.totalTokens
      bucket.totalDurationMs += evt.durationMs
    }
    for (const label of Object.keys(byLabel)) {
      const bucket = byLabel[label]
      bucket.averageTokensPerRequest = bucket.requests ? bucket.totalTokens / bucket.requests : 0
      bucket.averageLatencyMs = bucket.requests ? bucket.totalDurationMs / bucket.requests : 0
    }
    const averageTokensPerRequest = totals.requests ? totals.totalTokens / totals.requests : 0
    const averageLatencyMs = totals.requests ? totals.totalDurationMs / totals.requests : 0
    return {
      totals: {
        ...totals,
        averageTokensPerRequest,
        averageLatencyMs,
      },
      byLabel,
      events: [...this.usageEvents],
    }
  }

  resetUsage() {
    this.usageEvents = []
  }

  finalizeDraft(draft: DraftVariant, input: { linkReferences?: LinkReference[]; mediaReferences?: MediaReference[] }): DraftVariant {
    const body = draft.body || ''
    const finalized = this.finalizeBody(body, input.linkReferences, input.mediaReferences)
    return { ...draft, body: finalized }
  }

  private finalizeBody(body: string, linkReferences?: LinkReference[], mediaReferences?: MediaReference[]): string {
    if (!body) return ''
    let linkedHtml = body
    if (linkReferences?.length) {
      try {
        const dom = new JSDOM(`<div data-root="root">${body}</div>`)
        const doc = dom.window.document
        const root = doc.querySelector('div[data-root="root"]') as HTMLElement | null
        if (root) {
          applyLinkReferences(doc, root, linkReferences)
          linkedHtml = root.innerHTML
        }
      } catch {
        linkedHtml = body
      }
    }

    const htmlWithMedia = this.restoreMediaTokens(linkedHtml, mediaReferences)

    let result = htmlWithMedia
    try {
      const dom = new JSDOM(`<div data-root="root">${htmlWithMedia}</div>`)
      const doc = dom.window.document
      const root = doc.querySelector('div[data-root="root"]') as HTMLElement | null
      if (!root) return htmlWithMedia.trim()
      pruneEmptyNodes(root)
      stripMisplacedSocialWrappers(root)
      ensureSectionHeadings(root)
      result = root.innerHTML.trim()
    } catch {
      result = htmlWithMedia.trim()
    }

    result = result.replace(/\[\[(?:IMG|VIDEO|EMBED):\d+\]\]/g, '')
    result = result.replace(/\[\[REF:\d+\]\]/g, '')
    result = result.replace(/[«»]/g, '')
    return result
  }

  private scrubGeneratedBody(body: string | undefined | null): string {
    if (!body) return ''
    let output = body.replace(/\u00A0/g, ' ')

    // Collapse duplicated word sequences (case-insensitive) that appear consecutively.
    output = output.replace(/\b([A-Za-zÀ-ÖØ-öø-ÿ'’.-]{3,})\s+\1\b/gi, '$1')

    // Collapse duplicated proper noun phrases (e.g., "Moyuka Uchijima Moyuka Uchijima").
    output = output.replace(/([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+){0,3})\s*\1/g, '$1')

    // Normalize repeated "according to" phrases after the first occurrence.
    let accordingCount = 0
    output = output.replace(/(<em[^>]*>)?\s*(according to)(\s*<\/em>)?/gi, (_match, open = '', _phrase, close = '') => {
      accordingCount += 1
      if (accordingCount <= 1) return `${open || ''}according to${close || ''}`
      return `${open || ''}as noted by${close || ''}`
    })

    return output
  }

  private restoreMediaTokens(body: string, refs?: MediaReference[]): string {
    if (!body || !refs?.length) return body
    let output = body
    for (const ref of refs) {
      if (!ref.token) continue
      const html = buildMediaHtmlFromRef(ref)?.trim()
      const tokenEsc = escapeRegExp(ref.token)
      const blockRegex = new RegExp(String.raw`<p>\s*${tokenEsc}\s*</p>`, 'gi')
      let replaced = false
      if (html) {
        if (blockRegex.test(output)) {
          output = output.replace(blockRegex, html)
          replaced = true
        }
        blockRegex.lastIndex = 0
        const inlineRegex = new RegExp(tokenEsc, 'g')
        if (inlineRegex.test(output)) {
          inlineRegex.lastIndex = 0
          output = output.replace(inlineRegex, html)
          replaced = true
        }
        if (!replaced) {
          output = `${output}\n${html}`
        }
      } else {
        output = output.replace(blockRegex, '')
        output = output.replace(new RegExp(tokenEsc, 'g'), '')
      }
    }
    return output
  }

  private parseJsonResponse(raw: string): any {
    const tryParse = (value: string | null | undefined) => {
      if (!value) return null
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    }
    let parsed = tryParse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    if (raw) {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start !== -1 && end > start) {
        const slice = raw.slice(start, end + 1)
        parsed = tryParse(slice)
        if (parsed && typeof parsed === 'object') return parsed
      }
    }
    return {}
  }

  private shouldRetry(bodyValue: string | undefined | null, minTarget: number): boolean {
    const body = (bodyValue || '').trim()
    if (!body) return true
    const threshold = Math.max(400, Math.floor(minTarget * 0.6))
    return body.length < threshold
  }

  private buildFallbackBodyFromSource(bodyText?: string, limit = 12): string {
    if (!bodyText) return ''
    const paragraphs = bodyText
      .split(/\n{2,}/)
      .map((seg) => seg.trim())
      .filter(Boolean)
      .slice(0, limit)
    if (!paragraphs.length) return ''
    return paragraphs.map((seg) => `<p>${escapeHtml(seg)}</p>`).join('\n')
  }

  private stripHtml(value: string): string {
    if (!value) return ''
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  async generateArticle(input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }, options: GenerateArticleOptions = {}): Promise<DraftVariant> {
    const baseLen = input.bodyText?.length ?? input.excerpt?.length ?? input.title.length ?? 0
    const strategy = options.strategy || 'single'
    const minTargetDefault = strategy === 'variant' ? 700 : 800
    const minTarget = options.minTarget ?? Math.max(baseLen + (strategy === 'variant' ? 150 : 200), minTargetDefault)
    const numericTokens = Array.from(new Set((input.bodyText || '')
      .match(/\b\d{1,4}(?:[,.]\d{1,3})?\b/g) || []))
      .slice(0, 60)
    const numericGuidance = numericTokens.length
      ? `Preserve numeric values exactly: ${numericTokens.join(', ')}`
      : undefined
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const linkGuidance = buildLinkGuidance(input.linkReferences)
    const mediaGuidance = buildMediaGuidance(input.mediaReferences)
    const mediaRequirement = input.mediaReferences?.length
      ? 'Use each media token (e.g., [[EMBED:1]]) exactly once where the embed belongs. Tokens must appear on their own <p> line immediately after the paragraph that references that media. Do not wrap tokens inside <a> tags, commentary, or <div class="ext-social"> wrappers, and never alter their spelling. If a token does not fit organically, place it immediately after the relevant paragraph.'
      : 'If media tokens like [[EMBED:1]] or [[IMG:1]] appear, leave them untouched so the pipeline can swap in the original embed; tokens must stand alone on their own <p> line.'
    const linkRequirement = input.linkReferences?.length
      ? 'Integrate every provided reference inline at the first relevant mention using the supplied wording. Never surface the raw URL (no parentheses, brackets, or bare links) and do not add extra outbound links.'
      : 'Only add hyperlinks when absolutely necessary for clarity and factual accuracy, and never surface the raw URL in parentheses or inline.'
    const priorVariantSummaries = strategy === 'variant' && options.variants?.length
      ? options.variants.slice(-2).map((variant, idx, arr) => ({
          index: options.variants!.length - arr.length + idx + 1,
          title: variant.title,
          excerpt: variant.excerpt,
          body: this.stripHtml(variant.body || '').slice(0, 600),
        }))
      : undefined

    const promptSegments = [
      `Today: ${todayStr}`,
      `Source title: ${input.title}`,
      input.excerpt ? `Source excerpt/dek:\n${input.excerpt}` : undefined,
      input.bodyText ? `Source body (cleaned):\n${input.bodyText}` : undefined,
      input.context ? `Context: ${input.context}` : undefined,
      linkGuidance,
      mediaGuidance,
  'Structure alignment: follow the source ordering of key ideas, quotes, and embeds; do not invent new wrapper elements or relocate tokens away from their referenced paragraphs.',
      numericGuidance,
      strategy === 'variant'
        ? 'Task: Draft an alternate angle article as JSON {"title": string, "excerpt": string, "body": string}. Offer a distinct framing from other variants while staying accurate.'
        : 'Task: Produce a publication-ready article as JSON {"title": string, "excerpt": string, "body": string}.' ,
      options.variantHint ? `Variant focus: ${options.variantHint}` : undefined,
      priorVariantSummaries?.length
        ? `Earlier variants generated so far:\n${JSON.stringify(priorVariantSummaries).slice(0, 12000)}`
        : undefined,
      priorVariantSummaries?.length
        ? 'Stay aligned with factual details established earlier while presenting a complementary perspective. Reuse the same subjects/links where relevant and avoid contradicting prior sections.'
        : undefined,
      strategy === 'final' && options.variants?.length
        ? `Earlier drafts to integrate (summaries):\n${JSON.stringify(options.variants.slice(0, 3).map((variant, idx) => ({
            index: idx + 1,
            title: variant.title,
            excerpt: variant.excerpt,
            body: this.stripHtml(variant.body || ''),
          }))).slice(0, 15000)}`
        : undefined,
      strategy === 'final' && options.variants?.length
        ? 'Synthesize the strongest final article: merge the best insights, remove duplicate phrasing, keep unique player mentions once per paragraph, and resolve tone/tense conflicts.'
        : undefined,
      `Title & excerpt: craft a headline that feels like a human tennis feature (no gimmicky colons or ALL CAPS) and an excerpt that invites the reader in with tension or momentum—avoid repeating the opener verbatim.`,
      `Body requirements:\n• Minimum length ${minTarget} characters.\n• Use 2–3 <h2> subheads after the opener; each is 4–8 words, in sentence case, and hints at the human or tactical pivot that follows.\n• Keep paragraphs grouped beneath those subheads; avoid bullet lists, numbered steps, or blueprint language.\n• Keep the opening paragraph free of attributions. From paragraph two onward, vary verbs (limit the exact phrase "according to" to one use).\n• Emphasize concrete tennis detail (patterns, surfaces, adjustments) while weaving in emotion, crowd energy, and context.`,
      `Reference handling:\n• Mention each subject once with its provided wording, then prefer pronouns or descriptors.\n• Integrate links naturally within sentences; no trailing "Source" blocks or link lists.\n• Never repeat the same full name back-to-back or create doubled wording.`,
      `Link formatting: never output bare URLs, markdown links, or parentheses containing URLs. Write the subject text only; downstream formatting attaches the href.`,
      `Media handling:\n${mediaRequirement}`,
      'Narrative voice: write with the cadence of a seasoned tennis analyst on site—blend tactile imagery (light, sound, tempo) with strategic insight, and close sections with forward-looking beats rather than summaries.',
      `Language hygiene:\n• Remove emojis/hashtags.\n• Prefer "slice"/"underspin", "inside-in"/"inside-out", "down-the-line", "crosscourt", and "1–2"/"one–two" combinations.\n• Keep paragraphs concise (2–4 sentences) and never use ALL CAPS.`,
      linkRequirement,
      strategy === 'variant'
        ? 'Distinctiveness: diverge from other drafts by highlighting different match context, stats, or tactical takeaways while remaining factual.'
        : undefined,
      strategy === 'final'
        ? 'Final polish: ensure flow is cohesive, eliminate redundancy, and end with a forward-looking takeaway. Do not mention the drafting process.'
        : undefined,
      'Return only JSON (no Markdown fences or commentary).',
    ].filter(Boolean)

    const prompt = promptSegments.join('\n\n')
    const labelBase = options.label || (strategy === 'variant' ? 'article:variant' : strategy === 'final' ? 'article:final' : 'article:seed')
    const content = await this.jsonRequest(prompt, options.temperature ?? (strategy === 'variant' ? 0.6 : 0.55), { label: labelBase })
    let parsed: any = this.parseJsonResponse(content)

    if (this.shouldRetry(parsed?.body, minTarget)) {
      const retryPromptSegments = [
        ...promptSegments,
        'Previous attempt was incomplete. Regenerate the full article meeting every requirement. Respond with JSON only.',
      ]
      const retryPrompt = retryPromptSegments.join('\n\n')
      const retryContent = await this.jsonRequest(retryPrompt, options.retryTemperature ?? (strategy === 'variant' ? 0.5 : 0.45), { label: `${labelBase}:retry` })
      const retryParsed = this.parseJsonResponse(retryContent)
      const retryLength = typeof retryParsed.body === 'string' ? retryParsed.body.trim().length : 0
      const baselineLength = typeof parsed.body === 'string' ? parsed.body.trim().length : 0
      if (retryLength > baselineLength) {
        parsed = retryParsed
      }
    }

    let generatedBody = typeof parsed.body === 'string' ? parsed.body : ''
    if (!generatedBody.trim()) {
      generatedBody = this.buildFallbackBodyFromSource(input.bodyText)
    }

    const draft: DraftVariant = {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : input.title,
      excerpt: typeof parsed.excerpt === 'string' && parsed.excerpt.trim() ? parsed.excerpt.trim() : input.excerpt,
      body: generatedBody,
    }

    const scrubbedBody = this.scrubGeneratedBody(draft.body)
    const hydratedDraft: DraftVariant = { ...draft, body: scrubbedBody }
    return this.finalizeDraft(hydratedDraft, {
      linkReferences: input.linkReferences,
      mediaReferences: input.mediaReferences,
    })
  }

  async generateArticleBundle(input: {
    title: string
    excerpt?: string
    bodyText?: string
    context?: string
    linkReferences?: LinkReference[]
    mediaReferences?: MediaReference[]
  }, options: GenerateArticleBundleOptions = {}): Promise<{ variants: DraftVariant[]; final: DraftVariant }> {
    const variantCount = Math.max(2, options.variantCount ?? 2)
    const baseHints = [
      'Highlight the psychological arc and season-long pressure narrative, weaving in key quotes and schedule context.',
      'Focus on tactical adjustments, matchup specifics, rankings math, and surface considerations that shape the run.',
      'Spotlight comparative peers, analytics, and historical precedents that frame the player’s trajectory.',
    ]
    const variantHints = options.variantHints && options.variantHints.length ? options.variantHints : baseHints
    const variants: DraftVariant[] = []
    for (let i = 0; i < variantCount; i++) {
      const hint = variantHints[i] || `Deliver a complementary perspective #${i + 1} with distinct insights.`
      const variant = await this.generateArticle(input, {
        strategy: 'variant',
        variantHint: hint,
        label: `article:variant#${i + 1}`,
        temperature: 0.6 + Math.min(0.1, i * 0.05),
        retryTemperature: 0.5,
        variants: variants.slice(),
      })
      variants.push(variant)
    }
    const finalDraft = await this.generateArticle(input, {
      strategy: 'final',
      variants,
      label: 'article:final',
      temperature: 0.5,
      retryTemperature: 0.45,
    })
    return { variants, final: finalDraft }
  }
}

function buildLinkGuidance(linkReferences?: LinkReference[]): string | undefined {
  if (!linkReferences?.length) return undefined
  const items = linkReferences.slice(0, 80).map((ref) => {
    const order = ref.order ?? linkReferences.indexOf(ref) + 1
    const label = ref.text.trim().replace(/\s+/g, ' ')
    const token = ref.token ? `token=${ref.token}` : 'token=<none>'
    const ctx = ref.context ? ` | context: ${ref.context}` : ''
    return `  ${order}. ${label} -> ${ref.url}${ctx}`
  })
  return [
    'Reference subjects (mention each once with this wording, then rely on pronouns or descriptors):',
    ...items,
    'Integrate the link inline at first mention; do not create a trailing list or print the raw URL text.',
  ].join('\n')
}

function buildMediaGuidance(mediaReferences?: MediaReference[]): string | undefined {
  if (!mediaReferences?.length) return undefined
  const items = mediaReferences.slice(0, 80).map((ref, idx) => {
    const desc = ref.description ? ` — ${ref.description}` : ''
    const cap = ref.caption ? ` (caption: ${ref.caption})` : ''
    const url = ref.url ? ` — ${ref.url}` : ''
    const ctx = ref.context ? ` | context: ${ref.context}` : ''
    return `  ${idx + 1}. ${ref.token} (${ref.type})${desc}${cap}${url}${ctx}`
  })
  return [
    'Media assets (use each token exactly once where the story references that asset; tokens will be replaced downstream):',
    ...items,
  ].join('\n')
}
