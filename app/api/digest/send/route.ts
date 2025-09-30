import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildDigest } from '@/lib/digest'
import { sendEmailViaResend } from '@/lib/integrations/email/resend'

export async function POST(req: Request) {
  const { period } = await req.json().catch(() => ({})) as { period?: 'daily' | 'weekly' }
  if (period !== 'daily' && period !== 'weekly') {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  const digest = await buildDigest(period)
  const subs = await prisma.subscription.findMany({ where: { status: { in: ['pending', 'active'] } } })
  const to = subs.map((s) => s.email)
  if (!to.length) return NextResponse.json({ ok: true, sent: 0 })
  const canSend = !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
  if (!canSend) return NextResponse.json({ ok: false, error: 'Email not configured' }, { status: 400 })
  await sendEmailViaResend({ to, subject: digest.subject, text: digest.text, html: digest.html })
  return NextResponse.json({ ok: true, sent: to.length })
}
