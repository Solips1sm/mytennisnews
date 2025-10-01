import { NextResponse } from 'next/server'
import { runIngestCycle } from '@/lib/workflows/ingest-cycle'

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

async function handle(request: Request) {
  try {
    if (!authorize(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const summary = await runIngestCycle({ logger: console })
    const shouldTriggerBackfill = Boolean(!summary.timedOut && summary.hasNewContent)
    return NextResponse.json({ ok: true, summary, shouldTriggerBackfill })
  } catch (error: any) {
    console.error('[api/cron-ingest] failed', error)
    return NextResponse.json({ error: error?.message || 'Cron ingest failed' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
