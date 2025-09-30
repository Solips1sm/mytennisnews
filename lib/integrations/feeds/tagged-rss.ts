import Parser from 'rss-parser'
import type { FeedProvider, NormalizedItem } from './index'
import { extractArticle } from '../../integrations/extractors/article'
import { isAllowedToExtract } from '../../integrations/util/allowlist'

// Similar to RssProvider but also maps <category> elements to NormalizedItem.tags
export class TaggedRssProvider implements FeedProvider {
  public readonly name: string
  private readonly feedUrl: string
  private parser: Parser

  constructor(name: string, feedUrl: string) {
    this.name = name
    this.feedUrl = feedUrl
    this.parser = new Parser({ headers: { 'User-Agent': 'MyTennisNews/1.0 (+https://mytennisnews.com)' } })
  }

  async fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]> {
    const feed = await this.parser.parseURL(this.feedUrl)
    const since = sinceIso ? new Date(sinceIso) : undefined
    const items = feed.items || []
    const out: NormalizedItem[] = []
    for (const it of items) {
      const link = it.link || ''
      const title = it.title || ''
      const pubDate = (it as any).isoDate || it.pubDate
      if (since && pubDate) {
        const d = new Date(pubDate)
        if (+d <= +since) continue
      }
      if (!link || !title) continue
      const tags: string[] | undefined = Array.isArray((it as any).categories)
        ? ((it as any).categories as string[]).map((c) => c.trim()).filter(Boolean)
        : undefined
      const normalized: NormalizedItem = {
        externalId: link,
        title,
        url: link,
        publishedAt: pubDate,
        excerpt: it.contentSnippet || (it as any).summary || undefined,
        source: { name: this.name, url: this.feedUrl },
        tags,
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
