export type Tag = {
  _id: string
  name: string
  slug?: string
}

export type Source = {
  name: string
  url: string
  license?: string
}

export type Article = {
  _id: string
  title: string
  slug: string
  excerpt?: string
  body?: unknown
  canonicalUrl?: string
  publishedAt?: string
  source?: Source
  authors?: string[]
  leadImageUrl?: string
  tags?: Tag[]
}
