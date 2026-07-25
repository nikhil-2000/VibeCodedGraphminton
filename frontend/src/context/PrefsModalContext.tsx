import { createContext, useContext } from 'react'

interface PrefsModalContextValue {
  openModal: () => void
}

export const PrefsModalContext = createContext<PrefsModalContextValue | null>(null)

export function usePrefsModal() {
  const ctx = useContext(PrefsModalContext)
  if (!ctx) throw new Error('usePrefsModal must be used inside PrefsModalContext.Provider')
  return ctx
}
