import type { ScoresQuery, ScoresResult } from './types'

export interface ScoresProvider {
  readonly name: string
  fetchScores(query: ScoresQuery): Promise<ScoresResult>
}

let _provider: ScoresProvider | null = null

export function getScoresProvider(): ScoresProvider {
  if (_provider) return _provider
  if (process.env.SCORES_JSON_URL) {
    const modJson = require('./providers/json') as typeof import('./providers/json')
    _provider = new modJson.JsonScoresProvider()
  } else {
    const mod = require('./providers/stub') as typeof import('./providers/stub')
    _provider = new mod.StubScoresProvider()
  }
  return _provider as ScoresProvider
}

export async function fetchScores(query: ScoresQuery): Promise<ScoresResult> {
  const provider = getScoresProvider()
  return provider.fetchScores(query)
}
