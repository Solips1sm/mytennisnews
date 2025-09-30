import Parser from 'rss-parser'
import type { FeedProvider, NormalizedItem } from './index'
import { extractArticle } from '../extractors/article'
import { isAllowedToExtract } from '../util/allowlist'
import { detectChallenge } from '../util/challenge-detector'

// Lightweight HTML to text conversion
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ') // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Remove ATP placeholders like [NEWSLETTER FORM], [ATP APP]
function stripPlaceholders(html: string): string {
  return html.replace(/\[(NEWSLETTER FORM|ATP APP)\]/gi, '').trim()
}

function normalizeRelativeAssets(html: string, origin: string): string {
  return html.replace(/(src|href)=("|')(\/(?:-[^"']|[^"'])*?)\2/g, (_m, attr, quote, path) => {
    try {
      const abs = new URL(path, origin).toString()
      return `${attr}=${quote}${abs}${quote}`
    } catch {
      return _m
    }
  })
}

export class AtpRssProvider implements FeedProvider {
  public readonly name: string
  private readonly feedUrl: string
  private parser: Parser
  private origin: string

  constructor(name: string, feedUrl: string) {
    this.name = name
    this.feedUrl = feedUrl
    this.origin = 'https://www.atptour.com/'
    this.parser = new Parser({ headers: { 'User-Agent': 'MyTennisNews/1.0 (+https://mytennisnews.com)' } })
  }

  async fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]> {
    const excerptMax = Math.max(0, parseInt(process.env.INGEST_EXCERPT_MAX_CHARS || '300', 10))
    let feed: any
    try {
      feed = await this.parser.parseURL(this.feedUrl)
    } catch (err: any) {
      const msg = (err && err.message) || ''
      if (/403/.test(msg)) {
        if (process.env.INGEST_DEBUG === 'true') {
          console.warn('[atp-rss] 403 from parseURL; attempting manual fetch fallback')
        }
        try {
          const res = await fetch(this.feedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; MyTennisNewsBot/1.0; +https://mytennisnews.com)',
              Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8,*/*;q=0.5',
            },
          })
          if (!res.ok) throw new Error('fallback status ' + res.status)
          const xml = await res.text()
          feed = await this.parser.parseString(xml)
        } catch (fallbackErr) {
          console.error('[atp-rss] failed fallback fetch', (fallbackErr as any)?.message)
          return []
        }
      } else {
        console.error('[atp-rss] parseURL error', msg)
        return []
      }
    }
    const since = sinceIso ? new Date(sinceIso) : undefined
    const items = feed.items || []
    const out: NormalizedItem[] = []
    for (const it of items) {
      const link = it.link || ''
      const title = it.title || ''
      const pubDate = (it as any).isoDate || it.pubDate
      if (!link || !title) continue
      if (since && pubDate) {
        const d = new Date(pubDate)
        if (+d <= +since) continue
      }
  let rawDesc = (it as any).content || it['content:encoded'] || it.description || ''
      rawDesc = stripPlaceholders(rawDesc)
      rawDesc = normalizeRelativeAssets(rawDesc, this.origin)
      // Basic pruning of social embeds / scripts left behind
      rawDesc = rawDesc.replace(/<script[\s\S]*?<\/script>/gi, '')
      const cleanedText = htmlToText(rawDesc)
  const excerpt = cleanedText.slice(0, excerptMax || 500)
      const categories: string[] | undefined = Array.isArray((it as any).categories)
        ? ((it as any).categories as string[]).map((c) => c.trim()).filter(Boolean)
        : undefined
      const normalized: NormalizedItem = {
        externalId: link,
        title,
        url: link,
        publishedAt: pubDate,
        excerpt,
        source: { name: this.name, url: this.feedUrl },
        tags: categories,
      }
      const challengeFromFeed = detectChallenge(rawDesc)
      if (challengeFromFeed) {
        normalized.challenge = challengeFromFeed
      }
      let usedExtractor = false
      if (process.env.INGEST_FETCH_ARTICLE === 'true' && isAllowedToExtract(link)) {
        const extracted = await extractArticle(link)
        if (extracted) {
          usedExtractor = true
          if (extracted.challenge) {
            normalized.challenge = extracted.challenge
            normalized.warnings = [...(normalized.warnings || []), `extractor:${extracted.challenge.type}`]
          }
          normalized.bodyHtml = extracted.bodyHtml || undefined
          normalized.bodyText = extracted.bodyText || undefined
          normalized.authors = extracted.authors
          normalized.timestampText = extracted.timestampText
          normalized.image = extracted.image
          normalized.images = extracted.images
          // Attach primaryTag/tagline
          const primaryTag = (extracted as any).primaryTag as string | undefined
          if (primaryTag) {
            normalized.tags = Array.from(new Set([...(normalized.tags || []), primaryTag]))
          }
          const tagline = (extracted as any).tagline as string | undefined
          if (tagline && !normalized.excerpt) {
            normalized.excerpt = tagline.slice(0, excerptMax)
          }
          // @ts-ignore optional passthroughs
          if ((extracted as any).videos) normalized.videos = (extracted as any).videos
          // @ts-ignore
          if ((extracted as any).credits) normalized.credits = (extracted as any).credits
          normalized.lang = extracted.lang
          if (normalized.bodyHtml) {
            const hrefs = Array.from(normalized.bodyHtml.matchAll(/href=\"([^\"]+)\"/g)).map((m) => m[1])
            normalized.links = hrefs.filter((u) => /^https?:\/\//i.test(u))
          }
          if (!normalized.bodyText && normalized.bodyHtml) {
            normalized.bodyText = htmlToText(normalized.bodyHtml)
          }
        }
      }
      // Fallback: if no extracted body, use cleaned RSS description (short form)
      if (!normalized.bodyText && cleanedText) {
        normalized.bodyText = cleanedText.slice(0, 4000) // safeguard length
      }
      if (!normalized.bodyHtml && rawDesc) {
        // Provide minimal sanitized HTML (already stripped scripts); limit length
        normalized.bodyHtml = rawDesc.slice(0, 10000)
      }
      if (process.env.INGEST_DEBUG === 'true') {
        console.log('[extract]', this.name, link, {
          usedExtractor,
          hasBodyText: !!normalized.bodyText,
            hasBodyHtml: !!normalized.bodyHtml,
          excerptLength: normalized.excerpt?.length,
          textLength: normalized.bodyText?.length,
          images: normalized.images?.length || 0,
          fallbackUsed: !usedExtractor,
        })
      }

      out.push(normalized)
    }
    return out
  }
}
