"use client"
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export type ImageSource = {
  type?: string
  media?: string
  srcSet: string
}

export type FullscreenImageProps = {
  src: string
  alt: string
  caption?: string
  credit?: string
  canonicalUrl?: string
  sources?: ImageSource[]
  aspectRatio?: number // e.g., 16/9 or 1.5
  width?: number
  height?: number
  className?: string
  imgClassName?: string
  rounded?: boolean
}

export function FullscreenImage({
  src,
  alt,
  caption,
  credit,
  canonicalUrl,
  sources,
  aspectRatio,
  width,
  height,
  className,
  imgClassName,
  rounded = true,
}: FullscreenImageProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const id = useId()
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'copied' | 'error'>('idle')
  const [downloading, setDownloading] = useState(false)

  const getSuggestedFilename = () => {
    try {
      const u = new URL(src, window.location.origin)
      const name = u.pathname.split('/').filter(Boolean).pop() || 'image'
      const inferred = name.split('?')[0]
      if (alt) {
        const prefix = alt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
        return prefix ? `${prefix}-${inferred}` : inferred
      }
      return inferred
    } catch {
      return 'image'
    }
  }

  const downloadImage = async () => {
    const filename = getSuggestedFilename()
    setDownloading(true)
    try {
      // Prefer File System Access API when available
      const anyWindow = window as any
      if (anyWindow.showSaveFilePicker) {
        const handle = await anyWindow.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Image',
              accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
            },
          ],
        })
        const writable = await handle.createWritable()
        const res = await fetch(src, { mode: 'cors' })
        if (!res.ok) throw new Error('fetch-failed')
        await writable.write(await res.blob())
        await writable.close()
      } else {
        // Fallback: fetch -> object URL -> temporary anchor click
        let blob: Blob | null = null
        try {
          const res = await fetch(src, { mode: 'cors' })
          if (!res.ok) throw new Error('fetch-failed')
          blob = await res.blob()
        } catch {
          blob = null
        }
        if (blob) {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        } else {
          // Last resort: rely on browser handling of download attribute
          const a = document.createElement('a')
          a.href = src
          a.download = filename
          a.rel = 'noopener'
          document.body.appendChild(a)
          a.click()
          a.remove()
        }
      }
    } catch {
      // ignore; user might have cancelled
    } finally {
      setDownloading(false)
    }
  }

  const close = useCallback(() => setOpen(false), [])
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onKeyDown])

  // Restore scroll position and focus when closing
  useEffect(() => {
    if (open) {
      const prev = document.documentElement.style.overflow
      const el = triggerRef.current
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = prev
        el && el.focus()
      }
    }
  }, [open])

  const resolvedAspectRatio = aspectRatio ?? (width && height ? width / height : 16 / 9)
  const resolvedWidth = width ?? 1200
  const resolvedHeight = height ?? Math.max(1, Math.round(resolvedWidth / resolvedAspectRatio))

  return (
    <figure className={cn('group relative', className)}>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label="View image full-screen"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'relative w-full overflow-hidden outline-none',
          rounded && 'rounded-md',
          'ring-1 ring-transparent transition-all duration-300 hover:ring-foreground/10 dark:hover:ring-foreground/20'
        )}
        style={resolvedAspectRatio ? { aspectRatio: String(resolvedAspectRatio) } : undefined}
      >
        <picture>
          {sources?.map((s, idx) => (
            <source key={idx} type={s.type} media={s.media} srcSet={s.srcSet} />
          ))}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            width={resolvedWidth}
            height={resolvedHeight}
            className={cn('h-auto w-full object-cover', imgClassName)}
            loading="lazy"
          />
        </picture>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        <div className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="hidden sm:inline">Full screen</span>
        </div>
      </div>

      {(caption || credit) && (
        <figcaption className="mt-2 flex flex-col gap-1 text-[11px] leading-snug text-muted-foreground/90 sm:flex-row sm:items-start sm:justify-between">
          {caption ? <div className="sm:max-w-[75%] font-medium text-foreground/90">{caption}</div> : <span />}
          {credit ? (
            <div className="sm:text-right opacity-70 flex-1 sm:max-w-[40%]">
              {credit}
              {canonicalUrl ? (
                <>
                  {' '}
                  · <a href={canonicalUrl} target="_blank" rel="noopener nofollow" className="underline">
                    Source
                  </a>
                </>
              ) : null}
            </div>
          ) : null}
        </figcaption>
      )}

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-caption`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div className="relative max-h-[100svh] max-w-[100svw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={close}
              className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/70"
              aria-label="Close full-screen"
            >
              Close
            </button>
            <div className={cn('flex items-center justify-center', rounded && 'rounded-md overflow-hidden')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-h-[85svh] max-w-[90svw] object-contain"
              />
            </div>
            {/* Toolbar under the image */}
            <div className="mt-3 flex items-center justify-center gap-3">
              {/* Download button */}
              <button
                type="button"
                onClick={downloadImage}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-md border bg-background/80 px-3 py-1.5 text-sm hover:bg-background disabled:opacity-60"
                aria-label="Download image"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                  <path d="M5 21h14" />
                </svg>
                <span className="hidden sm:inline">{downloading ? 'Downloading…' : 'Download'}</span>
              </button>

              {/* Share button */}
              <button
                type="button"
                onClick={async () => {
                  const shareUrl = src
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: alt, text: 'Download image', url: shareUrl })
                      setShareStatus('shared')
                      setTimeout(() => setShareStatus('idle'), 1500)
                    } else if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(shareUrl)
                      setShareStatus('copied')
                      setTimeout(() => setShareStatus('idle'), 1500)
                    } else {
                      setShareStatus('error')
                      setTimeout(() => setShareStatus('idle'), 1500)
                    }
                  } catch {
                    setShareStatus('error')
                    setTimeout(() => setShareStatus('idle'), 1500)
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md border bg-background/80 px-3 py-1.5 text-sm hover:bg-background"
                aria-label="Share image"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
                  <path d="M16 6l-4-4-4 4" />
                  <path d="M12 2v14" />
                </svg>
                <span className="hidden sm:inline">
                  {shareStatus === 'shared' ? 'Shared' : shareStatus === 'copied' ? 'Copied' : 'Share'}
                </span>
              </button>
            </div>
            {(caption || credit) && (
              <div id={`${id}-caption`} className="mt-3 max-w-[90svw] text-center text-xs text-muted-foreground">
                {caption ? <div>{caption}</div> : null}
                {credit ? (
                  <div className="opacity-80">
                    {credit}
                    {canonicalUrl ? (
                      <>
                        {' '}
                        · <a href={canonicalUrl} target="_blank" rel="noopener nofollow" className="underline">
                          Source
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </figure>
  )
}

export default FullscreenImage
