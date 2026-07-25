import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { getPlayers } from '../api/players'
import type { UserPreferences } from '../api/preferences'
import type { Player } from '../types'

type Preset = 'everyone' | 'regulars' | 'custom'

interface PlayerFilterContextValue {
  allPlayers: Player[]
  selectedIds: number[]
  setSelectedIds: (ids: number[]) => void
  activePreset: Preset
  setPreset: (preset: 'everyone' | 'regulars') => void
  reloadPlayers: () => void
  initFromPrefs: (prefs: UserPreferences) => void
}

const PlayerFilterContext = createContext<PlayerFilterContextValue | null>(null)

function regularIds(players: Player[]): number[] {
  return players.filter((p) => !p.is_sub).map((p) => p.id)
}

function idsForPreset(preset: string, players: Player[], customIds: number[]): number[] {
  if (preset === 'everyone') return players.map((p) => p.id)
  if (preset === 'regulars') return regularIds(players)
  return customIds
}

export function PlayerFilterProvider({ children }: { children: ReactNode }) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedIds, setSelectedIdsRaw] = useState<number[]>([])
  const [activePreset, setActivePreset] = useState<Preset>('regulars')
  const pendingPrefs = useRef<UserPreferences | null>(null)

  const applyPrefs = (players: Player[], prefs: UserPreferences) => {
    const preset = prefs.preset as Preset
    setActivePreset(preset)
    setSelectedIdsRaw(idsForPreset(preset, players, prefs.custom_player_ids))
  }

  const reloadPlayers = () => {
    getPlayers().then((players) => {
      setAllPlayers(players)
      if (pendingPrefs.current) {
        applyPrefs(players, pendingPrefs.current)
        pendingPrefs.current = null
      } else {
        setSelectedIdsRaw(regularIds(players))
      }
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

  const initFromPrefs = (prefs: UserPreferences) => {
    if (allPlayers.length > 0) {
      applyPrefs(allPlayers, prefs)
    } else {
      pendingPrefs.current = prefs
    }
  }

  return (
    <PlayerFilterContext.Provider value={{ allPlayers, selectedIds, setSelectedIds, activePreset, setPreset, reloadPlayers, initFromPrefs }}>
      {children}
    </PlayerFilterContext.Provider>
  )
}

export function usePlayerFilter() {
  const ctx = useContext(PlayerFilterContext)
  if (!ctx) throw new Error('usePlayerFilter must be used inside PlayerFilterProvider')
  return ctx
}
