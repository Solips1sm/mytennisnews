"use client"

import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown } from 'lucide-react'
import React from 'react'

export type SideDotNavProps = {
  count: number
  activeIndex?: number
  onPrev?: () => void
  onNext?: () => void
  onSelect?: (index: number) => void
  className?: string
  items?: { title: string; preview?: string }[]
}

export function SideDotNav({ count, activeIndex = 0, onPrev, onNext, onSelect, className, items }: SideDotNavProps) {
  const [hovered, setHovered] = React.useState<number | null>(null)
  const [hoverPos, setHoverPos] = React.useState<number | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const lastWheelAt = React.useRef<number>(0)
  if (!count || count <= 0) return null
  const indices = Array.from({ length: count }, (_, i) => i)
  const canPrev = activeIndex > 0 && !!onPrev
  const canNext = activeIndex < count - 1 && !!onNext

  const updateHover = (i: number | null) => {
    setHovered(i)
    if (i === null) {
      setHoverPos(null)
      return
    }
    const el = itemRefs.current[i]
    if (el && listRef.current) {
      setHoverPos(el.offsetTop + el.offsetHeight / 2)
    } else if (listRef.current) {
      const rect = listRef.current.getBoundingClientRect()
      const perItem = rect.height / count
      setHoverPos(perItem * (i + 0.5))
    }
  }

  const onScrubMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!listRef.current) return
    const rect = listRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top
    const perItem = rect.height / count
    let idx = Math.floor(y / perItem)
    if (idx < 0) idx = 0
    if (idx > count - 1) idx = count - 1
    if (hovered !== idx) updateHover(idx)
  }

  const onScrubLeave = () => updateHover(null)

  const onScrubWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    const now = Date.now()
    if (now - lastWheelAt.current < 250) return
    lastWheelAt.current = now
    if (e.deltaY > 10 && canNext && onNext) {
      e.preventDefault()
      onNext()
    } else if (e.deltaY < -10 && canPrev && onPrev) {
      e.preventDefault()
      onPrev()
    }
  }

  return (
    <div className={`absolute right-4 top-1/2 -translate-y-1/2 z-20 ${className ?? ''}`}>
      <div className="group flex flex-col items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Navigate to previous"
          className="h-8 w-8 !opacity-0 transition-opacity duration-200 group-hover:!opacity-100"
          disabled={!canPrev}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onPrev) {
              onPrev()
            }
          }}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>

        <div
          ref={listRef}
          className="relative flex flex-col items-center gap-0 py-1"
          onMouseMove={onScrubMove}
          onMouseLeave={onScrubLeave}
          onWheel={onScrubWheel}
        >
          {/* Track */}
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-full w-px bg-border/60 dark:bg-border/40" aria-hidden="true" />
          {/* Active progress */}
          <div
            className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-px bg-foreground/70 dark:bg-foreground/80"
            style={{ height: `${((activeIndex + 0.5) / count) * 100}%` }}
            aria-hidden="true"
          />
          {indices.map((i) => {
            const isActive = i === activeIndex
            const isHover = hovered === i
            return (
              <Button
                key={i}
                ref={(el: HTMLButtonElement | null) => {
                  itemRefs.current[i] = el
                }}
                variant="ghost"
                size="sm"
                aria-label={`Go to ${i + 1}`}
                aria-current={isActive ? 'true' : undefined}
                className="px-2.5 text-xs relative flex items-center justify-center w-8 h-6 rounded focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (onSelect) {
                    onSelect(i)
                  }
                }}
                onMouseEnter={() => updateHover(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                disabled={!onSelect}
              >
                <div
                  className={`rounded-full transition-all duration-200 ${
                    isActive
                      ? 'h-2 w-2 bg-foreground shadow-[0_0_0_3px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_3px_rgba(255,255,255,0.08)]'
                      : isHover
                        ? 'h-1.5 w-1.5 bg-foreground/80'
                        : 'h-1 w-1 bg-muted-foreground'
                  }`}
                />
              </Button>
            )
          })}
          {/* Floating tooltip for hovered item */}
          {hovered !== null && items && items[hovered] && hoverPos !== null ? (
            <div
              className="pointer-events-none absolute right-10 z-50 w-72 max-w-[20rem] -translate-y-1/2 rounded-lg border bg-popover/85 p-3 text-popover-foreground shadow-md backdrop-blur-md"
              style={{ top: hoverPos }}
              role="tooltip"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="line-clamp-1 text-xs font-medium text-foreground">{items[hovered].title}</div>
                <div className="text-[10px] text-muted-foreground">{hovered + 1}/{count}</div>
              </div>
              {items[hovered].preview ? (
                <div className="max-h-24 overflow-hidden text-xs text-muted-foreground [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]">
                  {items[hovered].preview}
                </div>
              ) : null}
              <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">Click to jump</div>
            </div>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Navigate to next"
          className="h-8 w-8 !opacity-0 transition-opacity duration-200 group-hover:!opacity-100"
          disabled={!canNext}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (onNext) {
              onNext()
            }
          }}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
