export type ChallengeType = 'cloudflare' | 'akamai' | 'bot-block' | 'unknown'

export type ChallengeDetection = {
  type: ChallengeType
  indicator: string
  reason?: string
  confidence: number
}

const CLOUD_FLARE_PATTERNS: Array<RegExp> = [
  /<title>\s*Just a moment\s*\.\.\./i,
  /<meta[^>]+http-equiv="refresh"[^>]+\/cdn-cgi\//i,
  /window\._cf_chl_opt/i,
  /cf-turnstile/i,
  /Ray ID:\s*<code>/i,
  /Performance &\s*security by\s*<a[^>]+cloudflare/i,
]

const GENERIC_BLOCK_PATTERNS: Array<RegExp> = [
  /Access Denied/i,
  /Reference ID/i,
  /Request denied by/i,
]

function testPatterns(html: string, patterns: Array<RegExp>): string | null {
  for (const pattern of patterns) {
    if (pattern.test(html)) {
      return pattern.source
    }
  }
  return null
}

export function detectChallenge(html: string | null | undefined): ChallengeDetection | null {
  if (!html) return null
  const snippet = html.slice(0, 20000)
  const cf = testPatterns(snippet, CLOUD_FLARE_PATTERNS)
  if (cf) {
    return { type: 'cloudflare', indicator: cf, reason: 'cloudflare-challenge', confidence: 0.95 }
  }
  const generic = testPatterns(snippet, GENERIC_BLOCK_PATTERNS)
  if (generic) {
    return { type: 'bot-block', indicator: generic, reason: 'generic-block', confidence: 0.7 }
  }
  const text = stripTags(snippet).toLowerCase()
  if (text.includes('verify you are human') && text.includes('cloudflare')) {
    return { type: 'cloudflare', indicator: 'text-verify-human', reason: 'cloudflare-challenge-text', confidence: 0.9 }
  }
  if (text.includes('access denied') && text.includes('request id')) {
    return { type: 'akamai', indicator: 'text-access-denied', reason: 'akamai-access-denied', confidence: 0.6 }
  }
  return null
}

export function hasChallengeArtifact(input: string | null | undefined): boolean {
  return !!detectChallenge(input)
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
