import { serverClient } from '@/lib/sanity'
import { ARTICLES_LIST_PUBLISHED } from '@/lib/queries'

function isWithinDays(dateStr: string | undefined, days: number) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  return diff <= days
}

function toAbsoluteUrl(slug?: string, canonicalUrl?: string) {
  if (canonicalUrl) return canonicalUrl
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base}/${slug ?? ''}`
}

function renderText(items: any[]) {
  if (!items.length) return 'No new articles.'
  return items
    .map((a) => {
      const link = toAbsoluteUrl(a.slug, a.canonicalUrl)
      const source = a.source?.name ? ` – ${a.source.name}` : ''
      const excerpt = a.excerpt ? `\n  ${a.excerpt}` : ''
      return `- ${a.title}${source}\n  ${link}${excerpt}`
    })
    .join('\n')
}

function renderHtml(items: any[], period: 'daily' | 'weekly') {
  const title = period === 'daily' ? 'MyTennisNews - Daily Digest' : 'MyTennisNews - Weekly Digest'
  const badgeLabel = period === 'daily' ? 'Daily' : 'Weekly'
  const empty = `<tr><td style="padding:32px 0;color:#9ca3af;font-size:14px;">No new articles.</td></tr>`

  const itemBlocks = items
    .map((a, idx) => {
      const link = toAbsoluteUrl(a.slug, a.canonicalUrl)
      const source = a.source?.name ? a.source.name : ''
      const excerpt = a.excerpt ? `${a.excerpt}` : ''
      const border = idx === 0 ? 'none' : '1px solid #1b1b1f'
      const order = String(idx + 1).padStart(2, '0')
      return `
        <tr>
          <td style="padding:3px 0;border-top:${border}">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="padding-left:2px;vertical-align:top;">
                  <a href="${link}" style="color:#f3f4f6;text-decoration:none;font-size:16px;font-weight:600;line-height:1.45;display:block;">${a.title}</a>
                  <div style="margin-top:6px;display:flex;align-items:center;gap:10px;color:#9ca3af;font-size:12px;line-height:1.2;">
                    ${source ? `<span style="display:inline-block;padding:2px 12px;border:1px solid #2a2a2f;border-radius:999px;background:#101012;color:#b5b7bd;font-weight:500;">${source}</span>` : ''}
                    <span style="padding-left:5px;display:inline-block;color:#717179;">${new Date(a.publishedAt || a._updatedAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <a href="${link}" style="margin-left:auto;color:#d4d4d6;font-size:12px;text-decoration:none;font-weight:500;">Read →</a>
                  </div>
                  ${excerpt ? `<p style="margin:4px 0 0;color:#b8b8be;font-size:13px;line-height:1.2;">${excerpt}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      `
    })
    .join('')

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title style="margin:auto">${title}</title>
    </head>
    <body style="margin:0;padding:32px;background:#050505;color:#f9fafb;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;margin:0 auto;background:#0b0b0f;border:1px solid #1a1a1d;border-radius:18px;overflow:hidden;box-shadow:0 20px 45px rgba(0,0,0,0.35);">
              <tr>
                <td style="padding:22px 26px;border-bottom:1px solid #151519;background:linear-gradient(135deg,#101014,#08080a);">
                  <table role="presentation" width="100%" style="border-collapse:collapse;">
                    <tr>
                      <td style="width:25%;text-align:left;vertical-align:middle;">
                      </td>
                      <td style="width:50%;text-align:center;font-size:18px;font-weight:600;color:#f3f4f6;">MyTennisNews</td>
                      <td style="width:25%;text-align:right;font-size:12px;color:#9ca3af;">
                        <span style="display:inline-block;padding:4px 10px;border:1px solid #26262a;border-radius:999px;background:#0f0f12;color:#d1d5db;font-weight:500;">${badgeLabel}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 18px 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                    ${itemBlocks || empty}
                  </table>
                  <div style="margin-top:14px;padding:6px 8px;border:1px solid #1f1f24;border-radius:14px;color:#a3a3aa;font-size:12px;line-height:1.5;background:#0f0f13;">
                    Always read the original sources. © ${new Date().getFullYear()} MyTennisNews
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`
}

export async function buildDigest(period: 'daily' | 'weekly') {
  const items: any[] = await serverClient.fetch(ARTICLES_LIST_PUBLISHED)
  const days = period === 'daily' ? 1 : 7
  let recent = items.filter((a) => isWithinDays(a.publishedAt, days))
  if (!recent.length) {
    const fallback: any[] = await serverClient.fetch(`*[_type == "article" && !(_id in path('drafts.**'))] | order(coalesce(publishedAt, _updatedAt) desc)[0...10]{ _id, title, "slug": slug.current, excerpt, canonicalUrl, publishedAt, source->{name} }`)
    recent = fallback
  }
  const fallbackSubject = period === 'daily' ? 'MyTennisNews - Daily Digest' : 'MyTennisNews - Weekly Digest'
  const primaryHeadline = recent[0]?.title?.trim()
  const subject = primaryHeadline && primaryHeadline.length > 0 ? primaryHeadline : fallbackSubject
  const text = renderText(recent)
  const html = renderHtml(recent, period)
  return { subject, text, html }
}