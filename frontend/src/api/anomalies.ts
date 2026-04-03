import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[]) => {
  const base = new URLSearchParams({ limit: String(limit) }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?${base}${filter ? '&' + filter : ''}`)
}

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[]) => {
  const base = new URLSearchParams({ limit: String(limit) }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?${base}${filter ? '&' + filter : ''}`)
}
