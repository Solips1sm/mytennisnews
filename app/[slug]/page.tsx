import { notFound } from 'next/navigation'
import { getClient } from '@/lib/sanity'
import { ARTICLE_BY_SLUG, ARTICLE_BY_SLUG_PUBLISHED } from '@/lib/queries'
import { ArticleContent } from '@/components/article-content'

type Tag = { _id: string; name: string; slug?: string }
type Article = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  body?: any
  canonicalUrl?: string
  publishedAt?: string
  source?: { name?: string; url?: string; license?: string }
  authors?: string[]
  tags?: Tag[]
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'
  const client = getClient(isPreview)
  const query = isPreview ? ARTICLE_BY_SLUG : ARTICLE_BY_SLUG_PUBLISHED
  const article = await client.fetch<Article | null>(query, { slug: params.slug })
  if (!article) return notFound()

  return <ArticleContent article={article} />
}
