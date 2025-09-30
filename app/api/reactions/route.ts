import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const getSchema = z.object({ articleId: z.string().min(1) })
const postSchema = z.object({ articleId: z.string().min(1), type: z.enum(['like', 'dislike']) })

function getSession(req: NextRequest) {
  return req.cookies.get('sid')?.value
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const articleId = searchParams.get('articleId') || ''
  const parse = getSchema.safeParse({ articleId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid articleId' }, { status: 400 })

  const [likeRow, dislikeRow] = await Promise.all([
    prisma.articleReaction.findUnique({ where: { articleId_type: { articleId, type: 'like' } } }),
    prisma.articleReaction.findUnique({ where: { articleId_type: { articleId, type: 'dislike' } } }),
  ])

  // Determine user's selection for this session if exists
  let sid = getSession(req)
  let selected: 'like' | 'dislike' | null = null
  if (!sid) sid = randomUUID()
  const evt = await prisma.articleReactionEvent.findUnique({ where: { articleId_sessionId: { articleId, sessionId: sid } } }).catch(() => null)
  if (evt && (evt.type === 'like' || evt.type === 'dislike')) selected = evt.type

  const res = NextResponse.json({ like: likeRow?.count || 0, dislike: dislikeRow?.count || 0, selected })
  // Ensure session cookie is set for future enforcement
  if (sid && !req.cookies.get('sid')) {
    res.cookies.set('sid', sid, { httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  }
  return res
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const parse = postSchema.safeParse(body)
  if (!parse.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const { articleId, type } = parse.data

  let sid = getSession(req)
  const newSid = !sid
  if (!sid) sid = randomUUID()

  // Find previous event for this session and article
  const prev = await prisma.articleReactionEvent.findUnique({ where: { articleId_sessionId: { articleId, sessionId: sid } } })

  // If switching (like->dislike or vice versa), decrement previous and increment new.
  if (prev && prev.type !== type) {
    await prisma.$transaction([
      prisma.articleReaction.updateMany({
        where: { articleId, type: prev.type as 'like' | 'dislike', count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      }),
      prisma.articleReaction.upsert({
        where: { articleId_type: { articleId, type } },
        create: { articleId, type, count: 1 },
        update: { count: { increment: 1 } },
      }),
      prisma.articleReactionEvent.update({ where: { articleId_sessionId: { articleId, sessionId: sid } }, data: { type } }),
    ])
  } else if (!prev) {
    // First reaction for this session
    await prisma.$transaction([
      prisma.articleReaction.upsert({
        where: { articleId_type: { articleId, type } },
        create: { articleId, type, count: 1 },
        update: { count: { increment: 1 } },
      }),
      prisma.articleReactionEvent.create({ data: { articleId, sessionId: sid, type } }),
    ])
  } else if (prev && prev.type === type) {
    // Toggle off: decrement current and remove the event
    await prisma.$transaction([
      prisma.articleReaction.updateMany({
        where: { articleId, type: prev.type as 'like' | 'dislike', count: { gt: 0 } },
        data: { count: { decrement: 1 } },
      }),
      prisma.articleReactionEvent.delete({ where: { articleId_sessionId: { articleId, sessionId: sid } } }),
    ])
  }

  const [likeRow, dislikeRow] = await Promise.all([
    prisma.articleReaction.findUnique({ where: { articleId_type: { articleId, type: 'like' } } }),
    prisma.articleReaction.findUnique({ where: { articleId_type: { articleId, type: 'dislike' } } }),
  ])
  const response = NextResponse.json({ ok: true, like: likeRow?.count || 0, dislike: dislikeRow?.count || 0 })
  if (newSid) response.cookies.set('sid', sid, { httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  return response
}
