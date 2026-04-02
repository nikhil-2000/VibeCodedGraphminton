import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead } from '../types'

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate') =>
  apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?sort_by=${sortBy}`)

export const getAllPartnerships = () =>
  apiFetch<Partnership[]>('/stats/partnerships')

export const getHeadToHead = (playerAId: number, playerBId: number) =>
  apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}`)
