import { getClient } from '@/lib/sanity'
import { ARTICLES_PAGINATED, ARTICLES_PAGINATED_PUBLISHED } from '@/lib/queries'
import { BlogPage } from '@/components/blog-page'
import { HeroSubscribe } from '@/components/hero-subscribe'

type Tag = { _id: string; name: string; slug?: string }
type Article = {
  _id: string
  title: string
  slug?: string
  excerpt?: string
  canonicalUrl?: string
  publishedAt?: string
  source?: { name?: string; url?: string }
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
  let { items, total } = await client.fetch<{ items: Article[]; total: number }>(listQuery, vars)
  if (isAll) {
    if (total > items.length) {
      const full = await client.fetch<{ items: Article[]; total: number }>(listQuery, { offset: 0, to: total, start, end })
      items = full.items
      total = full.total
    }
    pageSize = total === 0 ? 1 : total
  }
  const queryParams: Record<string, string | undefined> = {}
  if (month) queryParams.month = month
  if (normalizedPageSizeParam) queryParams.pageSize = normalizedPageSizeParam
  return (
    <section className="space-y-2 md:space-y-4 2xl:space-y-6">
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
