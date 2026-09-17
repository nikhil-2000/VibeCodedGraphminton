import { Link } from 'react-router-dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { PairingsLeaderboardEntry } from '../types'

interface Props {
  entries: PairingsLeaderboardEntry[]
}

export default function PairingsLeaderboardTable({ entries }: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead className="text-right">GP</TableHead>
            <TableHead className="text-right">Win %</TableHead>
            <TableHead className="text-right">Avg Pts</TableHead>
            <TableHead className="text-right">W</TableHead>
            <TableHead className="text-right">L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e, i) => (
            <TableRow key={`${e.player_a_id}-${e.player_b_id}`}>
              <TableCell className="text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-medium">
                <Link to={`/players/${e.player_a_id}`} className="hover:text-yellow-400">
                  {e.player_a_name}
                </Link>
                {' & '}
                <Link to={`/players/${e.player_b_id}`} className="hover:text-yellow-400">
                  {e.player_b_name}
                </Link>
              </TableCell>
              <TableCell className="text-right">{e.games_together}</TableCell>
              <TableCell className="text-right">{(e.win_rate * 100).toFixed(1)}%</TableCell>
              <TableCell className="text-right">{e.avg_points.toFixed(2)}</TableCell>
              <TableCell className="text-right text-green-400">{e.wins}</TableCell>
              <TableCell className="text-right text-red-400">{e.losses}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
