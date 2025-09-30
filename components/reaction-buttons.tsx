"use client"
import * as React from 'react'

type Props = { articleId: string }

export function ReactionButtons({ articleId }: Props) {
  const [counts, setCounts] = React.useState<{ like: number; dislike: number }>({ like: 0, dislike: 0 })
  const [selected, setSelected] = React.useState<null | 'like' | 'dislike'>(null)
  const [loading, setLoading] = React.useState(false)
  const countsRef = React.useRef(counts)
  const selectedRef = React.useRef<null | 'like' | 'dislike'>(selected)
  const requestIdRef = React.useRef(0)
  const controllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    countsRef.current = counts
  }, [counts])

  React.useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      try {
        const res = await fetch(`/api/reactions?articleId=${encodeURIComponent(articleId)}`, { cache: 'no-store' })
        const data = await res.json()
        if (!ignore) {
          setCounts({ like: data.like || 0, dislike: data.dislike || 0 })
          setSelected(data.selected ?? null)
        }
      } catch {
        if (!ignore) {
          setCounts({ like: 0, dislike: 0 })
          setSelected(null)
        }
      }
    }
    load()
    return () => { ignore = true }
  }, [articleId])

  async function onReact(type: 'like' | 'dislike') {
    const prevSelected = selectedRef.current
    const prevCounts = countsRef.current
    const nextSelected = prevSelected === type ? null : type

    const nextCounts = (() => {
      if (prevSelected === 'like' && type === 'dislike') return { like: Math.max(0, prevCounts.like - 1), dislike: prevCounts.dislike + 1 }
      if (prevSelected === 'dislike' && type === 'like') return { like: prevCounts.like + 1, dislike: Math.max(0, prevCounts.dislike - 1) }
      if (prevSelected === type) {
        return type === 'like'
          ? { like: Math.max(0, prevCounts.like - 1), dislike: prevCounts.dislike }
          : { like: prevCounts.like, dislike: Math.max(0, prevCounts.dislike - 1) }
      }
      if (prevSelected == null && type === 'like') return { like: prevCounts.like + 1, dislike: prevCounts.dislike }
      if (prevSelected == null && type === 'dislike') return { like: prevCounts.like, dislike: prevCounts.dislike + 1 }
      return prevCounts
    })()

    setSelected(nextSelected)
    setCounts(nextCounts)
    selectedRef.current = nextSelected
    countsRef.current = nextCounts

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const res = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, type }),
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('request failed')
      // Reconcile with server values (source of truth)
      if (requestId === requestIdRef.current && typeof data.like === 'number' && typeof data.dislike === 'number') {
        const reconciled = { like: data.like, dislike: data.dislike }
        setCounts(reconciled)
        countsRef.current = reconciled
        // Server already reflected toggle off when counts return; selected state is already set optimistically
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || controller.signal.aborted) {
        return
      }
      // Revert on failure
      setSelected(prevSelected)
      setCounts(prevCounts)
      selectedRef.current = prevSelected
      countsRef.current = prevCounts
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  return (
    <div className="mt-8 flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => onReact('like')}
        className={`group inline-flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent ${selected === 'like' ? 'bg-accent' : ''}`}
        aria-busy={loading}
        aria-pressed={selected === 'like'}
        aria-label="Like this article"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="opacity-80 group-hover:opacity-100" aria-hidden>
          <path d="M7 11l4.5-6.5c.3-.4.5-.6.9-.6.6 0 1 .4 1 1v4h4.2c.7 0 1.3.6 1.3 1.3 0 .1 0 .3-.1.4l-1.4 6.1c-.2.8-.9 1.3-1.7 1.3H9c-.8 0-1.5-.7-1.5-1.5V11zM5 11v8H3v-8h2z"/>
        </svg>
        <span>{counts.like}</span>
      </button>

      <button
        type="button"
        onClick={() => onReact('dislike')}
        className={`group inline-flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-accent ${selected === 'dislike' ? 'bg-accent' : ''}`}
        aria-busy={loading}
        aria-pressed={selected === 'dislike'}
        aria-label="Dislike this article"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="opacity-80 group-hover:opacity-100" aria-hidden>
          <path d="M7 13l4.5 6.5c.3.4.5.6.9.6.6 0 1-.4 1-1v-4h4.2c.7 0 1.3-.6 1.3-1.3 0-.1 0-.3-.1-.4l-1.4-6.1c-.2-.8-.9-1.3-1.7-1.3H9c-.8 0-1.5.7-1.5 1.5V13zM5 13V5H3v8h2z"/>
        </svg>
        <span>{counts.dislike}</span>
      </button>
    </div>
  )
}
