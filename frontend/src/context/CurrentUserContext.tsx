import { createContext, useContext } from 'react'
import type { Player } from '../types'

interface CurrentUserContextValue {
  currentPlayer: Player | null
  isAdmin: boolean
}

export const CurrentUserContext = createContext<CurrentUserContextValue>({
  currentPlayer: null,
  isAdmin: false,
})

export function useCurrentUser() {
  return useContext(CurrentUserContext)
}
