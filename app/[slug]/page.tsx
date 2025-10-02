import type { Metadata } from 'next'
import Script from 'next/script'
import { notFound } from 'next/navigation'
import { getClient } from '@/lib/sanity'
import { ARTICLE_BY_SLUG, ARTICLE_BY_SLUG_PUBLISHED } from '@/lib/queries'
import { ensureHttpsUrl, resolveSiteOrigin, resolveSiteUrl } from '@/lib/utils'
import { ArticleContent } from '@/components/article-content'

type Tag = { _id: string; name: string; slug?: string }
type Article = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  body?: any
  externalHtml?: string
  aiBody?: string
  aiCreatedAt?: string
  leadImageUrl?: string
  mediaCredits?: string
  canonicalUrl?: string
  publishedAt?: string
  updatedAt?: string
  source?: { name?: string; url?: string; license?: string }
  authors?: string[]
  tags?: Tag[]
  timestampText?: string
}

const defaultSiteFallback = 'https://www.mytennisnews.com'
const siteUrl = resolveSiteUrl(defaultSiteFallback)
const siteOrigin = resolveSiteOrigin(defaultSiteFallback)
const organizationId = `${siteOrigin}#organization`
const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'

async function fetchArticle(slug: string) {
  const client = getClient(isPreview)
  const query = isPreview ? ARTICLE_BY_SLUG : ARTICLE_BY_SLUG_PUBLISHED
  return client.fetch<Article | null>(query, { slug })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = await fetchArticle(params.slug)
  const fallbackCanonical = `${siteOrigin}/${params.slug}`

  if (!article) {
    return {
      title: 'Article not found',
      description: 'The requested tennis story could not be located on MyTennisNews.',
      alternates: {
        canonical: fallbackCanonical,
      },
    }
  }

  const canonicalUrl = ensureHttpsUrl(article.canonicalUrl, fallbackCanonical) || fallbackCanonical
  const titleText = article.title || 'Tennis coverage'
  const pageTitle = `${titleText} | MyTennisNews`
  const description = article.excerpt || 'Daily tennis stories, analysis, and context from MyTennisNews.'
  const leadImage = article.leadImageUrl
    ? ensureHttpsUrl(article.leadImageUrl) || article.leadImageUrl
    : `${siteOrigin}/og?title=${encodeURIComponent(article.title || 'Tennis coverage')}`
  const publishedTime = article.publishedAt || undefined
  const modifiedTime = article.updatedAt || publishedTime
  const tags = article.tags?.map((tag) => tag.name).filter(Boolean)
  const authors = article.authors?.filter(Boolean)
  const openGraphAuthors = authors && authors.length ? authors : article.source?.name ? [article.source.name] : undefined

  return {
    title: titleText,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'article',
      url: canonicalUrl,
  title: pageTitle,
      description,
      images: [
        {
          url: leadImage,
          alt: article.title || 'Tennis coverage on MyTennisNews',
        },
      ],
      publishedTime,
      modifiedTime,
      section: tags && tags.length ? tags[0] : undefined,
      tags,
      authors: openGraphAuthors,
    },
    twitter: {
      card: 'summary_large_image',
  title: pageTitle,
      description,
      images: [leadImage],
    },
  }
}

export default async function ArticlePage({ params }: { params: { slug: string } }) {
  const article = await fetchArticle(params.slug)
  if (!article) return notFound()

  const canonicalUrl = ensureHttpsUrl(article.canonicalUrl, `${siteOrigin}/${params.slug}`) || `${siteOrigin}/${params.slug}`
  const leadImage = article.leadImageUrl
    ? ensureHttpsUrl(article.leadImageUrl) || article.leadImageUrl
    : `${siteOrigin}/og?title=${encodeURIComponent(article.title || 'Tennis coverage')}`
  const authors = article.authors?.filter(Boolean)
  const tags = article.tags?.map((tag) => tag.name).filter(Boolean)
  const titleText = article.title || 'Tennis coverage'
  const description = article.excerpt || 'Daily tennis stories, analysis, and context from MyTennisNews.'
  const publishDate = article.publishedAt || undefined
  const modifiedDate = article.updatedAt || publishDate

  const newsArticleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${canonicalUrl}#news`,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    headline: titleText,
    description,
    isAccessibleForFree: true,
    inLanguage: 'en-US',
    publisher: {
      '@id': organizationId,
    },
    citation: canonicalUrl,
  }

  if (leadImage) {
    newsArticleSchema.image = [leadImage]
    newsArticleSchema.thumbnailUrl = leadImage
  }

  if (publishDate) {
    newsArticleSchema.datePublished = publishDate
  }

  if (modifiedDate) {
    newsArticleSchema.dateModified = modifiedDate
  }

  if (authors && authors.length) {
    newsArticleSchema.author = authors.map((name) => ({ '@type': 'Person', name }))
  } else if (article.source?.name) {
    newsArticleSchema.author = {
      '@type': 'Organization',
      name: article.source.name,
      url: article.source.url,
    }
  }

  if (article.source?.name) {
    newsArticleSchema.sourceOrganization = {
      '@type': 'Organization',
      name: article.source.name,
      url: article.source.url,
    }
  }

  if (tags && tags.length) {
    newsArticleSchema.articleSection = tags[0]
    newsArticleSchema.keywords = tags
  }

  return (
    <>
      <Script id={`news-article-${article._id}`} type="application/ld+json">
        {JSON.stringify(newsArticleSchema)}
      </Script>
      <ArticleContent article={article} />
    </>
  )
}
