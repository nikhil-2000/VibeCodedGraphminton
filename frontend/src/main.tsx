import { StrictMode, useState, useEffect, useRef, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SeasonFilterProvider, useSeasonFilter } from './context/SeasonFilterContext.tsx'
import { PlayerFilterProvider, usePlayerFilter } from './context/PlayerFilterContext.tsx'
import { getPreferences, updatePreferences } from './api/preferences.ts'
import type { UserPreferences } from './api/preferences.ts'
import { IdentityModal } from './components/IdentityModal.tsx'
import { PrefsModalContext } from './context/PrefsModalContext.tsx'
import { CurrentUserContext } from './context/CurrentUserContext.tsx'
import { CurrentPlayerContext } from './context/CurrentPlayerContext.tsx'

function AppWithPrefs() {
  const [showModal, setShowModal] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [currentPlayerId, setCurrentPlayerId] = useState<number | null>(null)
  const { initFromPrefs: initPlayer, selectedIds, activePreset, allPlayers } = usePlayerFilter()
  const { initFromPrefs: initSeason, selectedSeasonId, seasons } = useSeasonFilter()

  // Track previous values to detect changes (skip on first load)
  const presetInitialized = useRef(false)
  const prevPreset = useRef<string | null>(null)
  const prevCustomIds = useRef<number[] | null>(null)
  const seasonInitialized = useRef(false)
  const prevSeasonId = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setCurrentPlayerId(prefs.player_id)
        initPlayer(prefs)
        initSeason(prefs)
        setPrefsLoaded(true)
      })
      .catch((err: Error) => {
        if (err.message === 'Preferences not found') {
          setShowModal(true)
        }
        setPrefsLoaded(true)
      })
  }, [])

  // Persist preset/custom_player_ids changes
  useEffect(() => {
    if (!prefsLoaded) return
    if (!presetInitialized.current) {
      presetInitialized.current = true
      prevPreset.current = activePreset
      prevCustomIds.current = selectedIds
      return
    }
    const customIds = activePreset === 'custom' ? selectedIds : []
    if (prevPreset.current === activePreset && prevCustomIds.current?.join() === customIds.join()) return
    prevPreset.current = activePreset
    prevCustomIds.current = customIds
    updatePreferences({ preset: activePreset, custom_player_ids: customIds }).catch(console.error)
  }, [activePreset, selectedIds, prefsLoaded])

  // Persist season changes
  useEffect(() => {
    if (!prefsLoaded) return
    if (!seasonInitialized.current) {
      seasonInitialized.current = true
      prevSeasonId.current = selectedSeasonId
      return
    }
    if (prevSeasonId.current === selectedSeasonId) return
    prevSeasonId.current = selectedSeasonId
    updatePreferences({ season_id: selectedSeasonId }).catch(console.error)
  }, [selectedSeasonId, prefsLoaded])

  const currentPlayer = currentPlayerId != null
    ? allPlayers.find((p) => p.id === currentPlayerId) ?? null
    : null
  const isAdmin = currentPlayer?.is_admin ?? false

  const openModal = useCallback(() => setShowModal(true), [])

  const handleIdentityComplete = (prefs: UserPreferences) => {
    setCurrentPlayerId(prefs.player_id)
    // Set season_id to last season after identity is set
    const lastSeasonId = seasons.length > 0 ? seasons[seasons.length - 1].id : null
    const prefsWithSeason = { ...prefs, season_id: lastSeasonId }
    if (lastSeasonId !== null) {
      updatePreferences({ season_id: lastSeasonId }).catch(console.error)
    }
    initPlayer(prefsWithSeason)
    initSeason(prefsWithSeason)
    setShowModal(false)
  }

  return (
    <CurrentPlayerContext.Provider value={{ currentPlayerId }}>
      <PrefsModalContext.Provider value={{ openModal }}>
        <CurrentUserContext.Provider value={{ currentPlayer, isAdmin }}>
          {showModal && allPlayers.length > 0 && seasons.length > 0 && (
            <IdentityModal
              onComplete={handleIdentityComplete}
              onClose={prefsLoaded ? () => setShowModal(false) : undefined}
              currentPlayerId={currentPlayerId}
            />
          )}
          <App />
        </CurrentUserContext.Provider>
      </PrefsModalContext.Provider>
    </CurrentPlayerContext.Provider>
  )
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <SeasonFilterProvider>
        <PlayerFilterProvider>
          <AppWithPrefs />
        </PlayerFilterProvider>
      </SeasonFilterProvider>
    </BrowserRouter>
  </StrictMode>,
)
