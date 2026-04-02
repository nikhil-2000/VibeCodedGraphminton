import { apiFetch } from './client'
import type { Player, PlayerCreate, PlayerStats, PlayerPartnership } from '../types'

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

export const createPlayer = (data: PlayerCreate) =>
  apiFetch<Player>('/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
