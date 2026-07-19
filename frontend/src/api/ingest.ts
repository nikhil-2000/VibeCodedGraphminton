import { apiFetch } from './client'
import type { IngestResult } from '../types'

export const postScores = (files: string[]) =>
  apiFetch<IngestResult>('/ingest/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })

export interface GameRowIn {
  team_a: [number, number]
  score_a: number
  team_b: [number, number]
  score_b: number
}

export interface IngestGamesRequest {
  played_on: string
  games: GameRowIn[]
}

export interface GameRowError {
  row: number
  errors: string[]
}

export const ingestGames = (data: IngestGamesRequest) =>
  apiFetch<{ games_loaded: number }>('/ingest/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const validateGames = (data: IngestGamesRequest) =>
  apiFetch<{ errors: GameRowError[] }>('/ingest/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
