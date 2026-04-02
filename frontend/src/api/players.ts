import { apiFetch } from './client'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export const getPlayers = (isSub?: boolean) =>
  apiFetch<Player[]>(`/players${isSub !== undefined ? `?is_sub=${isSub}` : ''}`)

export const getPlayer = (id: number) =>
  apiFetch<Player>(`/players/${id}`)

export const getPlayerStats = (id: number) =>
  apiFetch<PlayerStats>(`/stats/player/${id}`)

export const getPlayerPartnerships = (id: number) =>
  apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}`)
