import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

const seasonQs = (seasonId?: number | null): string =>
  seasonId != null ? `season_id=${seasonId}` : ''

const qs = (...parts: string[]) => parts.filter(Boolean).join('&')

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate', playerIds?: number[], seasonId?: number | null) => {
  const params = qs(`sort_by=${sortBy}`, playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${params}`)
}

export const getAllPartnerships = (playerIds?: number[], seasonId?: number | null) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<Partnership[]>(`/stats/partnerships${params ? '?' + params : ''}`)
}

export const getHeadToHead = (playerAId: number, playerBId: number, playerIds?: number[], seasonId?: number | null) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}${params ? '?' + params : ''}`)
}

export const getHeadToHeadAll = (playerId: number, playerIds?: number[], seasonId?: number | null) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<import('../types').HeadToHeadRecord[]>(`/stats/head-to-head/${playerId}/all${params ? '?' + params : ''}`)
}

export const getMatchupQuality = (playerIds?: number[], seasonId?: number | null) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<import('../types').MatchupQualityEntry[]>(`/stats/matchup-quality${params ? '?' + params : ''}`)
}
