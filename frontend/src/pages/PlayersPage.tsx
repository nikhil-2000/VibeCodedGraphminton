import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getPlayers } from '../api/players'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Player } from '../types'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [showSubs, setShowSubs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getPlayers(showSubs ? undefined : false)
      .then(setPlayers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [showSubs])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Players</h1>
        <Button
          variant={showSubs ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowSubs((v) => !v)}
        >
          {showSubs ? 'Hiding subs' : 'Show subs'}
        </Button>
      </div>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
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
    </div>
  )
}
