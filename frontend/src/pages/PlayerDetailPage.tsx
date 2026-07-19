import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships, deletePlayer, updatePlayer } from '../api/players'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const navigate = useNavigate()
  const { selectedIds, allPlayers, reloadPlayers } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [error, setError] = useState<string | null>(null)

  const playerNames = Object.fromEntries(allPlayers.map((p) => [p.id, p.canonical_name]))

  // delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editIsSub, setEditIsSub] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [pendingAliases, setPendingAliases] = useState<string[]>([])
  const [removedAliases, setRemovedAliases] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getPlayer(playerId),
      getPlayerStats(playerId, selectedIds, selectedSeasonId),
      getPlayerPartnerships(playerId, selectedIds, selectedSeasonId),
    ])
      .then(([p, s, partners]) => {
        setPlayer(p)
        setStats(s)
        setPartnerships(partners)
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId, selectedIds, selectedSeasonId])

  const openEdit = () => {
    if (!player) return
    setEditIsSub(player.is_sub)
    setPendingAliases([])
    setRemovedAliases([])
    setAliasInput('')
    setSaveError(null)
    setEditOpen(true)
  }

  const addAlias = () => {
    const trimmed = aliasInput.trim()
    if (!trimmed || pendingAliases.includes(trimmed)) return
    setPendingAliases((prev) => [...prev, trimmed])
    setAliasInput('')
  }

  const removeExistingAlias = (alias: string) => {
    setRemovedAliases((prev) =>
      prev.includes(alias) ? prev.filter((a) => a !== alias) : [...prev, alias]
    )
  }

  const removePendingAlias = (alias: string) => {
    setPendingAliases((prev) => prev.filter((a) => a !== alias))
  }

  const handleSave = async () => {
    if (!player) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updatePlayer(playerId, {
        is_sub: editIsSub,
        add_aliases: pendingAliases,
        remove_aliases: removedAliases,
      })
      setPlayer(updated)
      reloadPlayers()
      setEditOpen(false)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    deletePlayer(playerId)
      .then(() => { reloadPlayers(); navigate('/players') })
      .catch((e: Error) => { setDeleteError(e.message); setDeleting(false) })
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (!player || !stats) return <p className="text-muted-foreground">Loading…</p>

  const existingAliases = player.aliases.map((a) => a.alias)

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/players" className="hover:text-yellow-400">Players</Link>
        {' / '}
        {player.canonical_name}
      </div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{player.canonical_name}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          player.is_sub
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-muted text-muted-foreground'
        }`}>
          {player.is_sub ? 'Sub' : 'Regular'}
        </span>
        <Button variant="outline" size="sm" onClick={openEdit}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={() => { setDeleteError(null); setDeleteOpen(true) }}>
          Delete
        </Button>
      </div>
      {existingAliases.length > 0 && (
        <p className="mb-6 text-sm text-muted-foreground">
          Also known as: {existingAliases.join(', ')}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <StatCard label="Games" value={stats.games_played} />
        <StatCard label="Wins" value={stats.wins} />
        <StatCard label="Losses" value={stats.losses} />
        <StatCard label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} />
        <StatCard label="Avg Pts" value={stats.avg_points.toFixed(1)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Partnerships</CardTitle></CardHeader>
        <CardContent>
          {partnerships.length === 0
            ? <p className="text-muted-foreground">No partnerships yet.</p>
            : <PartnershipTable partnerships={partnerships} playerNames={playerNames} />}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!saving) setEditOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {player.canonical_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* is_sub toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">Player type</span>
              <div className="flex rounded-md border border-border text-xs">
                <button
                  onClick={() => setEditIsSub(false)}
                  className={`px-3 py-1.5 rounded-l-md transition-colors ${!editIsSub ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  Regular
                </button>
                <button
                  onClick={() => setEditIsSub(true)}
                  className={`px-3 py-1.5 rounded-r-md transition-colors ${editIsSub ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  Sub
                </button>
              </div>
            </div>

            {/* existing aliases */}
            <div>
              <p className="mb-2 text-sm font-medium">Aliases</p>
              {existingAliases.length === 0 && pendingAliases.length === 0 && (
                <p className="text-xs text-muted-foreground">No aliases yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {existingAliases.map((alias) => {
                  const removed = removedAliases.includes(alias)
                  return (
                    <button
                      key={alias}
                      onClick={() => removeExistingAlias(alias)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        removed
                          ? 'bg-destructive/20 text-destructive line-through'
                          : 'bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive'
                      }`}
                      title={removed ? 'Click to restore' : 'Click to remove'}
                    >
                      {alias}
                      <span className="opacity-60">{removed ? '↩' : '×'}</span>
                    </button>
                  )
                })}
                {pendingAliases.map((alias) => (
                  <button
                    key={alias}
                    onClick={() => removePendingAlias(alias)}
                    className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs text-green-400 hover:bg-destructive/10 hover:text-destructive"
                    title="Click to remove"
                  >
                    {alias} <span className="opacity-60">×</span>
                  </button>
                ))}
              </div>
            </div>

            {/* add alias */}
            <div className="flex gap-2">
              <Input
                placeholder="New alias…"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addAlias} disabled={!aliasInput.trim()}>
                Add
              </Button>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {player.canonical_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Players with recorded games cannot be deleted.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
