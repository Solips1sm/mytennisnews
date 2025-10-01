import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function estimateReadTime(text: string): string {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(words / 225))
  return `${minutes} min`
}

const protocolRegex = /^[a-zA-Z][a-zA-Z\d+\-.]*:/

export function ensureHttpsUrl(input?: string | null, fallback?: string): string | undefined {
  const candidate = (input || '').trim()
  if (!candidate) {
    return fallback ? ensureHttpsUrl(fallback) : undefined
  }

  try {
    const hasProtocol = protocolRegex.test(candidate)
    const url = new URL(hasProtocol ? candidate : `https://${candidate}`)
    url.protocol = 'https:'
    if (!url.hostname) {
      return fallback ? ensureHttpsUrl(fallback) : undefined
    }
    // Normalize default port 443 away
    if (url.port === '443') {
      url.port = ''
    }
    // Remove trailing slash for canonical usage
    url.pathname = url.pathname || '/'
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '')
    }
    const serialized = url.toString()
    if (url.pathname !== '/' && serialized.endsWith('/')) {
      return serialized.slice(0, -1)
    }
    return serialized
  } catch {
    return fallback ? ensureHttpsUrl(fallback) : undefined
  }
}

export function getFaviconUrl(urlStr?: string): string | undefined {
  if (!urlStr) return undefined
  try {
    const u = new URL(urlStr)
    // Use Google S2 favicons for reliability
    return `https://www.google.com/s2/favicons?sz=64&domain=${u.hostname}`
  } catch {
    return undefined
  }
}

export function formatFriendlyDate(input?: string | Date): string | undefined {
  if (!input) return undefined
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return undefined
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfInput = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfInput.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
