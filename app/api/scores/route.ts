import { NextRequest, NextResponse } from 'next/server'
import { fetchScores } from '@/lib/integrations/scores'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tour = (searchParams.get('tour') || 'ALL') as any
  const status = (searchParams.get('status') || 'live') as any
  const day = searchParams.get('day') || undefined
  const type = (searchParams.get('type') || 'ALL') as any

  // Try local cache written by scripts/poll-scores.ts
  const cachePath = path.join(process.cwd(), '.next', 'cache', 'scores.json')
  try {
    const content = await fs.readFile(cachePath, 'utf8')
    const cached = JSON.parse(content)
    const refs = {
      ATP: 'https://www.atptour.com/en/scores/current',
      WTA: 'https://www.wtatennis.com/scores',
    }
    return NextResponse.json({ ...cached, refs })
  } catch {}

  const data = await fetchScores({ tour, status, day, type })
  const refs = {
    ATP: 'https://www.atptour.com/en/scores/current',
    WTA: 'https://www.wtatennis.com/scores',
  }
  return NextResponse.json({ ...data, refs })
}
