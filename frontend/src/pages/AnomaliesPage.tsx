import { useState, useEffect } from 'react'
import { getPartnershipAnomalies, getHeadToHeadAnomalies } from '../api/anomalies'
import { getPlayers } from '../api/players'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import AnomalyTable from '../components/AnomalyTable'
import { Button } from '@/components/ui/button'
import type { AnomalyEntry } from '../types'

type Tab = 'partnerships' | 'head-to-head'
type Direction = 'overplayed' | 'underplayed'

export default function AnomaliesPage() {
  const { selectedIds } = usePlayerFilter()
  const [tab, setTab] = useState<Tab>('partnerships')
  const [direction, setDirection] = useState<Direction>('overplayed')
  const [entries, setEntries] = useState<AnomalyEntry[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPlayers().then((players) =>
      setPlayerNames(Object.fromEntries(players.map((p) => [p.id, p.canonical_name])))
    )
  }, [])

  useEffect(() => {
    setLoading(true)
    const fetch = tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies
    fetch(direction, 20, selectedIds)
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tab, direction, selectedIds])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Anomalies</h1>

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
        <div className="ml-auto flex gap-2">
          {(['overplayed', 'underplayed'] as Direction[]).map((d) => (
            <Button
              key={d}
              variant={direction === d ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setDirection(d)}
              className="capitalize"
            >
              {d}
            </Button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Deviation = actual − expected (based on random pairing probability).
        {direction === 'overplayed'
          ? ' Positive = more frequent than random chance.'
          : ' Negative = less frequent than random chance.'}
      </p>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
      {!loading && !error && <AnomalyTable entries={entries} playerNames={playerNames} />}
    </div>
  )
}
