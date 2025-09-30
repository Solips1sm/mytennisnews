import crypto from 'node:crypto'
import OpenAI from 'openai'
import { JSDOM } from 'jsdom'
import { AIPipelineProvider, DraftVariant, LinkReference, MediaReference } from './index'

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

const sysBase = `You are a visionary tennis specialist and editor. You synthesize trends and tactics with forward-looking insight, not coaching instructions. You write insightful, neutral analysis that respects sources (no copying). You paraphrase, add context (players, tournament, rankings/Elo, surfaces, H2H, recent form, tactical patterns), and avoid hallucinations. If uncertain, say so. Keep tone professional, accessible (WCAG-friendly), with short paragraphs and precise high-end tennis nomenclature.

Glossary and direction conventions: prefer "inside-in", "inside-out", "crosscourt", and "down-the-line" when describing shot direction. Avoid using "ad court" or "deuce court" as directional labels in body copy (acceptable only for serve formations or score context).
Terminology: say "slice" or "underspin" (do not say "slider"); say "1–2" or "one–two" combinations (do not say "serve+1").

Semantic block rules for output HTML:
• Use <p> for standard narrative paragraphs.
• If including a direct quote (allowed only after paragraph 2), wrap it as: <div class="ext-quote"><blockquote>Quoted text ...</blockquote></div> (no citation line unless organically needed; keep within 1–3 sentences).
• If summarizing or transcribing a social/media style update (e.g. tweet-like content with @handles or score-line micro-updates) use: <div class="ext-social"><p>Content...</p></div> and keep it concise.
• Do not fabricate social posts or quotes—only create these blocks when derivative from source context; otherwise keep narrative in <p>.
• Never put references/attributions in the first two paragraphs; from paragraph 3 onward wrap attribution verbs/phrases (via, per, according to) in <em>.
• Strip brand/sponsor fluff (Lexus, Infosys, Emirates, Rolex promotional taglines) unless essential for factual context.
• Remove emojis and hashtags (#Example) in generated text while preserving the informational meaning.
• Avoid over-nesting: no blockquote inside blockquote; each quote block stands alone.`

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
  'aria-label',
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
    if (name.startsWith('data-') && name !== 'data-tweet-id') {
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
          twitter.querySelectorAll('script').forEach((s) => s.remove())
          twitter.setAttribute(
            'class',
            Array.from(new Set((twitter.getAttribute('class') || '').split(/\s+/).concat('twitter-tweet').filter(Boolean))).join(' '),
          )
          cleanMediaElement(twitter)
          return twitter.outerHTML
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
    const title = escapeHtml(ref.description || 'Embedded video')
    return `<div class="ext-embed ext-video"><iframe src="${ref.url}" title="${title}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen frameborder="0"></iframe></div>`
  }

  if (ref.type === 'embed' && ref.url) {
    return `<blockquote class="twitter-tweet"><a href="${ref.url}">${ref.url}</a></blockquote>`
  }

  return undefined
}

