import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead, MatchupQualityEntry, SuggestedGame, HeadToHeadRecord } from '../types'

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate', gameIds?: number[]) => {
  const params = new URLSearchParams({ sort_by: sortBy })
  gameIds?.forEach((id) => params.append('game_ids', String(id)))
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${params}`)
}

export const getAllPartnerships = () =>
  apiFetch<Partnership[]>('/stats/partnerships')

export const getHeadToHead = (playerAId: number, playerBId: number) =>
  apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}`)

export const getHeadToHeadAll = (playerId: number) =>
  apiFetch<HeadToHeadRecord[]>(`/stats/head-to-head/${playerId}/all`)

export const getMatchupQuality = () =>
  apiFetch<MatchupQualityEntry[]>('/stats/matchup-quality')

export const getSuggestedGames = (topN = 5, focusPlayerId?: number) => {
  const params = new URLSearchParams({ top_n: String(topN) })
  if (focusPlayerId != null) params.set('focus_player_id', String(focusPlayerId))
  return apiFetch<SuggestedGame[]>(`/stats/suggested-games?${params}`)
}
