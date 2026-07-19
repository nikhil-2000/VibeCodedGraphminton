import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSeasons } from '../api/seasons'
import type { Season } from '../types'

interface SeasonFilterContextValue {
  seasons: Season[]
  selectedSeasonId: number | null
  setSelectedSeasonId: (id: number | null) => void
}

const SeasonFilterContext = createContext<SeasonFilterContextValue | null>(null)

export function SeasonFilterProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)

  useEffect(() => {
    getSeasons().then(setSeasons)
  }, [])

  return (
    <SeasonFilterContext.Provider value={{ seasons, selectedSeasonId, setSelectedSeasonId }}>
      {children}
    </SeasonFilterContext.Provider>
  )
}

export function useSeasonFilter() {
  const ctx = useContext(SeasonFilterContext)
  if (!ctx) throw new Error('useSeasonFilter must be used inside SeasonFilterProvider')
  return ctx
}