function enforceLinkReferencesInDom(doc: Document, root: HTMLElement, references: LinkReference[]) {
  for (const ref of references) {
    const text = ref.text?.trim()
    const url = ref.url?.trim()
    if (!text || !url) continue
    const existing = Array.from(root.querySelectorAll('a[href]')).find((a) => (a.getAttribute('href') || '').trim() === url)
    if (existing) continue
    const walker = doc.createTreeWalker(root, doc.defaultView!.NodeFilter.SHOW_TEXT)
    let inserted = false
    while (!inserted) {
      const node = walker.nextNode() as Text | null
      if (!node) break
      const parent = node.parentElement
      if (!parent || parent.closest('a')) continue
      const value = node.nodeValue || ''
      const idx = value.toLowerCase().indexOf(text.toLowerCase())
      if (idx === -1) continue
      const before = value.slice(0, idx)
      const match = value.slice(idx, idx + text.length)
      const after = value.slice(idx + text.length)
      const anchor = doc.createElement('a')
      anchor.setAttribute('href', url)
      anchor.setAttribute('rel', 'noopener noreferrer')
      anchor.textContent = match
      const fragment = doc.createDocumentFragment()
      if (before) fragment.appendChild(doc.createTextNode(before))
      fragment.appendChild(anchor)
      if (after) fragment.appendChild(doc.createTextNode(after))
      node.parentNode?.replaceChild(fragment, node)
      inserted = true
    }
    if (!inserted) {
      const anchor = doc.createElement('a')
      anchor.setAttribute('href', url)
      anchor.setAttribute('rel', 'noopener noreferrer')
      anchor.textContent = text
      const para = doc.createElement('p')
      para.appendChild(anchor)
      root.appendChild(para)
    }
  }
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

export class OpenAIPipeline implements AIPipelineProvider {
  name = 'openai'
  private client: OpenAI
  private model: string
  private usageEvents: PipelineUsageEvent[] = []
  private onUsage?: (event: PipelineUsageEvent) => void

  constructor(apiKey: string, model = process.env.AI_MODEL || 'gpt-5-mini', options?: { onUsage?: (event: PipelineUsageEvent) => void }) {
    this.client = new OpenAI({ apiKey })
    this.model = model
    this.onUsage = options?.onUsage
  }

  private async jsonRequest(prompt: string, temperature: number, meta: RequestMeta): Promise<string> {
    const useResponses = /^gpt-5/i.test(this.model)
    const started = Date.now()
    if (useResponses) {
      const res = await this.client.responses.create({
        model: this.model,
        instructions: sysBase,
        input: prompt,
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

  finalizeDrafts(drafts: DraftVariant[], input: { linkReferences?: LinkReference[]; mediaReferences?: MediaReference[] }): DraftVariant[] {
    return drafts.map((draft) => this.finalizeDraft(draft, input))
  }

  private finalizeBody(body: string, linkReferences?: LinkReference[], mediaReferences?: MediaReference[]): string {
    if (!body) return ''
    let html = this.restoreMediaTokens(body, mediaReferences)
    html = html.replace(/\[\[(?:IMG|VIDEO|EMBED):\d+\]\]/g, '')

    let result = html
    try {
      const dom = new JSDOM(`<div data-root="root">${html}</div>`)
      const doc = dom.window.document
      const root = doc.querySelector('div[data-root="root"]') as HTMLElement | null
      if (!root) return html.trim()
      if (linkReferences?.length) {
        enforceLinkReferencesInDom(doc, root, linkReferences)
      }
      pruneEmptyNodes(root)
      result = root.innerHTML.trim()
    } catch {
      // fall back to html without DOM adjustments
      result = html.trim()
    }
    return result
  }

  private restoreMediaTokens(body: string, refs?: MediaReference[]): string {
    if (!body || !refs?.length) return body
    let output = body
    for (const ref of refs) {
      if (!ref.token) continue
      const html = buildMediaHtmlFromRef(ref)?.trim()
      const tokenEsc = escapeRegExp(ref.token)
      const blockRegex = new RegExp(`<p>\\s*${tokenEsc}\\s*</p>`, 'gi')
      if (html) {
        output = output.replace(blockRegex, html)
        output = output.replace(new RegExp(tokenEsc, 'g'), html)
      } else {
        output = output.replace(blockRegex, '')
        output = output.replace(new RegExp(tokenEsc, 'g'), '')
      }
    }
    return output
  }

  async generateVariants(input: { title: string; excerpt?: string; bodyText?: string; context?: string; linkReferences?: LinkReference[]; mediaReferences?: MediaReference[] }, count: number): Promise<DraftVariant[]> {
    const baseLen = (input.bodyText?.length || input.excerpt?.length || input.title.length || 0)
    const minTarget = Math.max(baseLen + 200, 800) // ensure reasonable floor
    // Extract distinct numeric tokens (rankings, scores, ages, points) to require preservation
    const numericTokens = Array.from(new Set((input.bodyText || '')
      .match(/\b\d{1,4}(?:[,.]\d{1,3})?\b/g) || []))
      .slice(0, 50)
    const numericGuidance = numericTokens.length
      ? `Numeric data tokens to preserve verbatim (do not alter or drop unless clearly duplicated contextually): ${numericTokens.join(', ')}`
      : undefined
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const slamCalendar = [
      'Grand Slam calendar (reference):',
      '• Australian Open — Melbourne: January 12–26',
      '• French Open — Roland Garros, Paris: May 19–June 8',
      '• Wimbledon Championships — London: June 30–July 13',
      '• U.S. Open — New York City: August 18–September 8',
    ].join('\n')
    const linkGuidance = buildLinkGuidance(input.linkReferences)
    const mediaGuidance = buildMediaGuidance(input.mediaReferences)
    const mediaRequirement = input.mediaReferences?.length
      ? 'Media assets listed below each have a token (e.g., [[IMG:1]]). Output every token exactly once on its own line, without additional prose or paraphrasing. Do not replace or describe the embed contents—the publishing pipeline will swap the token for the original markup. Do not invent additional tokens nor remove them.'
      : 'If media tokens like [[IMG:1]] or [[VIDEO:1]] appear in any context, preserve their spelling and placement exactly so the pipeline can swap them with the original media.'
    const linkRequirement = input.linkReferences?.length
      ? 'Link usage: when the narrative references the subjects listed in Link references, wrap the matching surface text in <a href="..."> exactly as provided (retain casing; do not change anchor text). Do not introduce other outbound links unless critically necessary and factual.'
      : 'If the source text contains hyperlinks, retain them; otherwise add links only when certain of accuracy.'
    const prompt = [
      `Today: ${todayStr}`,
      slamCalendar,
      `Source Title: ${input.title}`,
      input.excerpt ? `Source Excerpt: ${input.excerpt}` : undefined,
      input.bodyText ? `Source Body (may be partial):\n${input.bodyText}` : undefined,
      input.context ? `Context: ${input.context}` : undefined,
      linkGuidance,
      mediaGuidance,
  numericGuidance,
      '',
      `Task: Produce ${count} distinct draft variants. Each must include:`,
      `- title (a concise, engaging headline)`,
      `- a one- or two-sentence excerpt (dek)`,
      `- body as semantic HTML (use <p> for paragraphs, optional <h2>/<h3> for subheads) meeting at least ${minTarget} characters`,
      `Constraints for references & quotes:`,
      `  • Do NOT include any references in the first two paragraphs.`,
      `  • From paragraph 3 onward, wrap any outlet mentions or attributions (e.g., "via", "per", "according to") in <em>italics</em>.`,
      `  • You may use direct quotes starting from paragraph 3 onward; never in the first two paragraphs.`,
      `  • Do NOT append a trailing "Source" line and do not mention providers/models.`,
      `Structure & style:`,
      `  • Use <h2> and <h3> to segment ideas when appropriate. Introduce quote/social semantics per system instructions (ext-quote / ext-social).`,
      `  • Discuss biomechanics in no more than two paragraphs total; be coherent, not didactic.`,
      `  • First three paragraphs must be engaging/approachable for general readers; the middle can get heavier; always end with a cohesive, reader-friendly close.`,
      `  • Short paragraphs (2–4 sentences), precise terminology (patterns, 1–2/one–two combinations; slice/underspin not slider; inside-in/inside-out; down-the-line; crosscourt).`,
      mediaRequirement,
      linkRequirement,
      `Preserve every listed numeric token exactly (no rounding or omission).`,
  `Return JSON with an array "variants" of objects {title, excerpt, body}.`,
    ].filter(Boolean).join('\n')

  const content = await this.jsonRequest(prompt, 0.7, { label: 'variants:seed' })
    let parsed: any
    try { parsed = JSON.parse(content) } catch { parsed = { variants: [] } }
    let variants: DraftVariant[] = Array.isArray(parsed.variants) ? parsed.variants : []
    variants = variants.slice(0, count)

    // Iteratively expand variants not meeting minTarget
    const expanded: DraftVariant[] = []
    for (const [variantIndex, v] of variants.entries()) {
      if ((v.body || '').length >= minTarget) {
        expanded.push(v)
        continue
      }
      let current = v
      for (let i = 0; i < 3 && (current.body?.length || 0) < minTarget; i++) {
        const extendPrompt = [
          `Today: ${todayStr}`,
          slamCalendar,
          'Expand and deepen the following draft while keeping structure and tone. Keep body as semantic HTML (<p>, with <h2>/<h3> for sectioning as needed).',
          mediaRequirement,
          linkRequirement,
          'Respect reference constraints: no references in first two paragraphs; from paragraph 3 onward, wrap attributions in <em> and allow quotes. Follow ext-quote / ext-social block semantics.',
          'Limit biomechanics content to at most two paragraphs total. Maintain reader-friendly first three paragraphs; allow heavier middle; finish cohesively.',
          `Minimum characters: ${minTarget}.`,
          'Return JSON {title, excerpt, body}.',
          `Draft JSON:\n${JSON.stringify(current).slice(0, 16000)}`,
        ].join('\n')
        const c2 = await this.jsonRequest(extendPrompt, 0.6, { label: `variants:expand#${variantIndex + 1}-pass${i + 1}` })
        try { current = JSON.parse(c2) } catch { break }
      }
      expanded.push(current)
    }
    return expanded
  }

  async synthesizeFinal(variants: DraftVariant[], input: { title: string; excerpt?: string; bodyText?: string; context?: string; linkReferences?: LinkReference[]; mediaReferences?: MediaReference[] }): Promise<DraftVariant> {
    const baseLen = (input.bodyText?.length || input.excerpt?.length || input.title.length || 0)
    const minTarget = Math.max(baseLen + 200, 900)
    const numericTokens = Array.from(new Set((input.bodyText || '')
      .match(/\b\d{1,4}(?:[,.]\d{1,3})?\b/g) || []))
      .slice(0, 50)
    const numericGuidance = numericTokens.length
      ? `Preserve numeric tokens exactly: ${numericTokens.join(', ')}`
      : undefined
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const slamCalendar = [
      'Grand Slam calendar (reference):',
      '• Australian Open — Melbourne: January 12–26',
      '• French Open — Roland Garros, Paris: May 19–June 8',
      '• Wimbledon Championships — London: June 30–July 13',
      '• U.S. Open — New York City: August 18–September 8',
    ].join('\n')
    const linkGuidance = buildLinkGuidance(input.linkReferences)
    const mediaGuidance = buildMediaGuidance(input.mediaReferences)
    const mediaRequirement = input.mediaReferences?.length
      ? 'Media tokens listed must each appear exactly once in the final body, on their own lines, kept uppercase (e.g., [[IMG:1]]). Do not paraphrase or summarize the embed contents—the publishing pipeline will replace each token with the original media markup. Do not invent new tokens or drop any.'
      : 'If media tokens like [[IMG:1]] appear anywhere, preserve them verbatim so the pipeline can replace them downstream.'
    const linkRequirement = input.linkReferences?.length
      ? 'Link usage: whenever the narrative references any subject from Link references, wrap that surface text in <a href="..."> using the provided URL with unchanged casing. Do not invent additional links unless facts demand it.'
      : 'Retain any hyperlinks found in source material; only add new links if confident in accuracy.'
    const prompt = [
      `Today: ${todayStr}`,
      slamCalendar,
      'Combine the following variants into a single best article with improved clarity, factual accuracy, and context.',
      numericGuidance,
      linkGuidance,
      mediaGuidance,
      `Minimum characters: ${minTarget}. Use high-end tennis nomenclature and clear structure (headline, dek, body). Prefer inside-in/inside-out for direction; use 1–2/one–two combinations (avoid serve+1); use slice/underspin (avoid slider).`,
      'Body must be semantic HTML using <p> for paragraphs and optional <h2> subheads. When using quotes or social-style inserts apply ext-quote / ext-social wrappers. Preserve every numeric token listed (no omission, no rounding).',
      mediaRequirement,
      linkRequirement,
      'Use <h3> where finer segmentation helps readability and skimmability.',
      'Discuss biomechanics in no more than two paragraphs total; keep it coherent and not overly didactic.',
      'Audience gradient: first three paragraphs approachable; middle can deepen; ending must be cohesive and accessible.',
      'Do NOT include any references in the first two paragraphs. From paragraph 3 onward, wrap attributions (via/per/according to) in <em>, allow quotes. No trailing "Source" line.',
      'Return JSON object {title, excerpt, body}.',
      `Variants: ${JSON.stringify(variants).slice(0, 16000)}`,
    ].join('\n')
  const content = await this.jsonRequest(prompt, 0.5, { label: 'final:seed' })
    let parsed: any
    try { parsed = JSON.parse(content) } catch { parsed = {} }
    let finalDraft: DraftVariant = { title: parsed.title || input.title, excerpt: parsed.excerpt || input.excerpt, body: parsed.body || '' }
    // Expand iteratively to meet minTarget
    for (let i = 0; i < 3 && (finalDraft.body?.length || 0) < minTarget; i++) {
      const extendPrompt = [
        `Today: ${todayStr}`,
        slamCalendar,
        'Expand and refine the final draft to meet the minimum length with richer analysis and specificity.',
        mediaRequirement,
        linkRequirement,
        'Ensure body remains semantic HTML (<p>, with <h2>/<h3> as needed) and adheres to the references/quotes constraints. Preserve earlier numeric tokens exactly.',
        'Keep biomechanics to at most two paragraphs total; retain audience gradient and cohesive ending.',
        `Minimum characters: ${minTarget}.`,
        'Return JSON {title, excerpt, body}.',
        `Draft JSON:\n${JSON.stringify(finalDraft).slice(0, 16000)}`,
      ].join('\n')
  const c2 = await this.jsonRequest(extendPrompt, 0.5, { label: `final:expand-pass${i + 1}` })
      try { finalDraft = JSON.parse(c2) } catch { break }
    }
    return this.finalizeDraft(finalDraft, input)
  }
}

function buildLinkGuidance(linkReferences?: LinkReference[]): string | undefined {
  if (!linkReferences?.length) return undefined
  const items = linkReferences.slice(0, 40).map((ref, idx) => {
    const label = ref.text.trim().replace(/\s+/g, ' ')
    const ctx = ref.context ? ` — ${ref.context}` : ''
    return `  ${idx + 1}. "${label}" → ${ref.url}${ctx}`
  })
  return ['Link references (use <a href="…">text</a> with exact surface text when mentioned):', ...items].join('\n')
}

function buildMediaGuidance(mediaReferences?: MediaReference[]): string | undefined {
  if (!mediaReferences?.length) return undefined
  const items = mediaReferences.slice(0, 30).map((ref, idx) => {
    const desc = ref.description ? ` — ${ref.description}` : ''
    const cap = ref.caption ? ` (caption: ${ref.caption})` : ''
    const url = ref.url ? ` — ${ref.url}` : ''
    return `  ${idx + 1}. ${ref.token} (${ref.type})${desc}${cap}${url}`
  })
  return ['Media assets (each token must appear once in the body near relevant context):', ...items].join('\n')
}
