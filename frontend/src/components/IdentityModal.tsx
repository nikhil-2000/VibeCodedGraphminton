import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { createPreferences, updatePreferences } from '../api/preferences'
import type { UserPreferences } from '../api/preferences'
import { usePlayerFilter } from '../context/PlayerFilterContext'

interface Props {
  onComplete: (prefs: UserPreferences) => void
  onClose?: () => void
  currentPlayerId?: number | null
}

export function IdentityModal({ onComplete, onClose, currentPlayerId }: Props) {
  const { allPlayers } = usePlayerFilter()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(
    currentPlayerId != null ? String(currentPlayerId) : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const isUpdate = currentPlayerId != null

  const handleConfirm = async () => {
    if (!selectedPlayerId) return
    setError('')
    setLoading(true)
    try {
      const prefs = isUpdate
        ? await updatePreferences({ player_id: Number(selectedPlayerId) })
        : await createPreferences({
            player_id: Number(selectedPlayerId),
            preset: 'regulars',
            season_id: null,
            custom_player_ids: [],
          })
      onComplete(prefs)
    } catch (err) {
      setError((err as Error).message || 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.() }}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!!onClose}>
        <DialogHeader>
          <DialogTitle>{isUpdate ? 'Change identity' : 'Who are you?'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isUpdate
            ? 'Select your name to update your identity.'
            : 'Select your name so the app can remember your preferences.'}
        </p>
        <Select onValueChange={(value) => value !== null && setSelectedPlayerId(value)} value={selectedPlayerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a player...">
              {selectedPlayerId != null
                ? (allPlayers.find((p) => String(p.id) === selectedPlayerId)?.canonical_name ?? 'Select a player...')
                : 'Select a player...'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allPlayers.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.canonical_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <Button onClick={handleConfirm} disabled={!selectedPlayerId || loading}>
          {loading ? 'Saving...' : isUpdate ? 'Update' : 'Continue'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
