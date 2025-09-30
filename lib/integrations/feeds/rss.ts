import Parser from 'rss-parser'
import type { FeedProvider, NormalizedItem } from './index'
import { extractArticle } from '../../integrations/extractors/article'
import { isAllowedToExtract } from '../../integrations/util/allowlist'

export class RssProvider implements FeedProvider {
  public readonly name: string
  private readonly feedUrl: string
  private parser: Parser

  constructor(name: string, feedUrl: string) {
    this.name = name
    this.feedUrl = feedUrl
    this.parser = new Parser({ headers: { 'User-Agent': 'MyTennisNews/1.0 (+https://mytennisnews.com)' } })
  }

  async fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]> {
    const excerptMax = Math.max(0, parseInt(process.env.INGEST_EXCERPT_MAX_CHARS || '300', 10))
    const feed = await this.parser.parseURL(this.feedUrl)
    const since = sinceIso ? new Date(sinceIso) : undefined
    const items = feed.items || []
    const out: NormalizedItem[] = []
    for (const it of items) {
      const link = it.link || ''
      const title = it.title || ''
      const pubDate = it.isoDate || it.pubDate
      if (since && pubDate) {
        const d = new Date(pubDate)
        if (+d <= +since) continue
      }
      if (!link || !title) continue
      const normalized: NormalizedItem = {
        externalId: link,
        title,
        url: link,
        publishedAt: pubDate,
        excerpt: (it.contentSnippet || it.summary || undefined)
          ? String(it.contentSnippet || it.summary).slice(0, excerptMax)
          : undefined,
        source: { name: this.name, url: this.feedUrl },
      }
      if (process.env.INGEST_FETCH_ARTICLE === 'true' && isAllowedToExtract(link)) {
        const extracted = await extractArticle(link)
        if (extracted) {
          normalized.bodyHtml = extracted.bodyHtml
          normalized.bodyText = extracted.bodyText
          normalized.authors = extracted.authors
          normalized.timestampText = extracted.timestampText
          normalized.image = extracted.image
          normalized.images = extracted.images
          normalized.lang = extracted.lang
          // Basic link harvesting for context
          if (normalized.bodyHtml) {
            const hrefs = Array.from(normalized.bodyHtml.matchAll(/href=\"([^\"]+)\"/g)).map((m) => m[1])
            normalized.links = hrefs.filter((u) => /^https?:\/\//i.test(u))
          }
          if (process.env.INGEST_DEBUG === 'true') {
            const dbg = extracted._debug
            console.log('[extract]', this.name, link, {
              extractor: dbg?.extractor,
              status: dbg?.status,
              htmlLength: dbg?.htmlLength,
              paragraphs: dbg?.paragraphs,
              images: dbg?.images,
              videos: dbg?.videos,
              htmlSavedPath: dbg?.htmlSavedPath,
              hasBodyText: !!extracted.bodyText,
              hasBodyHtml: !!extracted.bodyHtml,
            })
          }
        }
      }
      out.push(normalized)
    }
    return out
  }
}
