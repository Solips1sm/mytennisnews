import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const SubscribeSchema = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}))
    const parsed = SubscribeSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    const email = parsed.data.email.toLowerCase()

    const existing = await prisma.subscription.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ ok: true, status: existing.status })
    }

    await prisma.subscription.create({ data: { email, status: 'pending' } })
    return NextResponse.json({ ok: true, status: 'pending' })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
