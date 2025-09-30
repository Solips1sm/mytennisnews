import type { ScoresProvider } from '..'
import type { Match, MatchStatus, MatchType, Player, ScoresQuery, ScoresResult, Team, Tour } from '../types'

const ATP_BASE = 'https://www.atptour.com'
const WTA_BASE = 'https://www.wtatennis.com'

function guessTour(val?: string): Tour {
  const s = (val || '').toUpperCase()
  if (s.includes('WTA')) return 'WTA'
  return 'ATP'
}

function atpPlayer(name: string, country?: string): Player {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  return { name, country, profileUrl: `${ATP_BASE}/en/players/${slug}/overview` }
}
function wtaPlayer(name: string, country?: string): Player {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  return { name, country, profileUrl: `${WTA_BASE}/players/${slug}` }
}
function mkPlayer(tour: Tour, name: string, country?: string): Player {
  return tour === 'ATP' ? atpPlayer(name, country) : wtaPlayer(name, country)
}

function toTeam(tour: Tour, raw: any): Team {
  const players: Player[] = []
  const push = (n?: any) => {
    const name = typeof n === 'string' ? n : n?.name || n?.fullName
    if (name) players.push(mkPlayer(tour, name, n?.country || n?.nationality))
  }
  if (Array.isArray(raw?.players)) raw.players.forEach(push)
  else if (raw?.player1 || raw?.player2) { push(raw.player1); push(raw.player2) }
  else if (typeof raw === 'string') { push(raw) }
  return { players: players.length ? players : [mkPlayer(tour, 'TBD')] }
}

export function toMatch(raw: any): Match | null {
  const tour = guessTour(raw?.tour || raw?.category || raw?.circuit)
  const type: MatchType = (raw?.type?.toLowerCase?.() as MatchType) || (raw?.isDoubles ? 'doubles' : 'singles')
  const startTime = raw?.startTime || raw?.scheduled || raw?.start_time || undefined
  const statusRaw = (raw?.status || '').toString().toLowerCase()
  let status: MatchStatus = 'upcoming'
  if (raw?.live === true || statusRaw.includes('live') || statusRaw === 'in_progress') status = 'live'
  else if (raw?.completed === true || statusRaw.includes('final') || statusRaw.includes('completed')) status = 'completed'
  const round = raw?.round || raw?.stage || undefined
  const bestOf = (raw?.bestOf as 3 | 5) || (raw?.bo5 ? 5 : (raw?.bo3 ? 3 : undefined))

  const tournament = {
    id: String(raw?.tournamentId || raw?.tournament_id || raw?.eventId || raw?.event_id || raw?.tournament?.id || `${tour}-${round || 'event'}`),
    name: raw?.tournament?.name || raw?.eventName || raw?.event || raw?.name || 'Tournament',
    city: raw?.tournament?.city || raw?.city,
    country: raw?.tournament?.country || raw?.country,
    surface: raw?.surface,
    category: raw?.tournament?.category || raw?.category || tour,
    startDate: raw?.tournament?.startDate || raw?.start_date,
    endDate: raw?.tournament?.endDate || raw?.end_date,
    website: raw?.tournament?.website,
    drawsUrl: raw?.tournament?.drawsUrl || raw?.drawsUrl,
    tournamentUrl: raw?.tournament?.url || raw?.tournamentUrl,
  }

  const sides = raw?.teams || raw?.sides || [raw?.home, raw?.away]
  let a = sides?.[0]
  let b = sides?.[1]
  if (!a && raw?.homeTeam) a = raw.homeTeam
  if (!b && raw?.awayTeam) b = raw.awayTeam
  const teams: [Team, Team] = [toTeam(tour, a), toTeam(tour, b)]

  const setsRaw = raw?.score?.sets || raw?.sets || raw?.scoreline
  let sets: Array<{ a: number; b: number; tbA?: number; tbB?: number }> = []
  if (Array.isArray(setsRaw)) {
    sets = setsRaw.map((s: any) => ({ a: Number(s.a ?? s.home ?? s.team1 ?? s[0] ?? 0), b: Number(s.b ?? s.away ?? s.team2 ?? s[1] ?? 0), tbA: s.tbA ?? s.tba ?? s.tiebreakHome, tbB: s.tbB ?? s.tbb ?? s.tiebreakAway }))
  }

  return {
    id: String(raw?.id || raw?.matchId || raw?.match_id || `${tournament.id}-${startTime || ''}`),
    tour,
    type,
    status,
    startTime,
    round,
    bestOf: bestOf as any,
    teams,
    score: sets.length ? { sets } : undefined,
    tournament,
  }
}

export class JsonScoresProvider implements ScoresProvider {
  readonly name = 'json'
  async fetchScores(query: ScoresQuery): Promise<ScoresResult> {
    const url = process.env.SCORES_JSON_URL
    if (!url) {
      return { updatedAt: new Date().toISOString(), matches: [] }
    }
    const headers: Record<string, string> = {}
    if (process.env.SCORES_JSON_HEADERS) {
      try {
        Object.assign(headers, JSON.parse(process.env.SCORES_JSON_HEADERS))
      } catch {
        // ignore bad header JSON
      }
    }
    const res = await fetch(url, { headers, cache: 'no-store' })
    const body = await res.json()
    const rawMatches: any[] = Array.isArray(body) ? body : Array.isArray(body?.matches) ? body.matches : []
    let matches = rawMatches.map(toMatch).filter(Boolean) as Match[]
    // Filter by incoming query
    if (query.tour && query.tour !== 'ALL') matches = matches.filter((m) => m.tour === query.tour)
    if (query.type && query.type !== 'ALL') matches = matches.filter((m) => m.type === query.type)
    if (query.status) {
      if (query.status === 'live') matches = matches.filter((m) => m.status === 'live')
      else if (query.status === 'past') matches = matches.filter((m) => m.status !== 'live')
    }
    if (query.day) {
      matches = matches.filter((m) => (m.startTime || '').slice(0, 10) === query.day)
    }
    return { updatedAt: new Date().toISOString(), matches }
  }
}
