export function isAllowedToExtract(urlStr: string): boolean {
  const raw = process.env.INGEST_ALLOWED_DOMAINS
  if (!raw) return true // If unset, allow by default; set to lock down
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()
    const allowed = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    return allowed.some((d) => host === d || host.endsWith('.' + d))
  } catch {
    return false
  }
}
