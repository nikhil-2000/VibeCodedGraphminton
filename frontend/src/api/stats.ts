import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate', playerIds?: number[]) => {
  const base = new URLSearchParams({ sort_by: sortBy }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${base}${filter ? '&' + filter : ''}`)
}

export const getAllPartnerships = (playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<Partnership[]>(`/stats/partnerships${filter ? '?' + filter : ''}`)
}

export const getHeadToHead = (playerAId: number, playerBId: number, playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}${filter ? '?' + filter : ''}`)
}
