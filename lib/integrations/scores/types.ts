export type Tour = 'ATP' | 'WTA'
export type MatchStatus = 'live' | 'completed' | 'upcoming'
export type MatchType = 'singles' | 'doubles' | 'mixed'

export type Player = {
  name: string
  country?: string
  profileUrl?: string // Official ATP/WTA profile
}

export type Team = {
  players: Player[] // 1 or 2 players
}

export type Match = {
  id: string
  tour: Tour
  type: MatchType
  status: MatchStatus
  startTime?: string // ISO
  court?: string
  round?: string
  bestOf?: 3 | 5
  teams: [Team, Team]
  score?: {
    sets: Array<{ a: number; b: number; tbA?: number; tbB?: number }>
    retired?: boolean
  }
  tournament: {
    id: string
    name: string
    city?: string
    country?: string
    surface?: 'Hard' | 'Clay' | 'Grass' | 'Carpet'
    category?: string
    startDate?: string
    endDate?: string
    website?: string
    drawsUrl?: string
    tournamentUrl?: string
  }
}

export type ScoresQuery = {
  tour?: Tour | 'ALL'
  status?: 'live' | 'past' | 'ALL'
  day?: string // YYYY-MM-DD
  type?: MatchType | 'ALL'
}

export type ScoresResult = {
  updatedAt: string
  matches: Match[]
}
