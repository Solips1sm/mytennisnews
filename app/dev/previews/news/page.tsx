import { buildDigest } from '@/lib/digest'
import { Button } from '@/ui/button'
import { prisma } from '@/lib/prisma'
import { sendEmailViaResend } from '@/lib/integrations/email/resend'

export const revalidate = 0

export default async function DigestPreviewPage() {
  const allowed = process.env.NEXT_PUBLIC_PREVIEW_MODE === 'true'
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Previews disabled</h1>
        <p className="text-muted-foreground">Set NEXT_PUBLIC_PREVIEW_MODE=true to enable.</p>
      </div>
    )
  }
  const daily = await buildDigest('daily')
  const weekly = await buildDigest('weekly')

  async function sendDaily() {
    'use server'
    const { subject, text, html } = await buildDigest('daily')
    const subs = await prisma.subscription.findMany({ where: { status: { in: ['pending', 'active'] } } })
    if (!subs.length) return
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return
    await sendEmailViaResend({ to: subs.map(s => s.email), subject, text, html })
  }

  async function sendWeekly() {
    'use server'
    const { subject, text, html } = await buildDigest('weekly')
    const subs = await prisma.subscription.findMany({ where: { status: { in: ['pending', 'active'] } } })
    if (!subs.length) return
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return
    await sendEmailViaResend({ to: subs.map(s => s.email), subject, text, html })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Digest Previews</h1>
        <p className="text-sm text-muted-foreground">/dev/previews/news</p>
      </div>

      <section className="rounded-lg border">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold">Daily Digest</h2>
            <p className="text-sm text-muted-foreground">Preview of the email HTML body</p>
          </div>
          <form action={sendDaily}>
            <Button type="submit" size="sm">Send Daily</Button>
          </form>
        </div>
        <div className="p-4">
          <iframe title="daily" className="h-[480px] w-full rounded border" srcDoc={daily.html} />
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="font-semibold">Weekly Digest</h2>
            <p className="text-sm text-muted-foreground">Preview of the email HTML body</p>
          </div>
          <form action={sendWeekly}>
            <Button type="submit" size="sm">Send Weekly</Button>
          </form>
        </div>
        <div className="p-4">
          <iframe title="weekly" className="h-[480px] w-full rounded border" srcDoc={weekly.html} />
        </div>
      </section>
    </div>
  )
}
