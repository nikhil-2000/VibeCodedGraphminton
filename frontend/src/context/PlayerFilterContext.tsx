import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getPlayers } from '../api/players'
import type { Player } from '../types'

interface PlayerFilterContextValue {
  allPlayers: Player[]
  selectedIds: number[]
  setSelectedIds: (ids: number[]) => void
}

const PlayerFilterContext = createContext<PlayerFilterContextValue | null>(null)

export function PlayerFilterProvider({ children }: { children: ReactNode }) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  useEffect(() => {
    getPlayers().then((players) => {
      setAllPlayers(players)
      setSelectedIds(players.map((p) => p.id))
    })
  }, [])

  return (
    <PlayerFilterContext.Provider value={{ allPlayers, selectedIds, setSelectedIds }}>
      {children}
    </PlayerFilterContext.Provider>
  )
}

export function usePlayerFilter() {
  const ctx = useContext(PlayerFilterContext)
  if (!ctx) throw new Error('usePlayerFilter must be used inside PlayerFilterProvider')
  return ctx
}
