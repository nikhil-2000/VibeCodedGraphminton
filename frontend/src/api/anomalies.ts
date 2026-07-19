import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

const seasonQs = (seasonId?: number | null): string =>
  seasonId != null ? `season_id=${seasonId}` : ''

const qs = (...parts: string[]) => parts.filter(Boolean).join('&')

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[], seasonId?: number | null) => {
  const params = qs(`limit=${limit}`, playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?${params}`)
}

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[], seasonId?: number | null) => {
  const params = qs(`limit=${limit}`, playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?${params}`)
}

export const getPartnershipAnomaliesForPlayer = (
  playerId: number,
  type: 'overplayed' | 'underplayed',
  playerIds?: number[],
  seasonId?: number | null,
) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}/${playerId}${params ? '?' + params : ''}`)
}

export const getHeadToHeadAnomaliesForPlayer = (
  playerId: number,
  type: 'overplayed' | 'underplayed',
  playerIds?: number[],
  seasonId?: number | null,
) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}/${playerId}${params ? '?' + params : ''}`)
}
