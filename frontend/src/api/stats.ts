import { apiFetch } from './client'
import type { LeaderboardEntry, PairingsLeaderboardEntry, Partnership, HeadToHead, MatchupQualityEntry, SuggestedGame, HeadToHeadRecord, PairingsFacedEntry, VsPairingsLeaderboardEntry } from '../types'

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate', gameIds?: number[]) => {
  const params = new URLSearchParams({ sort_by: sortBy })
  gameIds?.forEach((id) => params.append('game_ids', String(id)))
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${params}`)
}

export const getAllPartnerships = () =>
  apiFetch<Partnership[]>('/stats/partnerships')

export const getPairingsLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate') =>
  apiFetch<PairingsLeaderboardEntry[]>(`/stats/pairings-leaderboard?sort_by=${sortBy}`)

export const getHeadToHead = (playerAId: number, playerBId: number) =>
  apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}`)

export const getHeadToHeadAll = (playerId: number) =>
  apiFetch<HeadToHeadRecord[]>(`/stats/head-to-head/${playerId}/all`)

export const getPairingsFaced = (playerId: number) =>
  apiFetch<PairingsFacedEntry[]>(`/stats/pairings-faced/${playerId}`)

export const getMatchupQuality = () =>
  apiFetch<MatchupQualityEntry[]>('/stats/matchup-quality')

export const getSuggestedGames = (topN = 5, focusPlayerId?: number) => {
  const params = new URLSearchParams({ top_n: String(topN) })
  if (focusPlayerId != null) params.set('focus_player_id', String(focusPlayerId))
  return apiFetch<SuggestedGame[]>(`/stats/suggested-games?${params}`)
}

export const getVsPairingsLeaderboard = (pairPlayerIds: number[], sortBy: 'games_faced' | 'win_rate' = 'games_faced') => {
  const params = new URLSearchParams({ sort_by: sortBy })
  pairPlayerIds.forEach((id) => params.append('pair_player_ids', String(id)))
  return apiFetch<VsPairingsLeaderboardEntry[]>(`/stats/vs-pairings-leaderboard?${params}`)
}
