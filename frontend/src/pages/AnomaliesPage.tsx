import { useState, useEffect } from 'react'
import {
  getPartnershipAnomalies,
  getHeadToHeadAnomalies,
  getPartnershipAnomaliesForPlayer,
  getHeadToHeadAnomaliesForPlayer,
} from '../api/anomalies'
import { getPlayers } from '../api/players'
import { getSuggestedGames } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import AnomalyTable from '../components/AnomalyTable'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SuggestedGame } from '../types'

type Tab = 'partnerships' | 'head-to-head'
type Direction = 'overplayed' | 'underplayed'

export default function AnomaliesPage() {
  const { selectedIds } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const [tab, setTab] = useState<Tab>('partnerships')
  const [direction, setDirection] = useState<Direction>('overplayed')
  const [entries, setEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [overEntries, setOverEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [underEntries, setUnderEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState<number | null>(null)
  const [suggestedGames, setSuggestedGames] = useState<SuggestedGame[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)

  useEffect(() => {
    getPlayers().then((players) =>
      setPlayerNames(Object.fromEntries(players.map((p) => [p.id, p.canonical_name])))
    )
  }, [])

  useEffect(() => {
    setSuggestionsLoading(true)
    getSuggestedGames(selectedIds, selectedSeasonId, 5, focusedPlayerId ?? undefined)
      .then(setSuggestedGames)
      .finally(() => setSuggestionsLoading(false))
  }, [selectedIds, selectedSeasonId, focusedPlayerId])

  useEffect(() => {
    setLoading(true)
    setError(null)
    if (focusedPlayerId !== null) {
      const fetcher = tab === 'partnerships'
        ? getPartnershipAnomaliesForPlayer
        : getHeadToHeadAnomaliesForPlayer
      Promise.all([
        fetcher(focusedPlayerId, 'overplayed', selectedIds, selectedSeasonId),
        fetcher(focusedPlayerId, 'underplayed', selectedIds, selectedSeasonId),
      ])
        .then(([over, under]) => setEntries([...over, ...under].sort((a, b) => b.deviation - a.deviation)))
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    } else {
      const fetcher = tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies
      Promise.all([
        fetcher('overplayed', 10, selectedIds, selectedSeasonId),
        fetcher('underplayed', 10, selectedIds, selectedSeasonId),
      ])
        .then(([over, under]) => { setOverEntries(over); setUnderEntries(under) })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [tab, direction, selectedIds, selectedSeasonId, focusedPlayerId])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Anomalies</h1>

      <div className="mb-4">
        <Select
          value={focusedPlayerId !== null ? String(focusedPlayerId) : 'all'}
          onValueChange={(v) => setFocusedPlayerId(v === 'all' ? null : Number(v))}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <span>
              {focusedPlayerId === null
                ? 'All players'
                : (playerNames[focusedPlayerId] ?? 'Player')}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All players</SelectItem>
            {Object.entries(playerNames)
              .sort(([, a], [, b]) => a.localeCompare(b))
              .map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Deviation = actual − expected (based on random pairing probability).
        {focusedPlayerId !== null
          ? ' Positive = more frequent, negative = less frequent than random chance.'
          : ' Positive = more frequent, negative = less frequent than random chance.'}
      </p>

      <div className="mb-4 flex gap-2">
        {(['partnerships', 'head-to-head'] as Tab[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
      {!loading && !error && focusedPlayerId !== null && (
        <AnomalyTable entries={entries} playerNames={playerNames} focusedPlayerId={focusedPlayerId} />
      )}
      {!loading && !error && focusedPlayerId === null && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-green-500">Overplayed</h2>
            <AnomalyTable entries={overEntries} playerNames={playerNames} />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-red-500">Underplayed</h2>
            <AnomalyTable entries={underEntries} playerNames={playerNames} />
          </div>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Suggested Games</CardTitle>
          <p className="text-xs text-muted-foreground">Games that address the most underplayed pairings and matchups.</p>
        </CardHeader>
        <CardContent>
          {suggestionsLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!suggestionsLoading && suggestedGames.length === 0 && (
            <p className="text-sm text-muted-foreground">No suggestions available.</p>
          )}
          {!suggestionsLoading && suggestedGames.length > 0 && (
            <div className="space-y-4">
              {suggestedGames.map((g, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="font-medium">
                    {g.team_a.join(' & ')}
                    <span className="mx-2 text-muted-foreground">vs</span>
                    {g.team_b.join(' & ')}
                  </p>
                  {g.fixes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {g.fixes.map((fix, j) => (
                        <span key={j} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {fix}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
