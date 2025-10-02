import Script from 'next/script'
import { getClient } from '@/lib/sanity'
import { ARTICLES_PAGINATED, ARTICLES_PAGINATED_PUBLISHED } from '@/lib/queries'
import { ensureHttpsUrl, resolveSiteOrigin, resolveSiteUrl } from '@/lib/utils'
import { BlogPage } from '@/components/blog-page'
import { HeroSubscribe } from '@/components/hero-subscribe'

type Tag = { _id: string; name: string; slug?: string }
type HomeArticle = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  canonicalUrl?: string
  publishedAt?: string
  updatedAt?: string
  source?: { name?: string; url?: string }
  leadImageUrl?: string
  tags?: Tag[]
}

export default async function HomePage({ searchParams }: { searchParams?: Record<string, string> }) {
  const isPreview = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'
  const client = getClient(isPreview)
  const rawPageSizeParam = searchParams?.pageSize?.toLowerCase()
  const normalizedPageSizeParam = rawPageSizeParam === 'all' || rawPageSizeParam === '50' || rawPageSizeParam === '100' ? rawPageSizeParam : undefined
  let pageSize = normalizedPageSizeParam === '50' ? 50 : normalizedPageSizeParam === '100' ? 100 : 12
  let page = Math.max(1, parseInt(searchParams?.page || '1', 10))
  const isAll = normalizedPageSizeParam === 'all'
  if (isAll) page = 1
  const month = searchParams?.month // format YYYY-MM
  let start: string | undefined
  let end: string | undefined
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    start = `${month}-01T00:00:00Z`
    const [y, m] = month.split('-').map((n) => parseInt(n, 10))
    const next = new Date(Date.UTC(y, m, 1))
    end = next.toISOString()
  }
  if (!start) start = '1970-01-01T00:00:00Z'
  if (!end) end = '2999-12-31T23:59:59Z'

  let vars = { offset: (page - 1) * pageSize, to: page * pageSize, start, end }
  if (isAll) {
    vars = { offset: 0, to: 200, start, end }
  }
  const listQuery = isPreview ? ARTICLES_PAGINATED : ARTICLES_PAGINATED_PUBLISHED
  let { items, total } = await client.fetch<{ items: HomeArticle[]; total: number }>(listQuery, vars)
  if (isAll) {
    if (total > items.length) {
      const full = await client.fetch<{ items: HomeArticle[]; total: number }>(listQuery, { offset: 0, to: total, start, end })
      items = full.items
      total = full.total
    }
    pageSize = total === 0 ? 1 : total
  }
  const queryParams: Record<string, string | undefined> = {}
  if (month) queryParams.month = month
  if (normalizedPageSizeParam) queryParams.pageSize = normalizedPageSizeParam

  const baseUrl = resolveSiteUrl('https://www.mytennisnews.com')
  const baseOrigin = resolveSiteOrigin('https://www.mytennisnews.com')
  const organizationId = `${baseOrigin}#organization`
  const websiteId = `${baseOrigin}#website`
  const homepageId = `${baseOrigin}#collection-home`
  const publisher = {
    '@type': 'NewsMediaOrganization',
    '@id': organizationId,
    name: 'MyTennisNews',
    url: `${baseOrigin}/`,
    inLanguage: 'en-US',
    logo: {
      '@type': 'ImageObject',
      url: `${baseOrigin}/android-chrome-512x512.png`,
    },
  }
  const typedItems = items as HomeArticle[]
  const structuredArticles = typedItems.slice(0, 20).map((article, index) => {
    const slug = article.slug
    const slugUrl = slug ? `${baseOrigin}/${slug}` : undefined
    const canonical = ensureHttpsUrl(article.canonicalUrl, slugUrl)
    const leadImage = ensureHttpsUrl(article.leadImageUrl)
    const updatedAt = article.updatedAt
    const tags = article.tags?.map((tag) => tag.name).filter(Boolean)
    return {
      '@type': 'NewsArticle',
      '@id': canonical ? `${canonical}#news` : undefined,
      position: index + 1,
      headline: article.title as string,
      description: article.excerpt as string | undefined,
      datePublished: article.publishedAt as string | undefined,
      dateModified: updatedAt || (article.publishedAt as string | undefined),
      url: canonical,
      mainEntityOfPage: canonical,
      image: leadImage ? [leadImage] : undefined,
      publisher,
      articleSection: tags && tags.length ? tags[0] : undefined,
      keywords: tags,
      author: article.source?.name
        ? {
            '@type': 'Organization',
            name: article.source.name as string,
            url: article.source.url as string | undefined,
          }
        : undefined,
    }
  })
  const homepageSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': homepageId,
    url: `${baseOrigin}/`,
    name: 'MyTennisNews — curated tennis stories for the global community',
    description: 'Curated tennis news, live context, and personal stories serving tennis fans everywhere.',
    inLanguage: 'en-US',
    about: ['Tennis', 'ATP Tour', 'WTA Tour', 'Grand Slams'],
    audience: {
      '@type': 'Audience',
      audienceType: 'Tennis Enthusiasts',
    },
    isPartOf: {
      '@id': websiteId,
    },
    publisher: {
      '@id': organizationId,
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: structuredArticles
        .filter((article) => Boolean(article.url))
        .map((article, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: article.url,
          item: article,
        })),
    },
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': websiteId,
    url: `${baseOrigin}/`,
    name: 'MyTennisNews',
    inLanguage: 'en-US',
    description: 'MyTennisNews connects the tennis community with daily coverage and context.',
    publisher: {
      '@id': organizationId,
    },
  }

  const homepageStructuredData = [websiteSchema, homepageSchema]

  return (
    <section className="space-y-2 md:space-y-4 2xl:space-y-6">
      <Script id="homepage-schema" type="application/ld+json">
        {JSON.stringify(homepageStructuredData)}
      </Script>
      <HeroSubscribe />
      <BlogPage
        initialArticles={items}
        total={total}
        initialPageSize={pageSize}
        initialPage={page}
        pageSizeSelection={normalizedPageSizeParam}
        month={month}
        query={queryParams}
        basePath="/"
        isPreview={isPreview}
      />
    </section>
  )
}
