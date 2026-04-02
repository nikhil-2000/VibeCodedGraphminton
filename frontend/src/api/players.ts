import { apiFetch } from './client'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export const getPlayers = (isSub?: boolean) => {
  const params = new URLSearchParams()
  if (isSub !== undefined) params.set('is_sub', String(isSub))
  const qs = params.toString()
  return apiFetch<Player[]>(`/players${qs ? `?${qs}` : ''}`)
}

export const getPlayer = (id: number) =>
  apiFetch<Player>(`/players/${id}`)

export const getPlayerStats = (id: number) =>
  apiFetch<PlayerStats>(`/stats/player/${id}`)

export const getPlayerPartnerships = (id: number) =>
  apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}`)
