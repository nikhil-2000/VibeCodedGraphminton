import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Button } from './ui/button'
import { createPreferences } from '../api/preferences'
import type { UserPreferences } from '../api/preferences'
import { usePlayerFilter } from '../context/PlayerFilterContext'

interface Props {
  onComplete: (prefs: UserPreferences) => void
}

export function IdentityModal({ onComplete }: Props) {
  const { allPlayers } = usePlayerFilter()
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    if (!selectedPlayerId) return
    setLoading(true)
    try {
      const prefs = await createPreferences({
        player_id: Number(selectedPlayerId),
        preset: 'regulars',
        season_id: null,
        custom_player_ids: [],
      })
      onComplete(prefs)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Select your name so the app can remember your preferences.
        </p>
        <Select onValueChange={setSelectedPlayerId} value={selectedPlayerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a player..." />
          </SelectTrigger>
          <SelectContent>
            {allPlayers.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.canonical_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleConfirm} disabled={!selectedPlayerId || loading}>
          {loading ? 'Saving...' : 'Continue'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
