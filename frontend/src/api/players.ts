import { apiFetch } from './client'
import type { Player, PlayerCreate, PlayerStats, PlayerPartnership } from '../types'

export const getPlayers = () =>
  apiFetch<Player[]>('/players')

export const getPlayer = (id: number) =>
  apiFetch<Player>(`/players/${id}`)

export const getPlayerStats = (id: number, playerIds?: number[], seasonId?: number | null) => {
  const params = new URLSearchParams()
  playerIds?.forEach((pid) => params.append('player_ids', String(pid)))
  if (seasonId != null) params.set('season_id', String(seasonId))
  const qs = params.toString()
  return apiFetch<PlayerStats>(`/players/${id}/stats${qs ? `?${qs}` : ''}`)
}

export const getPlayerPartnerships = (id: number, playerIds?: number[], seasonId?: number | null) => {
  const params = new URLSearchParams()
  playerIds?.forEach((pid) => params.append('player_ids', String(pid)))
  if (seasonId != null) params.set('season_id', String(seasonId))
  const qs = params.toString()
  return apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}${qs ? `?${qs}` : ''}`)
}

export const createPlayer = (data: PlayerCreate) =>
  apiFetch<Player>('/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const updatePlayer = (id: number, data: { is_sub?: boolean | null; add_aliases?: string[]; remove_aliases?: string[] }) =>
  apiFetch<Player>(`/players/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const deletePlayer = (id: number): Promise<void> =>
  fetch(`/players/${id}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok)
      return res.json()
        .then((b) => { throw new Error(b.detail ?? `HTTP ${res.status}`) })
        .catch((e) => { throw e instanceof Error ? e : new Error(`HTTP ${res.status}`) })
  })
