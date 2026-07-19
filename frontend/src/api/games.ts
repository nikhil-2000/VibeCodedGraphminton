import { apiFetch } from './client'
import type { Game, GameDetail } from '../types'

export interface GamesFilter {
  week?: number
  player_id?: number
  team?: string
  vs?: string
  season_id?: number | null
}

export const getGames = (filter: GamesFilter = {}) => {
  const params = new URLSearchParams()
  if (filter.week !== undefined) params.set('week', String(filter.week))
  if (filter.player_id !== undefined) params.set('player_id', String(filter.player_id))
  if (filter.team) params.set('team', filter.team)
  if (filter.vs) params.set('vs', filter.vs)
  if (filter.season_id != null) params.set('season_id', String(filter.season_id))
  const qs = params.toString()
  return apiFetch<GameDetail[]>(`/games${qs ? `?${qs}` : ''}`)
}

export const getGame = (id: number) =>
  apiFetch<GameDetail>(`/games/${id}`)

export const deleteGame = (id: number) =>
  apiFetch<void>(`/games/${id}`, { method: 'DELETE' })

export const deleteSession = (playedOn: string) =>
  apiFetch<{ deleted: number }>(`/games/session/${playedOn}`, { method: 'DELETE' })

export interface GamePrediction {
  expected_score_a: number
  expected_score_b: number
  expected_winner: 'A' | 'B'
  actual_winner: 'A' | 'B'
  upset: boolean
}

export const getGamePrediction = (id: number) =>
  apiFetch<GamePrediction>(`/games/${id}/prediction`)
