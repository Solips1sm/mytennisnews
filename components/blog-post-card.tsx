"use client"
import React, { useRef, useState } from 'react'
import Image from 'next/image'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveSourceLogo } from '@/lib/logo-resolver'
import { formatFriendlyDate } from '@/lib/utils'

interface BlogPostCardProps {
  imageSrc: string
  imageAlt: string
  title: string
  description: string
  authorName: string
  authorAvatarSrc: string
  readTime: string
  href?: string
  canonicalUrl?: string
  publishedAt?: string
}

export function BlogPostCard({ imageSrc, imageAlt, title, description, authorName, authorAvatarSrc, readTime, href, canonicalUrl, publishedAt }: BlogPostCardProps) {
  const cardRef = useRef<HTMLAnchorElement | null>(null)
  const [origin, setOrigin] = useState<'left' | 'right' | 'center'>('left')
  const initials = authorName.split(' ').map((n) => n[0]).join('')
  const urlToCheck = canonicalUrl || href
  let host: string | undefined
  if (urlToCheck) {
    try { host = new URL(urlToCheck, 'http://localhost').hostname } catch {}
  }
  const logo = resolveSourceLogo(urlToCheck, authorName)
  return (
    <a
      ref={cardRef}
      className="group flex h-full min-h-[420px] flex-col overflow-hidden rounded-lg border bg-card text-card-foreground transition-colors duration-200 hover:bg-accent/30"
      href={href || '#'}
      onMouseEnter={(e) => {
        const el = cardRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dxL = Math.abs(e.clientX - r.left)
        const dxR = Math.abs(r.right - e.clientX)
        const dyT = Math.abs(e.clientY - r.top)
        const dyB = Math.abs(r.bottom - e.clientY)
        const min = Math.min(dxL, dxR, dyT, dyB)
        if (min === dyT || min === dyB) setOrigin('center')
        else if (min === dxL) setOrigin('left')
        else setOrigin('right')
      }}
    >
      <div className="relative h-48 w-full flex-shrink-0 overflow-hidden">
        <Image
          src={imageSrc || '/placeholder.svg?height=225&width=400'}
          alt={imageAlt}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="relative flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-ui text-lg font-semibold leading-tight">{title}</h3>
        <p className="font-ui text-sm text-muted-foreground line-clamp-3">{description}</p>
        <div className="mt-auto flex items-center gap-1 text-sm text-muted-foreground">
          <Avatar className="h-6 w-6">
            {logo ? (
              <AvatarImage src={logo.src} alt={logo.alt} className={logo.className} />
            ) : (
              <AvatarImage src={authorAvatarSrc || '/placeholder.svg?height=24&width=24'} alt={authorName} className="object-cover" />
            )}
          </Avatar>
          <span>{authorName}</span>
          <span>•</span>
          <span>{readTime} read</span>
          {publishedAt ? (<>
            <span>•</span>
            <time dateTime={publishedAt}>{formatFriendlyDate(publishedAt)}</time>
          </>) : null}
        </div>
        {/* Hover accent line under meta row, positioned within content bounds */}
        <div
          className="pointer-events-none absolute bottom-3 left-4 right-4 h-px scale-x-75 bg-primary/60 opacity-0 transition-all duration-200 group-hover:scale-x-100 group-hover:opacity-100"
          style={{ transformOrigin: origin }}
          aria-hidden
        />
      </div>
    </a>
  )
}
