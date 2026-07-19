import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getPlayers } from '../api/players'
import type { Player } from '../types'

type Preset = 'everyone' | 'regulars' | 'custom'

interface PlayerFilterContextValue {
  allPlayers: Player[]
  selectedIds: number[]
  setSelectedIds: (ids: number[]) => void
  activePreset: Preset
  setPreset: (preset: 'everyone' | 'regulars') => void
  reloadPlayers: () => void
}

const PlayerFilterContext = createContext<PlayerFilterContextValue | null>(null)

function regularIds(players: Player[]): number[] {
  return players.filter((p) => !p.is_sub).map((p) => p.id)
}

export function PlayerFilterProvider({ children }: { children: ReactNode }) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedIds, setSelectedIdsRaw] = useState<number[]>([])
  const [activePreset, setActivePreset] = useState<Preset>('regulars')

  const reloadPlayers = () => {
    getPlayers().then((players) => {
      setAllPlayers(players)
      setSelectedIdsRaw(regularIds(players))
    })
  }

  useEffect(() => { reloadPlayers() }, [])

  const setSelectedIds = (ids: number[]) => {
    setSelectedIdsRaw(ids)
    const allIds = allPlayers.map((p) => p.id)
    const regIds = regularIds(allPlayers)
    const sorted = [...ids].sort((a, b) => a - b)
    const isAll = sorted.join() === [...allIds].sort((a, b) => a - b).join()
    const isRegulars = sorted.join() === [...regIds].sort((a, b) => a - b).join()
    setActivePreset(isAll ? 'everyone' : isRegulars ? 'regulars' : 'custom')
  }

  const setPreset = (preset: 'everyone' | 'regulars') => {
    const ids = preset === 'everyone'
      ? allPlayers.map((p) => p.id)
      : regularIds(allPlayers)
    setSelectedIdsRaw(ids)
    setActivePreset(preset)
  }

  return (
    <PlayerFilterContext.Provider value={{ allPlayers, selectedIds, setSelectedIds, activePreset, setPreset, reloadPlayers }}>
      {children}
    </PlayerFilterContext.Provider>
  )
}

export function usePlayerFilter() {
  const ctx = useContext(PlayerFilterContext)
  if (!ctx) throw new Error('usePlayerFilter must be used inside PlayerFilterProvider')
  return ctx
}
