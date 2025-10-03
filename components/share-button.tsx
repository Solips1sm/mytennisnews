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
  copyLabel?: string
  shareLabel?: string
  copiedLabel?: string
  compact?: boolean
}

export function ShareButton({ title, url, className, size = 'sm', variant = 'outline', copyLabel, shareLabel, copiedLabel, compact }: ShareButtonProps) {
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

  const iconCls = compact ? 'mr-1.5 h-3.5 w-3.5' : 'mr-2 h-4 w-4'
  const btnExtra = compact ? 'h-7 px-2 text-xs' : ''

  return (
    <Button onClick={onShare} size={size} variant={variant} className={[className, btnExtra].filter(Boolean).join(' ')} aria-label="Share this article">
      {copied ? (
        <>
          <Check className={iconCls} /> {copiedLabel || 'Copied'}
        </>
      ) : canNativeShare ? (
        <>
          <Share2 className={iconCls} /> {shareLabel || 'Share'}
        </>
      ) : (
        <>
          <LinkIcon className={iconCls} /> {copyLabel || 'Copy link'}
        </>
      )}
    </Button>
  )
}
