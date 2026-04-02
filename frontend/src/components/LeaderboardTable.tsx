import { Link } from 'react-router-dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { LeaderboardEntry } from '../types'

interface Props {
  entries: LeaderboardEntry[]
}

export default function LeaderboardTable({ entries }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">GP</TableHead>
          <TableHead className="text-right">W</TableHead>
          <TableHead className="text-right">L</TableHead>
          <TableHead className="text-right">Win %</TableHead>
          <TableHead className="text-right">Avg Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e, i) => (
          <TableRow key={e.player_id}>
            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">
              <Link to={`/players/${e.player_id}`} className="hover:text-yellow-400">
                {e.canonical_name}
              </Link>
            </TableCell>
            <TableCell className="text-right">{e.games_played}</TableCell>
            <TableCell className="text-right text-green-400">{e.wins}</TableCell>
            <TableCell className="text-right text-red-400">{e.losses}</TableCell>
            <TableCell className="text-right">{(e.win_rate * 100).toFixed(1)}%</TableCell>
            <TableCell className="text-right">{e.avg_points.toFixed(1)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
