import { useState, useEffect } from 'react'
import { getAllPartnerships } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import GraphCanvas from '../components/GraphCanvas'
import { Input } from '@/components/ui/input'
import type { Player, Partnership } from '../types'

export default function GraphPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [minGames, setMinGames] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { selectedIds, allPlayers: contextPlayers } = usePlayerFilter()

  useEffect(() => {
    setLoading(true)
    getAllPartnerships(selectedIds)
      .then((ps) => {
        setPlayers(contextPlayers.filter((p) => selectedIds.includes(p.id)))
        setPartnerships(ps)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedIds, contextPlayers])

  const filtered = partnerships.filter((p) => p.games_together >= minGames)

  if (loading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-destructive">{error}</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partnership Network</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Min games together:
          <Input
            type="number"
            min={1}
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="w-20 text-center"
          />
        </label>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Edge width = games together · Edge colour: green ≥60% win rate, yellow ≥40%, red &lt;40%
      </p>
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 560 }}>
        <GraphCanvas players={players} partnerships={filtered} />
      </div>
    </div>
  )
}
