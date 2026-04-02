import { useState, useEffect } from 'react'
import { getGames } from '../api/games'
import GameCard from '../components/GameCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Game } from '../types'

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [week, setWeek] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = (w: string) => {
    setLoading(true)
    getGames({ week: w ? Number(w) : undefined })
      .then(setGames)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(week) }, [week])

  const bySession = games.reduce<Record<string, Game[]>>((acc, g) => {
    const key = g.session !== null ? `Session ${g.session}` : g.played_on
    ;(acc[key] ??= []).push(g)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Games</h1>
        <Input
          type="number"
          min={1}
          placeholder="Filter by session #"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          className="w-44"
        />
        {week && (
          <Button variant="ghost" size="sm" onClick={() => setWeek('')}>Clear</Button>
        )}
      </div>
      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
      {Object.entries(bySession).map(([sessionLabel, sessionGames]) => (
        <div key={sessionLabel} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {sessionLabel} — {sessionGames[0].played_on}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {sessionGames.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
