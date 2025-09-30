export type RenderedFetchResult = { html: string | null; status?: number }

type RenderedDriver = 'puppeteer' | 'real-browser'

type FetchOptions = { timeoutMs?: number; waitSelectors?: string[]; userAgent?: string }

function resolveRenderedDriver(): RenderedDriver {
  const raw = (process.env.INGEST_RENDERED_DRIVER || '').trim().toLowerCase()
  return raw === 'real-browser' ? 'real-browser' : 'puppeteer'
}

async function closeQuietly(fn: (() => Promise<any>) | undefined) {
  if (!fn) return
  try {
    await fn()
  } catch {}
}

async function fetchViaPuppeteer(url: string, opts?: FetchOptions): Promise<RenderedFetchResult> {
  let browser: any
  try {
    const puppeteer = (await import('puppeteer')).default
    const launchOptions: Record<string, any> = {
      headless: (process.env.INGEST_PUPPETEER_HEADLESS || 'true').toLowerCase() === 'false' ? false : 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }
    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()
    if (opts?.userAgent) await page.setUserAgent(opts.userAgent)
    const timeout = opts?.timeoutMs ?? 30000
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout })
    if (opts?.waitSelectors?.length) {
      for (const sel of opts.waitSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 })
        } catch {}
      }
    }
    await page.waitForTimeout(800)
    const html = await page.content()
    const status = response?.status?.()
    await page.close()
    await browser.close()
    browser = null
    return { html, status }
  } catch (err) {
    if (process.env.INGEST_DEBUG === 'true') {
      console.warn('[rendered-fetch] puppeteer render failed', err)
    }
    await closeQuietly(browser?.close?.bind(browser))
    return { html: null }
  }
}

async function fetchViaRealBrowser(url: string, opts?: FetchOptions): Promise<RenderedFetchResult> {
  const closers: Array<() => Promise<any>> = []
  try {
    const realBrowserModule: any = await import('puppeteer-real-browser')
    const connect = realBrowserModule?.connect ?? realBrowserModule?.default ?? realBrowserModule
    if (typeof connect !== 'function') {
      throw new Error('puppeteer-real-browser does not export a connect function')
    }
    const headlessPref = (process.env.INGEST_REAL_BROWSER_HEADLESS || 'shell').toLowerCase()
    let headless: boolean | 'shell'
    if (headlessPref === 'true') headless = true
    else if (headlessPref === 'false') headless = false
    else headless = 'shell'
    const timeout = opts?.timeoutMs ?? 30000
    const connectOptions: Record<string, any> = {
      headless,
      turnstile: true,
      disableXvfb: (process.env.INGEST_REAL_BROWSER_XVFB || '').toLowerCase() === 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      customConfig: {},
      connectOption: { defaultViewport: null },
    }
    if (process.env.INGEST_REAL_BROWSER_CHROME_PATH) {
      connectOptions.customConfig.chromePath = process.env.INGEST_REAL_BROWSER_CHROME_PATH
    }
    const session = await connect(connectOptions)
    const page = session?.page ?? session
    const browser = session?.browser ?? (typeof session?.browser === 'function' ? session.browser() : undefined)
    if (page?.close) {
      closers.push(() => page.close())
    }
    if (browser?.close && browser !== page) {
      closers.push(() => browser.close())
    }
    if (session?.close && session !== browser && session !== page) {
      closers.push(() => session.close())
    }
    if (opts?.userAgent && page?.setUserAgent) {
      await page.setUserAgent(opts.userAgent)
    }
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout })
    if (opts?.waitSelectors?.length) {
      for (const sel of opts.waitSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 })
        } catch {}
      }
    }
    await page.waitForTimeout(800)
    const html = await page.content()
    const statusCandidate = typeof response?.status === 'function' ? response.status() : response?.status
    return { html, status: typeof statusCandidate === 'number' ? statusCandidate : undefined }
  } catch (err) {
    console.warn('[rendered-fetch] real-browser fetch failed, falling back to puppeteer', err)
    return { html: null }
  } finally {
    while (closers.length) {
      await closeQuietly(closers.pop())
    }
  }
}

export async function fetchRenderedHtml(url: string, opts?: FetchOptions): Promise<RenderedFetchResult> {
  if (resolveRenderedDriver() === 'real-browser') {
    const realBrowserResult = await fetchViaRealBrowser(url, opts)
    if (realBrowserResult.html) {
      return realBrowserResult
    }
  }
  return fetchViaPuppeteer(url, opts)
}

export function shouldUseRenderedFetch(host: string): boolean {
  const flag = (process.env.INGEST_RENDERED || '').toLowerCase() === 'true'
  if (flag) return true
  const allowlist = (process.env.INGEST_RENDERED_HOSTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (!allowlist.length) return false
  const h = host.toLowerCase()
  return allowlist.some((d) => h === d || h.endsWith(`.${d}`))
}
