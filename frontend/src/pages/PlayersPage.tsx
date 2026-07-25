import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createPlayer } from '../api/players'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { usePlayerFilter } from '../context/PlayerFilterContext'

export default function PlayersPage() {
  const { allPlayers, selectedIds, reloadPlayers } = usePlayerFilter()
  const players = allPlayers.filter((p) => selectedIds.includes(p.id))

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [isSub, setIsSub] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const openDialog = () => {
    setName('')
    setIsSub(false)
    setAliasInput('')
    setSaveError(null)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    if (!name.trim()) return
    const aliases = aliasInput.split(',').map((s) => s.trim()).filter(Boolean)
    setSaving(true)
    setSaveError(null)
    createPlayer({ canonical_name: name.trim(), is_sub: isSub, is_admin: false, aliases })
      .then(() => {
        setDialogOpen(false)
        reloadPlayers()
      })
      .catch((e: Error) => setSaveError(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Players</h1>
        <Button variant="default" size="sm" onClick={openDialog}>
          New player
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {players.map((p) => (
          <Link
            key={p.id}
            to={`/players/${p.id}`}
            className="rounded-lg border border-border bg-card p-4 hover:border-yellow-400 transition-colors"
          >
            <p className="font-medium">{p.canonical_name}</p>
            {p.is_sub && <Badge variant="secondary" className="mt-1">sub</Badge>}
            {p.aliases.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {p.aliases.map((a) => a.alias).join(', ')}
              </p>
            )}
          </Link>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New player</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Canonical name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Aliases</label>
              <Input
                placeholder="Comma-separated (e.g. Nik, Niks)"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isSub}
                onChange={(e) => setIsSub(e.target.checked)}
              />
              Sub player
            </label>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
