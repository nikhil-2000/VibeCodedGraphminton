import { useState, useEffect } from 'react'
import { getGames, type GamesFilter } from '../api/games'
import type { GameDetail } from '../types'

export function useFilteredGames(extraFilter: GamesFilter = {}) {
  const [games, setGames] = useState<GameDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filterKey = JSON.stringify(extraFilter)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getGames(extraFilter)
      .then(setGames)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [filterKey])

  return { games, setGames, loading, error }
}
