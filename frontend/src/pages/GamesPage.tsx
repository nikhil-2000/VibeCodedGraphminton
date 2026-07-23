import { useState } from 'react'
import { deleteGame, deleteSession } from '../api/games'
import GameCard from '../components/GameCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useFilteredGames } from '../hooks/useFilteredGames'

export default function GamesPage() {
  const [week, setWeek] = useState('')
  const { games, setGames, loading, error } = useFilteredGames({ week: week ? Number(week) : undefined })

  const handleDeleteGame = async (id: number) => {
    await deleteGame(id)
    setGames((prev) => prev.filter((g) => g.id !== id))
  }

  const handleDeleteSession = async (playedOn: string) => {
    await deleteSession(playedOn)
    setGames((prev) => prev.filter((g) => g.played_on !== playedOn))
  }

  const bySession = games.reduce<Record<string, typeof games>>((acc, g) => {
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
      <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-green-500" /> Close (≤3)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-yellow-500" /> Comfortable (4–6)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-red-500" /> One-sided (&gt;6)</span>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
      {Object.entries(bySession).map(([sessionLabel, sessionGames]) => (
        <div key={sessionLabel} className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {sessionLabel} — {sessionGames[0].played_on}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground/60 hover:text-destructive"
              onClick={() => {
                if (confirm(`Delete all ${sessionGames.length} games from ${sessionGames[0].played_on}?`)) {
                  handleDeleteSession(sessionGames[0].played_on)
                }
              }}
            >
              Delete session
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {sessionGames.map((g) => (
              <GameCard key={g.id} game={g} onDelete={handleDeleteGame} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
