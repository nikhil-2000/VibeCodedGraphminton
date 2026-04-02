import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead } from '../types'

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate') => {
  const params = new URLSearchParams({ sort_by: sortBy })
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${params.toString()}`)
}

export const getAllPartnerships = () =>
  apiFetch<Partnership[]>('/stats/partnerships')

export const getHeadToHead = (playerAId: number, playerBId: number) =>
  apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}`)
