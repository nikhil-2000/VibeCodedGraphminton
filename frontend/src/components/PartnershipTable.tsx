import { Link } from 'react-router-dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { PlayerPartnership } from '../types'

interface Props {
  partnerships: PlayerPartnership[]
  playerNames: Record<number, string>
  anomalyMap?: Record<number, 'over' | 'under'>
}

function AnomalyDot({ type }: { type: 'over' | 'under' }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${type === 'over' ? 'bg-green-500' : 'bg-red-500'}`}
      title={type === 'over' ? 'Overplayed' : 'Underplayed'}
    />
  )
}

export default function PartnershipTable({ partnerships, playerNames, anomalyMap }: Props) {
  const sorted = [...partnerships].sort((a, b) => b.win_rate - a.win_rate)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-6" />
          <TableHead>Partner</TableHead>
          <TableHead className="text-right">GP</TableHead>
          <TableHead className="text-right">W</TableHead>
          <TableHead className="text-right">L</TableHead>
          <TableHead className="text-right">Win %</TableHead>
          <TableHead className="text-right">Avg Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((p) => (
          <TableRow key={p.partner_id}>
            <TableCell className="w-6">
              {anomalyMap?.[p.partner_id] && <AnomalyDot type={anomalyMap[p.partner_id]} />}
            </TableCell>
            <TableCell className="font-medium">
              <Link to={`/players/${p.partner_id}`} className="hover:text-yellow-400">
                {playerNames[p.partner_id] ?? `Player ${p.partner_id}`}
              </Link>
            </TableCell>
            <TableCell className="text-right">{p.games_together}</TableCell>
            <TableCell className="text-right text-green-400">{p.wins}</TableCell>
            <TableCell className="text-right text-red-400">{p.losses}</TableCell>
            <TableCell className="text-right">{(p.win_rate * 100).toFixed(1)}%</TableCell>
            <TableCell className="text-right">{p.avg_points.toFixed(1)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
