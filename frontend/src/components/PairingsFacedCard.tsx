import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PairingsFacedEntry } from '../types'

interface Props {
  playerId: number
  facedEntries: PairingsFacedEntry[]
  topN?: number
}

function WinRateBadge({ wins, games }: { wins: number; games: number }) {
  const pct = games > 0 ? (wins / games) * 100 : 0
  const color =
    pct >= 60 ? 'text-green-400' : pct <= 40 ? 'text-red-400' : 'text-muted-foreground'
  return <span className={color}>{games > 0 ? `${pct.toFixed(1)}%` : '—'}</span>
}

function PairingRow({ entry }: { entry: PairingsFacedEntry }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link to={`/players/${entry.pair_player_a_id}`} className="hover:text-yellow-400">
          {entry.pair_player_a_name}
        </Link>
        {' & '}
        <Link to={`/players/${entry.pair_player_b_id}`} className="hover:text-yellow-400">
          {entry.pair_player_b_name}
        </Link>
      </TableCell>
      <TableCell className="text-right">{entry.games_faced}</TableCell>
      <TableCell className="text-right">
        <WinRateBadge wins={entry.wins} games={entry.games_faced} />
      </TableCell>
      <TableCell className="text-right text-green-400">{entry.wins}</TableCell>
      <TableCell className="text-right text-red-400">{entry.losses}</TableCell>
    </TableRow>
  )
}

export default function PairingsFacedCard({ playerId: _playerId, facedEntries, topN = 5 }: Props) {
  const mostFaced = facedEntries.slice(0, topN)

  if (mostFaced.length === 0) {
    return (
      <Card className="mt-6">
        <CardHeader><CardTitle>Pairings Faced</CardTitle></CardHeader>
        <CardContent><p className="text-muted-foreground">No data yet.</p></CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-6">
      <CardHeader><CardTitle>Pairings Faced</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pairing</TableHead>
                <TableHead className="text-right">GP</TableHead>
                <TableHead className="text-right">Win %</TableHead>
                <TableHead className="text-right">W</TableHead>
                <TableHead className="text-right">L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mostFaced.map((e) => (
                <PairingRow key={`${e.pair_player_a_id}-${e.pair_player_b_id}`} entry={e} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
