import { prisma } from '@/lib/prisma'
import { serverClient } from '@/lib/sanity'
import { ARTICLES_LIST_PUBLISHED } from '@/lib/queries'
import { sendEmailViaResend } from '@/lib/integrations/email/resend'

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
  const list = items
    .map((a) => {
      const link = toAbsoluteUrl(a.slug, a.canonicalUrl)
      const source = a.source?.name ? `&nbsp;&middot;&nbsp;${a.source.name}` : ''
      const excerpt = a.excerpt ? `<p style="margin:4px 0 0;color:#666;line-height:1.4">${a.excerpt}</p>` : ''
      return `<li style="margin:12px 0"><a href="${link}" style="color:#0ea5e9;text-decoration:none;font-weight:600">${a.title}</a><span style="color:#888">${source}</span>${excerpt}</li>`
    })
    .join('')
  const empty = '<li style="color:#666">No new articles.</li>'
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;background:#0b0b0b;color:#e5e7eb"><div style="max-width:640px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:12px;overflow:hidden"><div style="padding:16px 20px;border-bottom:1px solid #1f2937;display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:8px;height:8px;background:#0ea5e9;border-radius:9999px"></span><span style="font-weight:700">MyTennisNews</span><span style="margin-left:auto;color:#9ca3af;font-size:12px">${period === 'daily' ? 'Daily' : 'Weekly'}</span></div><div style="padding:20px"><h1 style="margin:0 0 8px;font-size:18px">${title}</h1><ul style="list-style:disc;padding-left:18px;margin:12px 0">${list || empty}</ul><p style="margin-top:20px;color:#6b7280;font-size:12px">Always read original sources. © ${new Date().getFullYear()} MyTennisNews.</p></div></div></body></html>`
}

async function buildDigest(period: 'daily' | 'weekly') {
  const items: any[] = await serverClient.fetch(ARTICLES_LIST_PUBLISHED)
  const days = period === 'daily' ? 1 : 7
  let recent = items.filter((a) => isWithinDays(a.publishedAt, days))
  if (!recent.length) {
    // Fallback: fetch top 10 latest published if none within the period
    const fallback: any[] = await serverClient.fetch(`*[_type == "article" && !(_id in path('drafts.**'))] | order(coalesce(publishedAt, _updatedAt) desc)[0...10]{ _id, title, "slug": slug.current, excerpt, canonicalUrl, publishedAt, source->{name} }`)
    recent = fallback
  }
  const subject = period === 'daily' ? 'MyTennisNews - Daily Digest' : 'MyTennisNews - Weekly Digest'
  const text = renderText(recent)
  const html = renderHtml(recent, period)
  return { subject, text, html }
}

async function main() {
  const period = (process.argv[2] as 'daily' | 'weekly') || 'daily'
  const digest = await buildDigest(period)
  const subs = await prisma.subscription.findMany({ where: { status: { in: ['pending', 'active'] } } })
  const to = subs.map((s) => s.email)
  const canSend = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
  if (!to.length) {
    console.log('No subscribers to send to.')
    return
  }
  if (canSend) {
    console.log(`Sending ${period} digest via Resend to ${to.length} subscribers...`)
    await sendEmailViaResend({ to, subject: digest.subject, text: digest.text, html: digest.html })
    console.log('Done.')
  } else {
    // Fallback: emit to console when email isn’t configured
    console.log(`[DRY RUN] ${period} digest to ${to.length} subscribers`)
    console.log('---')
    console.log(digest.subject)
    console.log('')
    console.log(digest.text)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})