import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getSeasons } from '../api/seasons'
import type { UserPreferences } from '../api/preferences'
import type { Season } from '../types'

interface SeasonFilterContextValue {
  seasons: Season[]
  selectedSeasonId: number | null
  setSelectedSeasonId: (id: number | null) => void
  initFromPrefs: (prefs: UserPreferences) => void
}

const SeasonFilterContext = createContext<SeasonFilterContextValue | null>(null)

export function SeasonFilterProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)

  useEffect(() => {
    getSeasons().then((data) => {
      setSeasons(data)
      if (data.length > 0) {
        setSelectedSeasonId(data[data.length - 1].id)
      }
    })
  }, [])

  const initFromPrefs = (prefs: UserPreferences) => {
    setSelectedSeasonId(prefs.season_id)
  }

  return (
    <SeasonFilterContext.Provider value={{ seasons, selectedSeasonId, setSelectedSeasonId, initFromPrefs }}>
      {children}
    </SeasonFilterContext.Provider>
  )
}

export function useSeasonFilter() {
  const ctx = useContext(SeasonFilterContext)
  if (!ctx) throw new Error('useSeasonFilter must be used inside SeasonFilterProvider')
  return ctx
}
