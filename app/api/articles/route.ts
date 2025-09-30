import { NextResponse } from 'next/server'
import { getClient } from '@/lib/sanity'
import { ARTICLES_PAGINATED, ARTICLES_PAGINATED_PUBLISHED } from '@/lib/queries'

const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 500

function computeBounds(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, mm] = month.split('-').map((n) => parseInt(n, 10))
    const start = new Date(Date.UTC(year, mm - 1, 1))
    const end = new Date(Date.UTC(year, mm, 1))
    return { start: start.toISOString(), end: end.toISOString() }
  }
  return { start: '1970-01-01T00:00:00Z', end: '2999-12-31T23:59:59Z' }
}

function normalizePageSize(value: string | null): { pageSize: number; selection?: '50' | '100' | 'all' } {
  if (!value) return { pageSize: DEFAULT_PAGE_SIZE }
  const lower = value.toLowerCase()
  if (lower === '50') return { pageSize: 50, selection: '50' }
  if (lower === '100') return { pageSize: 100, selection: '100' }
  if (lower === 'all') return { pageSize: MAX_PAGE_SIZE, selection: 'all' }
  return { pageSize: DEFAULT_PAGE_SIZE }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams
    const isPreview = searchParams.get('preview') === 'true'
    const month = searchParams.get('month') || undefined
    const pageParam = parseInt(searchParams.get('page') || '1', 10)
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1
    const { pageSize, selection } = normalizePageSize(searchParams.get('pageSize'))

    const client = getClient(isPreview)
    const { start, end } = computeBounds(month)

    const effectivePage = selection === 'all' ? 1 : page
    const offset = selection === 'all' ? 0 : (effectivePage - 1) * pageSize
    const to = selection === 'all' ? MAX_PAGE_SIZE : effectivePage * pageSize

    const listQuery = isPreview ? ARTICLES_PAGINATED : ARTICLES_PAGINATED_PUBLISHED
    const data = await client.fetch<{ items: any[]; total: number }>(listQuery, {
      offset,
      to,
      start,
      end,
    })

    return NextResponse.json({
      items: data.items,
      total: data.total,
      selection,
      page: effectivePage,
      pageSize: selection === 'all' ? data.total : pageSize,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 })
  }
}