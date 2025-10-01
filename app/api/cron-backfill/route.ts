import { NextResponse } from 'next/server'
import { runBackfillCycle } from '@/lib/workflows/backfill-cycle'

export const runtime = 'nodejs'
export const maxDuration = 300

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    throw new Error('CRON_SECRET is not configured')
  }
  const header = request.headers.get('authorization')
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length)
    return token === secret
  }
  const url = new URL(request.url)
  const token = url.searchParams.get('secret')
  return token === secret
}

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

async function handle(request: Request) {
  try {
    if (!authorize(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = new URL(request.url)
    const limit = parsePositiveInt(url.searchParams.get('limit'))
    const concurrency = parsePositiveInt(url.searchParams.get('concurrency'))
    const summary = await runBackfillCycle({ logger: console, limit, concurrency })
    const shouldContinue = Boolean(!summary.timedOut && summary.remaining > 0)
    const shouldTriggerPublish = !summary.timedOut
    return NextResponse.json({ ok: true, summary, shouldContinue, shouldTriggerPublish })
  } catch (error: any) {
    console.error('[api/cron-backfill] failed', error)
    return NextResponse.json({ error: error?.message || 'Cron backfill failed' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
