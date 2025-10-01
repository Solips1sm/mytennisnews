"use client"
import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BlogPostCard } from '@/components/blog-post-card'
import { Pagination } from '@/components/pagination'
import { FeaturedPostSidebarItem } from '@/components/featured-post-sidebar-item'
import { Switch } from '@/components/ui/switch'
import { cn, estimateReadTime, formatFriendlyDate } from '@/lib/utils'

type Article = {
  _id: string
  title: string
  excerpt?: string
  leadImageUrl?: string
  canonicalUrl?: string
  slug?: string
  source?: { name?: string; url?: string }
  tags?: Array<{ _id: string; name: string }>
  publishedAt?: string
}

type BlogPageProps = {
  initialArticles: Article[]
  total: number
  initialPageSize: number
  initialPage: number
  pageSizeSelection?: string
  month?: string
  query?: Record<string, string | undefined>
  basePath?: string
  isPreview?: boolean
}

export function BlogPage({
  initialArticles,
  total,
  initialPageSize,
  initialPage,
  pageSizeSelection,
  month,
  query,
  basePath = '/',
  isPreview,
}: BlogPageProps) {
  const [gridView, setGridView] = useState(true)
  const [searchValue, setSearchValue] = useState('')
  const [remoteItems, setRemoteItems] = useState<Article[] | null>(null)
  const [searching, setSearching] = useState(false)
  const sideRef = useRef<HTMLDivElement | null>(null)
  const [showSI, setShowSI] = useState(false)
  const [scrollP, setScrollP] = useState(0)
  const hideTimer = useRef<number | undefined>(undefined)
  const [articles, setArticles] = useState(initialArticles)
  const [pageSizeLoading, setPageSizeLoading] = useState(false)
  const [pageSizeState, setPageSizeState] = useState(initialPageSize)
  const [pageState, setPageState] = useState(initialPage)
  const [totalState, setTotalState] = useState(total)
  const normalizedInitialSelection = useMemo(() => {
    if (pageSizeSelection) return pageSizeSelection
    return initialPageSize >= total && total > 0 ? 'all' : String(initialPageSize)
  }, [initialPageSize, pageSizeSelection, total])
  const [pageSizeSelectionState, setPageSizeSelectionState] = useState<string>(normalizedInitialSelection)
  const [highlightedIds, setHighlightedIds] = useState<string[]>([])
  const baseQueryRef = useRef<Record<string, string | undefined>>(query || {})
  const articlesRef = useRef(initialArticles)

  // initialize from query param or localStorage
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const v = sp.get('view')
      if (v === 'list') setGridView(false)
      else if (v === 'grid') setGridView(true)
      else {
        const stored = window.localStorage.getItem('blog:view')
        if (stored === 'list') setGridView(false)
        if (stored === 'grid') setGridView(true)
      }
    } catch {}
  }, [])

  // persist changes
  useEffect(() => {
    try {
      const mode = gridView ? 'grid' : 'list'
      window.localStorage.setItem('blog:view', mode)
      // update URL query param without navigation
      const url = new URL(window.location.href)
      url.searchParams.set('view', mode)
      window.history.replaceState({}, '', url.toString())
    } catch {}
  }, [gridView])
  useEffect(() => {
    setArticles(initialArticles)
    articlesRef.current = initialArticles
    setPageState(initialPage)
    setPageSizeState(initialPageSize)
    setTotalState(total)
    setPageSizeSelectionState(normalizedInitialSelection)
    baseQueryRef.current = query || {}
  }, [initialArticles, initialPage, initialPageSize, normalizedInitialSelection, query, total])
  useEffect(() => {
    articlesRef.current = articles
  }, [articles])
  useEffect(() => {
    if (highlightedIds.length === 0) return
    const timer = window.setTimeout(() => setHighlightedIds([]), 700)
    return () => window.clearTimeout(timer)
  }, [highlightedIds])
  const withImg = (articles || []).filter((a) => !!a.leadImageUrl)
  const hero = withImg[0] || articles?.[0]
  const remaining = (withImg.length ? withImg.slice(1) : (articles || []).slice(1))
  const sidebar = remaining.slice(0, 5)
  // sidebar scroll indicator helpers
  const updateProgress = () => {
    const el = sideRef.current
    if (!el) return
    const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)
    setScrollP(p)
  }
  const onSideScroll = () => {
    updateProgress()
    setShowSI(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowSI(false), 800) as unknown as number
  }
  const onSideMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const el = sideRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const near = e.clientX >= r.right - 16 && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (near) setShowSI(true)
  }
  const onSideMouseLeave = () => {
    hideTimer.current = window.setTimeout(() => setShowSI(false), 150) as unknown as number
  }
  useEffect(() => {
    updateProgress()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [sidebar.length])
  useEffect(() => {
    const q = searchValue.trim()
    if (!q) {
      setRemoteItems(null)
      return
    }
    let aborted = false
    const id = window.setTimeout(async () => {
      try {
        setSearching(true)
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=30`)
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        if (!aborted) setRemoteItems(data.items || [])
      } catch {
        if (!aborted) setRemoteItems([])
      } finally {
        if (!aborted) setSearching(false)
      }
    }, 250)
    return () => {
      aborted = true
      window.clearTimeout(id)
    }
  }, [searchValue])

  const recents = useMemo(() => {
    if (remoteItems) return remoteItems
    return (articles || [])
  }, [articles, remoteItems])
  const highlightSet = useMemo(() => new Set(highlightedIds), [highlightedIds])

  const handlePageSizeSelect = useCallback(
    async (value: string) => {
      if (pageSizeLoading || value === pageSizeSelectionState) return
      const previousSelection = pageSizeSelectionState
      const previousPage = pageState
      const previousScrollY = typeof window !== 'undefined' ? window.scrollY : 0
      setPageSizeLoading(true)
      setPageSizeSelectionState(value)
      try {
        const params = new URLSearchParams()
        params.set('pageSize', value)
        params.set('page', String(previousPage))
        if (month) params.set('month', month)
        if (isPreview) params.set('preview', 'true')
        const res = await fetch(`/api/articles?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load articles')
        const data: { items: Article[]; total: number; page?: number; pageSize?: number } = await res.json()
        const currentArticles = articlesRef.current
        const currentById = new Map(currentArticles.map((item) => [item._id, item]))
        const mergedItems = data.items.map((item) => currentById.get(item._id) ?? item)
        const newIds = mergedItems.filter((item) => !currentById.has(item._id)).map((item) => item._id)
        const nextPageSize = data.pageSize || (value === 'all' ? data.total : mergedItems.length) || initialPageSize
        const maxPage = Math.max(1, Math.ceil(Math.max(1, data.total || totalState) / Math.max(1, nextPageSize)))
        const nextPage = data.page ? Math.min(data.page, maxPage) : Math.min(previousPage, maxPage)

        setArticles(mergedItems)
        setPageState(nextPage)
        setPageSizeState(nextPageSize)
  setTotalState(data.total ?? totalState)
        setHighlightedIds(newIds)

        window.requestAnimationFrame(() => {
          try {
            const url = new URL(window.location.href)
            url.searchParams.set('pageSize', value)
            url.searchParams.set('page', String(nextPage))
            if (month) url.searchParams.set('month', month)
            else url.searchParams.delete('month')
            window.history.replaceState({}, '', url.toString())
            if (Math.abs(window.scrollY - previousScrollY) > 4) {
              window.scrollTo({ top: previousScrollY })
            }
          } catch {}
        })

        baseQueryRef.current = {
          ...baseQueryRef.current,
          page: String(nextPage),
          pageSize: value,
        }
      } catch (error) {
        console.error(error)
        setPageSizeSelectionState(previousSelection)
        setPageState(previousPage)
      } finally {
        setPageSizeLoading(false)
      }
    },
    [initialPageSize, isPreview, month, pageSizeLoading, pageSizeSelectionState, pageState, totalState],
  )

  // empty state
  if (!articles || articles.length === 0) {
    return (
      <section className="container mx-auto px-4 py-16 md:px-6 lg:px-8" aria-labelledby="articles-empty-heading">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <h2 id="articles-empty-heading" className="text-3xl font-semibold tracking-tight">Fresh stories incoming</h2>
          <p className="text-muted-foreground">
            We&apos;re still lining up today&apos;s match reports and long-form features. Subscribe above for the weekly digest, or explore the archives using the month filter on the sidebar.
          </p>
          <p className="text-muted-foreground">
            Once the newsroom feed updates you can toggle between grid and list layouts, search for players, and jump directly to the original publishers for full context.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-muted-foreground" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span>Filters and layout controls unlock once articles are available.</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="container mx-auto px-4 py-2 md:py-4 lg:py-5 2xl:py-6 md:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="relative h-[400px] overflow-hidden rounded-lg shadow-lg md:h-[500px] lg:col-span-2 ring-1 ring-transparent transition-all duration-300 hover:shadow-xl hover:ring-foreground/10 dark:hover:ring-foreground/20">
          <a href={hero?.slug ? `/${hero.slug}` : (hero?.canonicalUrl || '#')} className="group block h-full">
            <div className="relative h-full w-full">
              <Image
                src={hero?.leadImageUrl || 'https://placehold.co/1200x600?text='}
                alt={hero?.title || 'Featured'}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
              {hero?.tags?.[0]?.name ? (
                <Badge className="mb-2 w-fit bg-white/20 text-white backdrop-blur-sm">{hero.tags[0].name}</Badge>
              ) : null}
              <h2 className="text-2xl leading-tight font-bold md:text-3xl">
                {hero?.title || 'Featured'}
              </h2>
              <div className="mt-1 flex items-center gap-3 text-sm text-white/80">
                {hero?.publishedAt ? (
                  <time dateTime={hero.publishedAt}>{formatFriendlyDate(hero.publishedAt)}</time>
                ) : null}
                <span className="ml-auto hidden items-center gap-1 text-white transition-opacity duration-200 group-hover:inline-flex">
                  <span className="hidden sm:inline">Click to read more</span>
                  <svg
                    className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </a>
        </div>

        <div className="bg-card text-card-foreground space-y-6 rounded-lg border p-6 lg:col-span-1">
          <h3 className="text-xl font-semibold">Other featured posts</h3>
          <div
            ref={sideRef}
            onScroll={onSideScroll}
            onMouseMove={onSideMouseMove}
            onMouseLeave={onSideMouseLeave}
            className="relative max-h-[60vh] overflow-y-auto pr-3"
          >
            <div className="space-y-4">
              {sidebar?.map((a) => (
                <FeaturedPostSidebarItem key={a._id} href={a.slug ? `/${a.slug}` : a.canonicalUrl} imageSrc={a.leadImageUrl || 'https://placehold.co/600x400?text='} imageAlt={a.title} title={a.title} publishedAt={a.publishedAt} />
              ))}
            </div>
            {/* Local scroll indicator (mirrors article side nav track/progress) */}
            <div className={`pointer-events-none absolute inset-y-0 right-0 transition-opacity duration-200 ${showSI ? 'opacity-100' : 'opacity-0'}`}>
              <div className="absolute right-0 top-0 h-full w-px bg-border/60 dark:bg-border/40" aria-hidden />
              <div className="absolute right-0 top-0 w-px bg-foreground/70 dark:bg-foreground/80" style={{ height: `${Math.round(scrollP * 100)}%` }} aria-hidden />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">Recent Posts</h2>
          <div className="flex flex-1 items-center gap-3 sm:flex-none">
            <div className="relative ml-auto w-full max-w-xs">
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search posts..."
                className="pl-8"
                aria-label="Search posts"
              />
              <svg
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
              >
                <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div className="flex items-center gap-2" aria-label="Toggle view" role="group">
              {/* Grid icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                aria-hidden
                className={cn('text-muted-foreground', gridView && 'text-foreground')}
              >
                <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="11" y="1" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="1" y="11" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="11" y="11" width="6" height="6" rx="1" fill="currentColor" />
              </svg>
              <Switch
                aria-label="Toggle list view"
                checked={!gridView}
                onCheckedChange={(checked) => setGridView(!checked)}
              />
              {/* List icon */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                aria-hidden
                className={cn('text-muted-foreground', !gridView && 'text-foreground')}
              >
                <rect x="1" y="2" width="16" height="3" rx="1" fill="currentColor" />
                <rect x="1" y="7.5" width="16" height="3" rx="1" fill="currentColor" />
                <rect x="1" y="13" width="16" height="3" rx="1" fill="currentColor" />
              </svg>
            </div>
            <Button variant="ghost" size="sm">
              <Link href="/">All Posts</Link>
            </Button>
          </div>
        </div>
        {searching ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">Searching…</div>
        ) : recents.length === 0 && searchValue.trim() ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">No results. Try a different search.</div>
        ) : gridView ? (
          <div className="grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recents?.map((a) => (
              <div
                key={a._id}
                className={cn('h-full motion-safe:transition-all', highlightSet.has(a._id) && 'animate-in fade-in-50 duration-500 slide-in-from-bottom-2')}
              >
                <BlogPostCard
                  href={a.slug ? `/${a.slug}` : a.canonicalUrl}
                  canonicalUrl={a.canonicalUrl}
                  imageSrc={a.leadImageUrl || 'https://placehold.co/600x400?text=.'}
                  imageAlt={a.title}
                  title={a.title}
                  description={a.excerpt || ''}
                  authorName={a.source?.name || 'Source'}
                  authorAvatarSrc="/placeholder.svg?height=24&width=24"
                  readTime={estimateReadTime(a.excerpt || a.title)}
                  publishedAt={a.publishedAt}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            {recents?.map((a) => (
              <a
                key={a._id}
                href={a.slug ? `/${a.slug}` : a.canonicalUrl}
                className={cn(
                  'flex items-center gap-4 p-4 hover:bg-accent/30 border-b last:border-b-0 motion-safe:transition-all',
                  highlightSet.has(a._id) && 'animate-in fade-in-50 duration-500 slide-in-from-bottom-2',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.leadImageUrl || 'https://placehold.co/300x200?text='} alt={a.title} className="h-20 w-28 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">{a.source?.name}</div>
                  <div className="font-ui font-semibold leading-tight line-clamp-2">{a.title}</div>
                </div>
                {a.publishedAt ? (
                  <time dateTime={a.publishedAt} className="text-sm text-muted-foreground">{formatFriendlyDate(a.publishedAt)}</time>
                ) : null}
              </a>
            ))}
          </div>
        )}
      </div>

      {!searching && !remoteItems ? (
        <div className="mt-10 flex justify-center">
          <Pagination
            page={pageState}
            pageSize={pageSizeState}
            total={totalState}
            basePath={basePath}
            query={{
              ...baseQueryRef.current,
              ...(month ? { month } : {}),
              ...(pageSizeSelectionState ? { pageSize: pageSizeSelectionState } : {}),
            }}
            pageSizeSelection={pageSizeSelectionState}
            onPageSizeChange={handlePageSizeSelect}
            pageSizeLoading={pageSizeLoading}
          />
        </div>
      ) : null}
    </div>
  )
}
