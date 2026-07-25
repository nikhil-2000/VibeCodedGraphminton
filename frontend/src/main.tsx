import { StrictMode, useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { SeasonFilterProvider, useSeasonFilter } from './context/SeasonFilterContext.tsx'
import { PlayerFilterProvider, usePlayerFilter } from './context/PlayerFilterContext.tsx'
import { getPreferences, updatePreferences } from './api/preferences.ts'
import type { UserPreferences } from './api/preferences.ts'
import { IdentityModal } from './components/IdentityModal.tsx'

function AppWithPrefs() {
  const [showModal, setShowModal] = useState(false)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const { initFromPrefs: initPlayer, selectedIds, activePreset, allPlayers } = usePlayerFilter()
  const { initFromPrefs: initSeason, selectedSeasonId, seasons } = useSeasonFilter()

  // Track previous values to detect changes (skip on first load)
  const prevPreset = useRef<string | null>(null)
  const prevCustomIds = useRef<number[] | null>(null)
  const prevSeasonId = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        initPlayer(prefs)
        initSeason(prefs)
        setPrefsLoaded(true)
      })
      .catch((err: Error) => {
        if (err.message.includes('404') || err.message === 'Preferences not found') {
          setShowModal(true)
        }
        setPrefsLoaded(true)
      })
  }, [])

  // Persist preset/custom_player_ids changes
  useEffect(() => {
    if (!prefsLoaded) return
    if (prevPreset.current === null) {
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
    if (prevSeasonId.current === undefined) {
      prevSeasonId.current = selectedSeasonId
      return
    }
    if (prevSeasonId.current === selectedSeasonId) return
    prevSeasonId.current = selectedSeasonId
    updatePreferences({ season_id: selectedSeasonId }).catch(console.error)
  }, [selectedSeasonId, prefsLoaded])

  const handleIdentityComplete = (prefs: UserPreferences) => {
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
    <>
      {showModal && allPlayers.length > 0 && seasons.length > 0 && (
        <IdentityModal onComplete={handleIdentityComplete} />
      )}
      <App />
    </>
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
