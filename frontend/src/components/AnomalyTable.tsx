import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { AnomalyEntry } from '../types'

interface Props {
  entries: AnomalyEntry[]
  playerNames: Record<number, string>
}

export default function AnomalyTable({ entries, playerNames }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player A</TableHead>
          <TableHead>Player B</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">Expected</TableHead>
          <TableHead className="text-right">Deviation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={`${e.player_a_id}-${e.player_b_id}`}>
            <TableCell className="font-medium">{playerNames[e.player_a_id] ?? `#${e.player_a_id}`}</TableCell>
            <TableCell className="font-medium">{playerNames[e.player_b_id] ?? `#${e.player_b_id}`}</TableCell>
            <TableCell className="text-right">{e.actual}</TableCell>
            <TableCell className="text-right text-muted-foreground">{e.expected.toFixed(2)}</TableCell>
            <TableCell className={`text-right font-mono ${e.deviation > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {e.deviation > 0 ? '+' : ''}{e.deviation.toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
