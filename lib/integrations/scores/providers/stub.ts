import type { ScoresProvider } from '..'
import type { Match, MatchStatus, MatchType, Player, ScoresQuery, ScoresResult, Team, Tour } from '../types'

const ATP_BASE = 'https://www.atptour.com'
const WTA_BASE = 'https://www.wtatennis.com'

function atpPlayer(name: string, country?: string): Player {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  return { name, country, profileUrl: `${ATP_BASE}/en/players/${slug}/overview` }
}
function wtaPlayer(name: string, country?: string): Player {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-')
  return { name, country, profileUrl: `${WTA_BASE}/players/${slug}` }
}

function teamOf(tour: Tour, names: string[], country?: string): Team {
  const players: Player[] = names.map((n) => (tour === 'ATP' ? atpPlayer(n, country) : wtaPlayer(n, country)))
  return { players }
}

function demoMatches(day?: string): Match[] {
  const today = day || new Date().toISOString().slice(0, 10)
  const tStart = `${today}T10:00:00Z`
  return [
    {
      id: 'm-atp-1',
      tour: 'ATP',
      type: 'singles',
      status: 'live',
      startTime: tStart,
      round: 'R16',
      bestOf: 3,
      court: 'Centre Court',
      teams: [teamOf('ATP', ['Novak Djokovic',], 'SRB'), teamOf('ATP', ['Carlos Alcaraz'], 'ESP')],
      score: { sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 2, b: 1 } ] },
      tournament: {
        id: 't-atp-1000',
        name: 'ATP Masters 1000 Demo',
        city: 'Paris',
        country: 'FRA',
        surface: 'Hard',
        category: 'ATP Masters 1000',
        startDate: today,
        endDate: today,
        website: `${ATP_BASE}`,
        drawsUrl: `${ATP_BASE}/en/tournaments`,
        tournamentUrl: `${ATP_BASE}/en/tournaments`,
      },
    },
    {
      id: 'm-wta-1',
      tour: 'WTA',
      type: 'doubles',
      status: 'upcoming',
      startTime: `${today}T12:30:00Z`,
      round: 'QF',
      bestOf: 3,
      court: 'Court 1',
      teams: [teamOf('WTA', ['Iga Swiatek', 'Aryna Sabalenka'], 'POL'), teamOf('WTA', ['Coco Gauff', 'Jessica Pegula'], 'USA')],
      tournament: {
        id: 't-wta-500',
        name: 'WTA 500 Demo',
        city: 'Berlin',
        country: 'GER',
        surface: 'Grass',
        category: 'WTA 500',
        startDate: today,
        endDate: today,
        website: `${WTA_BASE}`,
        drawsUrl: `${WTA_BASE}/tournaments`,
        tournamentUrl: `${WTA_BASE}/tournaments`,
      },
    },
    {
      id: 'm-atp-2',
      tour: 'ATP',
      type: 'mixed',
      status: 'completed',
      startTime: `${today}T08:00:00Z`,
      round: 'SF',
      bestOf: 3,
      teams: [teamOf('ATP', ['Rafael Nadal', 'Paula Badosa'], 'ESP'), teamOf('ATP', ['Andy Murray', 'Emma Raducanu'], 'GBR')],
      score: { sets: [{ a: 7, b: 6, tbA: 7, tbB: 3 }, { a: 6, b: 3 }] },
      tournament: {
        id: 't-mixed-exhib',
        name: 'Mixed Exhibition',
        city: 'London',
        country: 'GBR',
        surface: 'Hard',
        category: 'Exhibition',
        startDate: today,
        endDate: today,
        website: `${ATP_BASE}`,
        drawsUrl: `${ATP_BASE}/en/scores/current`,
        tournamentUrl: `${ATP_BASE}/en/scores/current`,
      },
    },
  ]
}

export class StubScoresProvider implements ScoresProvider {
  readonly name = 'stub'
  async fetchScores(query: ScoresQuery): Promise<ScoresResult> {
    let matches = demoMatches(query.day)
    if (query.tour && query.tour !== 'ALL') {
      matches = matches.filter((m) => m.tour === query.tour)
    }
    if (query.status && query.status !== 'ALL') {
      matches = matches.filter((m) => m.status === query.status)
    }
    if (query.type && query.type !== 'ALL') {
      matches = matches.filter((m) => m.type === query.type)
    }
    return { updatedAt: new Date().toISOString(), matches }
  }
}
