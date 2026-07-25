import { createContext, useContext } from 'react'

interface CurrentPlayerContextValue {
  currentPlayerId: number | null
}

export const CurrentPlayerContext = createContext<CurrentPlayerContextValue>({ currentPlayerId: null })

export function useCurrentPlayer() {
  return useContext(CurrentPlayerContext)
}
