import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function estimateReadTime(text: string): string {
  // Static linear model based on character count (CPM)
  // 1) Strip naive HTML tags if any
  // 2) Measure character length
  // 3) Divide by constant CPM and round to minutes
  const raw = (text || '')
  const plain = raw.replace(/<[^>]*>/g, '').trim()
  const chars = plain.length
  // Average reading ~200 wpm ~ 1000–1200 chars/min. Use 1200 CPM for stability.
  const CPM = 1200
  const minutes = Math.max(1, Math.round(chars / CPM))
  return `${minutes} min`
}

export function estimateReadTimeFromChars(chars: number | undefined | null): string {
  const CPM = 1200
  const n = typeof chars === 'number' && isFinite(chars) ? Math.max(0, Math.floor(chars)) : 0
  const minutes = Math.max(1, Math.round(n / CPM))
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
  // If it's today, show minute-wise (<1h) or hour-wise (1–4h) relative labels; otherwise keep existing semantics
  if (diffDays === 0) {
    const diffMs = now.getTime() - d.getTime()
    // For future timestamps (clock skew, scheduled), keep neutral "Today"
    if (diffMs < 0) return 'Today'
    const oneMin = 60_000
    const oneHour = 3_600_000
    if (diffMs < oneHour) {
      const mins = Math.max(1, Math.floor(diffMs / oneMin))
      return `${mins} min. ago`
    }
    const hours = Math.floor(diffMs / oneHour)
    if (hours >= 1 && hours <= 4) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`
    }
    return 'Today'
  }
  if (diffDays === 1) return 'Yesterday'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

function normalizePreferredHost(candidateUrl: string, preferredUrl: string): string {
  try {
    const candidate = new URL(candidateUrl)
    const preferred = new URL(preferredUrl)
    const preferredHostname = preferred.hostname
    const barePreferred = preferredHostname.replace(/^www\./, '')
    const candidateHostname = candidate.hostname
    if (preferredHostname !== barePreferred && candidateHostname === barePreferred) {
      candidate.hostname = preferredHostname
      candidate.port = ''
    }
    candidate.protocol = 'https:'
    if (candidate.port === '443') {
      candidate.port = ''
    }
    const serialized = candidate.toString()
    return serialized.endsWith('/') ? serialized.slice(0, -1) : serialized
  } catch {
    return candidateUrl.endsWith('/') ? candidateUrl.slice(0, -1) : candidateUrl
  }
}

export function resolveSiteUrl(preferredUrl = 'https://www.mytennisnews.com'): string {
  const fallback = ensureHttpsUrl(preferredUrl) || 'https://www.mytennisnews.com'
  const rawCandidate =
    ensureHttpsUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL, fallback) || fallback
  return normalizePreferredHost(rawCandidate, fallback)
}

export function resolveSiteOrigin(preferredUrl = 'https://www.mytennisnews.com'): string {
  const url = resolveSiteUrl(preferredUrl)
  return url.replace(/\/$/, '')
}

/**
 * Format a date (string or Date) as DD/MM/YYYY HH:MM in the user's local time.
 */
export function formatLocalDetailed(input?: string | Date): string | undefined {
  if (!input) return undefined
  const d = typeof input === 'string' ? new Date(input) : input
  if (isNaN(d.getTime())) return undefined
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}
