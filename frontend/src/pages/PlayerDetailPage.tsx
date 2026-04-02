import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships, getPlayers, deletePlayer, updatePlayer } from '../api/players'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const navigate = useNavigate()

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [togglingSubb, setTogglingSubb] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getPlayer(playerId),
      getPlayerStats(playerId),
      getPlayerPartnerships(playerId),
      getPlayers(),
    ])
      .then(([p, s, partners, allPlayers]) => {
        setPlayer(p)
        setStats(s)
        setPartnerships(partners)
        setPlayerNames(Object.fromEntries(allPlayers.map((pl) => [pl.id, pl.canonical_name])))
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])

  const handleToggleSub = () => {
    if (!player || togglingSubb) return
    setTogglingSubb(true)
    updatePlayer(playerId, { is_sub: !player.is_sub })
      .then((updated) => setPlayer(updated))
      .finally(() => setTogglingSubb(false))
  }

  const handleDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    deletePlayer(playerId)
      .then(() => navigate('/players'))
      .catch((e: Error) => {
        setDeleteError(e.message)
        setDeleting(false)
      })
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (!player || !stats) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/players" className="hover:text-yellow-400">Players</Link>
        {' / '}
        {player.canonical_name}
      </div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{player.canonical_name}</h1>
        <button
          onClick={handleToggleSub}
          disabled={togglingSubb}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            player.is_sub
              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {player.is_sub ? 'Sub' : 'Regular'}
        </button>
        <Button variant="destructive" size="sm" onClick={() => { setDeleteError(null); setDeleteOpen(true) }}>
          Delete
        </Button>
      </div>
      {player.aliases.length > 0 && (
        <p className="mb-6 text-sm text-muted-foreground">
          Also known as: {player.aliases.map((a) => a.alias).join(', ')}
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
        <CardHeader>
          <CardTitle>Partnerships</CardTitle>
        </CardHeader>
        <CardContent>
          {partnerships.length === 0
            ? <p className="text-muted-foreground">No partnerships yet.</p>
            : <PartnershipTable partnerships={partnerships} playerNames={playerNames} />}
        </CardContent>
      </Card>
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
