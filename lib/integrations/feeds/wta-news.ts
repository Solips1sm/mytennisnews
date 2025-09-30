import { JSDOM } from 'jsdom'
import type { FeedProvider, NormalizedItem } from './index'
import { extractWTA } from '../extractors/wta'

const BASE_URL = 'https://www.wtatennis.com'
const LISTING_SECTIONS: Array<{ label: string; url: string }> = [
  { label: 'Match Reaction', url: 'https://www.wtatennis.com/news/match-reaction' },
  { label: 'Player Feature', url: 'https://www.wtatennis.com/news/player-feature' },
]

type ListingItem = {
  id: string
  url: string
  title: string
  excerpt?: string
  publishedLabel?: string
  image?: string
  tags: string[]
}

function toAbsoluteUrl(input: string | null | undefined): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed, BASE_URL).toString()
  } catch {
    return trimmed
  }
}

function parseRelativeDate(label: string | undefined): string | undefined {
  if (!label) return undefined
  const text = label.trim().toLowerCase()
  if (!text) return undefined
  const now = Date.now()
  const match = text.match(/^(\d+)\s*([hdm])\s*ago$/)
  if (match) {
    const value = parseInt(match[1], 10)
    if (Number.isNaN(value)) return undefined
    const unit = match[2]
    let delta = 0
    if (unit === 'h') delta = value * 60 * 60 * 1000
    else if (unit === 'd') delta = value * 24 * 60 * 60 * 1000
    else if (unit === 'm') delta = value * 60 * 1000
    if (delta) return new Date(now - delta).toISOString()
  }
  if (/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text)) {
    const parsed = Date.parse(text)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  return undefined
}

async function fetchListing(sectionUrl: string): Promise<ListingItem[]> {
  const res = await fetch(sectionUrl, {
    headers: { 'User-Agent': 'MyTennisNewsBot/1.0' },
  })
  if (!res.ok) return []
  const html = await res.text()
  const dom = new JSDOM(html)
  const doc = dom.window.document

  const listItems = Array.from(
    doc.querySelectorAll('li.content-listing-grid__item:not(.content-listing-grid__ad-item)') as NodeListOf<HTMLElement>
  )

  const maxPerSection = Math.max(1, parseInt(process.env.INGEST_WTA_MAX_PER_SECTION || '8', 10))
  const sliced = listItems.slice(0, maxPerSection)
  const items: ListingItem[] = []

  for (const li of sliced) {
    const anchor = li.querySelector('a.content-listing-grid__url') as HTMLAnchorElement | null
    const href = toAbsoluteUrl(anchor?.getAttribute('href'))
    if (!href) continue
    const idAttr = anchor?.getAttribute('data-tracking-article-id')
    const id = idAttr ? `wta-${idAttr}` : href
    const title = li.querySelector('.content-listing-grid__title')?.textContent?.trim()
    if (!title) continue
    const excerpt = li.querySelector('.content-listing-grid__description')?.textContent?.trim() || undefined
    const publishedLabel = li.querySelector('.content-listing-grid__publishdate')?.textContent?.trim() || undefined
    const image = toAbsoluteUrl(li.querySelector('img')?.getAttribute('src') || undefined)
    const tags = Array.from(li.querySelectorAll('.badge__label') as NodeListOf<HTMLElement>)
      .map((el) => el.textContent?.trim())
      .filter((text): text is string => !!text)

    items.push({ id, url: href, title, excerpt, publishedLabel, image, tags })
  }

  return items
}

export class WtaNewsProvider implements FeedProvider {
  public readonly name: string
  private readonly sourceUrl: string

  constructor(name = 'WTA Tennis', sourceUrl = 'https://www.wtatennis.com/news') {
    this.name = name
    this.sourceUrl = sourceUrl
  }

  async fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]> {
    const since = sinceIso ? new Date(sinceIso) : undefined
    const excerptMax = Math.max(0, parseInt(process.env.INGEST_EXCERPT_MAX_CHARS || '300', 10))

    const clampExcerpt = (text?: string | null): string | undefined => {
      if (!text) return undefined
      return excerptMax > 0 ? text.slice(0, excerptMax) : text
    }

    const listings = await Promise.all(LISTING_SECTIONS.map((section) => fetchListing(section.url)))
    const flattened: Array<{ item: ListingItem; sectionLabel: string }> = []
    listings.forEach((items, idx) => {
      const section = LISTING_SECTIONS[idx]
      for (const item of items) {
        flattened.push({ item, sectionLabel: section.label })
      }
    })

    const results: NormalizedItem[] = []
    for (const { item, sectionLabel } of flattened) {
      const extracted = await extractWTA(item.url)
      const publishedIso = extracted?.publishedAtIso || parseRelativeDate(item.publishedLabel)

      if (since && publishedIso) {
        const publishedDate = new Date(publishedIso)
        if (+publishedDate <= +since) continue
      }

      const tagSources = [sectionLabel, ...(item.tags || []), ...((extracted && extracted.tags) || [])]
      const allTags = Array.from(
        new Set(
          tagSources
            .map((tag) => tag?.trim())
            .filter((tag): tag is string => !!tag)
        )
      )

      const normalized: NormalizedItem = {
        externalId: item.id,
        title: extracted?.title || item.title,
        url: item.url,
        publishedAt: publishedIso,
        excerpt: clampExcerpt(extracted?.excerpt || item.excerpt || extracted?.bodyText || undefined),
        source: { name: this.name, url: this.sourceUrl },
        tags: allTags.length ? allTags : undefined,
      }

      if (extracted?.bodyHtml) normalized.bodyHtml = extracted.bodyHtml
      if (extracted?.bodyText) normalized.bodyText = extracted.bodyText
      if (extracted?.authors) normalized.authors = extracted.authors
      if (extracted?.timestampText) normalized.timestampText = extracted.timestampText
      if (extracted?.image) normalized.image = extracted.image
      if (extracted?.images) normalized.images = extracted.images
      if (extracted?.lang) normalized.lang = extracted.lang
      if (extracted?.videos?.length) normalized.videos = extracted.videos
      if (extracted?.credits) normalized.credits = extracted.credits

      if (!normalized.excerpt) {
        normalized.excerpt = clampExcerpt(item.excerpt || extracted?.bodyText || undefined)
      }

      if (extracted?.bodyHtml) {
        const hrefs = Array.from(extracted.bodyHtml.matchAll(/href="([^"]+)"/g)).map((m) => m[1])
        const links = Array.from(new Set(hrefs.filter((href) => /^https?:\/\//i.test(href))))
        if (links.length) normalized.links = links
      }

      if (item.image && !normalized.image) normalized.image = item.image

      results.push(normalized)
    }

    return results
  }
}