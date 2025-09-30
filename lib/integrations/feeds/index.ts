import type { ChallengeDetection } from '../util/challenge-detector'

export interface FeedProvider {
  readonly name: string
  fetchNewItems(sinceIso?: string): Promise<NormalizedItem[]>
}

export type NormalizedItem = {
  externalId: string
  title: string
  url: string
  publishedAt?: string
  excerpt?: string
  source: { name: string; url: string; license?: string }
  tags?: string[]
  // Optional enriched content (fetched from canonical URL)
  bodyHtml?: string
  bodyText?: string
  authors?: string[]
  timestampText?: string
  image?: string
  images?: string[]
  lang?: string
  links?: string[]
  videos?: Array<{ title?: string; url?: string; embedUrl?: string; thumbnail?: string }>
  credits?: string
  challenge?: ChallengeDetection
  warnings?: string[]
}
