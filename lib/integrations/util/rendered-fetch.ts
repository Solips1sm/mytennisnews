export type RenderedFetchResult = { html: string | null; status?: number }

export async function fetchRenderedHtml(
  url: string,
  opts?: { timeoutMs?: number; waitSelectors?: string[]; userAgent?: string }
): Promise<RenderedFetchResult> {
  let browser: any
  try {
    // Dynamic import so the rest of the codebase doesn't require puppeteer in all environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = (await import('puppeteer')).default
    browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    if (opts?.userAgent) await page.setUserAgent(opts.userAgent)
    const timeout = opts?.timeoutMs ?? 30000
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout })
    // Optionally wait for selectors that indicate dynamic content hydrated
    if (opts?.waitSelectors?.length) {
      for (const sel of opts.waitSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 })
        } catch {}
      }
    }
    // Small extra delay to allow late client-side text replacements
    await page.waitForTimeout(800)
    const html = await page.content()
    const status = response?.status()
    await page.close()
    await browser.close()
    browser = null
    return { html, status }
  } catch {
    try { if (browser) await browser.close() } catch {}
    return { html: null }
  }
}

export function shouldUseRenderedFetch(host: string): boolean {
  const flag = (process.env.INGEST_RENDERED || '').toLowerCase() === 'true'
  if (flag) return true
  const list = (process.env.INGEST_RENDERED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (!list.length) return false
  const h = host.toLowerCase()
  return list.some((d) => h === d || h.endsWith(`.${d}`))
}
