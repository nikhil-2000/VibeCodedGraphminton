import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships, getPlayers } from '../api/players'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

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

  if (error) return <p className="text-destructive">{error}</p>
  if (!player || !stats) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/players" className="hover:text-yellow-400">Players</Link>
        {' / '}
        {player.canonical_name}
      </div>
      <h1 className="mb-1 text-2xl font-bold">{player.canonical_name}</h1>
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
    </div>
  )
}
