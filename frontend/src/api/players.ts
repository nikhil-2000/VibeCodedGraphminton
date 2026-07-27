import { apiFetch } from './client'
import type { Player, PlayerCreate, PlayerStats, PlayerPartnership } from '../types'

export const getPlayers = () =>
  apiFetch<Player[]>('/players')

export const getPlayer = (id: number) =>
  apiFetch<Player>(`/players/${id}`)

export const getPlayerStats = (id: number) =>
  apiFetch<PlayerStats>(`/players/${id}/stats`)

export const getPlayerPartnerships = (id: number) =>
  apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}`)

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
  apiFetch<void>(`/players/${id}`, { method: 'DELETE' })
