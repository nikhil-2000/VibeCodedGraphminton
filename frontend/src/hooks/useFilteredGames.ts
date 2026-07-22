import { useState, useEffect } from 'react'
import { getGames, type GamesFilter } from '../api/games'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import type { GameDetail } from '../types'

export function useFilteredGames(extraFilter: Omit<GamesFilter, 'player_ids' | 'season_id'> = {}) {
  const { selectedIds } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const [games, setGames] = useState<GameDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filterKey = JSON.stringify(extraFilter)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getGames({ ...extraFilter, player_ids: selectedIds, season_id: selectedSeasonId })
      .then(setGames)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedIds, selectedSeasonId, filterKey])

  return { games, setGames, loading, error }
}
