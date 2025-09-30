"use client"
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Share2, Check, Link as LinkIcon } from 'lucide-react'

type ShareButtonProps = {
  title?: string
  url?: string
  className?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
}

export function ShareButton({ title, url, className, size = 'sm', variant = 'outline' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const targetUrl = useMemo(() => {
    if (url && url.length) return url
    if (typeof window !== 'undefined') return window.location.href
    return ''
  }, [url])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const onShare = useCallback(async () => {
    const shareData = {
      title: title || (typeof document !== 'undefined' ? document.title : undefined),
      url: targetUrl,
    }
    try {
      if (navigator.share && targetUrl) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // fall through to copy
    }
    try {
      if (targetUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl)
        setCopied(true)
      }
    } catch {
      // noop
    }
  }, [targetUrl, title])

  const canNativeShare = typeof window !== 'undefined' && 'share' in navigator && typeof (navigator as any).share === 'function'

  return (
    <Button onClick={onShare} size={size} variant={variant} className={className} aria-label="Share this article">
      {copied ? (
        <>
          <Check className="mr-2 h-4 w-4" /> Copied
        </>
      ) : canNativeShare ? (
        <>
          <Share2 className="mr-2 h-4 w-4" /> Share
        </>
      ) : (
        <>
          <LinkIcon className="mr-2 h-4 w-4" /> Copy link
        </>
      )}
    </Button>
  )
}
