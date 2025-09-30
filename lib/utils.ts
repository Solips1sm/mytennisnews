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
