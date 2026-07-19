import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPlayer } from '../api/players'
import type { Player } from '../types'

interface Props {
  value: number | null
  rawName?: string            // original CSV name, shown in error state
  onChange: (id: number) => void
  players: Player[]
  onPlayerCreated: () => void // called after a new player is created so list can refresh
  disabled?: boolean
}

export default function PlayerSelect({ value, rawName, onChange, players, onPlayerCreated, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIsSub, setNewIsSub] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selected = players.find((p) => p.id === value)
  const isError = value === null && !!rawName
  const filtered = players.filter(
    (p) =>
      p.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      p.aliases.some((a) => a.alias.toLowerCase().includes(search.toLowerCase()))
  )

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const p = await createPlayer({ canonical_name: newName.trim(), is_sub: newIsSub, aliases: [] })
      onChange(p.id)
      onPlayerCreated()
      setOpen(false)
      setCreating(false)
      setNewName('')
      setNewIsSub(false)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={`h-8 min-w-32 max-w-40 truncate rounded border px-2 text-left text-sm transition-colors hover:border-foreground/40 disabled:opacity-50 ${
          isError
            ? 'border-destructive text-destructive'
            : 'border-border text-foreground'
        }`}
      >
        {selected ? selected.canonical_name : rawName ? `? ${rawName}` : 'Select…'}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        {!creating ? (
          <>
            <Input
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 h-7 text-xs"
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No players found</p>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); setSearch('') }}
                  className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-muted ${
                    p.id === value ? 'bg-muted font-medium' : ''
                  }`}
                >
                  {p.canonical_name}
                  {p.is_sub && <span className="ml-1 text-xs text-yellow-400">sub</span>}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => { setCreating(true); setNewName(rawName ?? '') }}
                className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + Add new player
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium">New player</p>
            <Input
              placeholder="Canonical name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              className="h-7 text-xs"
              autoFocus
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={newIsSub}
                onChange={(e) => setNewIsSub(e.target.checked)}
                className="h-3 w-3"
              />
              Sub player
            </label>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
              >
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setCreating(false); setSaveError(null) }}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
