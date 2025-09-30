'use client'

import {
  Pagination as PaginationRoot,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { cn } from '@/lib/utils'

type PaginationProps = {
  page: number
  pageSize: number
  total: number
  query?: Record<string, string | undefined>
  basePath?: string
  pageSizeSelection?: string
  onPageSizeChange?: (value: string) => void | Promise<void>
  pageSizeLoading?: boolean
  sizeOptions?: Array<{ label: string; value: string }>
}

export function Pagination({
  page,
  pageSize,
  total,
  query,
  basePath = '/',
  pageSizeSelection,
  onPageSizeChange,
  pageSizeLoading,
  sizeOptions: sizeOptionsOverride,
}: PaginationProps) {
  const safePageSize = Math.max(1, pageSize)
  const pageCount = Math.max(1, Math.ceil(total / safePageSize))
  const clamp = (p: number) => Math.min(Math.max(1, p), pageCount)
  const explicitSelection = pageSizeSelection?.toLowerCase()
  const normalizedSelection = explicitSelection || (safePageSize >= total && total > 0 ? 'all' : String(safePageSize))

  const buildQuery = (overrides: Record<string, string | undefined>) => {
    const result: Record<string, string> = {}
    const merged = { ...(query || {}), ...(explicitSelection ? { pageSize: explicitSelection } : {}), ...overrides }
    Object.entries(merged).forEach(([key, value]) => {
      if (value !== undefined) result[key] = value
    })
    return result
  }

  const buildHref = (p: number) => ({ pathname: basePath, query: buildQuery({ page: String(p) }) } as const)
  const buildPageSizeHref = (value: string) => ({ pathname: basePath, query: buildQuery({ page: String(clamp(page)), pageSize: value }) } as const)

  const sizeOptions = sizeOptionsOverride || [
    { label: '50', value: '50' },
    { label: '100', value: '100' },
    { label: 'All', value: 'all' },
  ]

  // Build a compact page series with ellipses: 1 … prev current next … last
  const pages: Array<number | 'ellipsis'> = []
  const push = (v: number | 'ellipsis') => pages.push(v)
  const addRange = (start: number, end: number) => {
    for (let i = start; i <= end; i++) push(i)
  }
  const current = clamp(page)

  if (pageCount <= 7) {
    addRange(1, pageCount)
  } else {
    push(1)
    if (current > 4) push('ellipsis')
    const start = Math.max(2, current - 1)
    const end = Math.min(pageCount - 1, current + 1)
    addRange(start, end)
    if (current < pageCount - 3) push('ellipsis')
    push(pageCount)
  }

  return (
    <div className="relative flex w-full items-center justify-center">
      <PaginationRoot>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href={current > 1 ? buildHref(current - 1) : buildHref(1)} aria-disabled={current <= 1} />
          </PaginationItem>
          {pages.map((p, i) => (
            <PaginationItem key={`${p}-${i}`}>
              {p === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink href={buildHref(p)} isActive={p === current}>
                  {p}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext href={current < pageCount ? buildHref(current + 1) : buildHref(pageCount)} aria-disabled={current >= pageCount} />
          </PaginationItem>
        </PaginationContent>
      </PaginationRoot>
      <div className="absolute right-0 flex items-center gap-1">
        {sizeOptions.map(({ label, value }) => {
          const isActive = normalizedSelection === value || (value === 'all' && normalizedSelection === 'all')
          return (
            <PaginationLink
              key={value}
              href={buildPageSizeHref(value)}
              isActive={isActive}
              aria-disabled={pageSizeLoading ? 'true' : undefined}
              className={cn(
                'border bg-background shadow-xs font-extralight dark:bg-input/20 dark:border-input dark:hover:bg-input/50 size-8',
                (pageSizeLoading && !isActive) || (isActive && pageSizeLoading) ? 'pointer-events-none opacity-70' : undefined,
              )}
              onClick={
                onPageSizeChange
                  ? (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      if (pageSizeLoading || isActive) return
                      void onPageSizeChange(value)
                    }
                  : undefined
              }
            >
              {pageSizeLoading && isActive ? (
                <span className="flex items-center gap-1 text-xs">
                  <span className="inline-flex size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden />
                  {label}
                </span>
              ) : (
                label
              )}
            </PaginationLink>
          )
        })}
      </div>
    </div>
  )
}
