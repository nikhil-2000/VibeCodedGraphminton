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
  return apiFetch<Game[]>(`/games${qs ? `?${qs}` : ''}`)
}

export const getGame = (id: number) =>
  apiFetch<GameDetail>(`/games/${id}`)
