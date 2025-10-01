import Script from 'next/script'
import { getClient } from '@/lib/sanity'
import { ARTICLES_PAGINATED, ARTICLES_PAGINATED_PUBLISHED } from '@/lib/queries'
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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://mytennisnews.com'
  const publisher = {
    '@type': 'Organization',
    name: 'MyTennisNews',
    url: baseUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${baseUrl}/favicon.ico`,
    },
  }
  const typedItems = items as HomeArticle[]
  const structuredArticles = typedItems.slice(0, 20).map((article: HomeArticle, index) => {
    const slugUrl = article.slug ? `${baseUrl}/${article.slug}` : undefined
    const canonical = article.canonicalUrl || slugUrl
    const leadImage = (article as any)?.leadImageUrl as string | undefined
    return {
      '@type': 'NewsArticle',
      position: index + 1,
      headline: article.title,
      description: article.excerpt,
      datePublished: article.publishedAt,
      url: canonical,
      mainEntityOfPage: canonical,
      image: leadImage ? [leadImage] : undefined,
      publisher,
      author: article.source?.name
        ? {
            '@type': 'Organization',
            name: article.source.name,
            url: article.source.url,
          }
        : undefined,
    }
  })
  const homepageSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'MyTennisNews — curated tennis coverage',
    description: 'Daily tennis coverage, curated from trusted outlets with context and analysis.',
    isPartOf: {
      '@type': 'WebSite',
      name: 'MyTennisNews',
      url: baseUrl,
    },
    publisher,
    mainEntity: {
      '@type': 'ItemList',
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

  return (
    <section className="space-y-2 md:space-y-4 2xl:space-y-6">
      <Script id="homepage-schema" type="application/ld+json">
        {JSON.stringify(homepageSchema)}
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
