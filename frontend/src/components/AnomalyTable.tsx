import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { AnomalyEntry } from '../types'

interface Props {
  entries: AnomalyEntry[]
  playerNames: Record<number, string>
  focusedPlayerId?: number | null
}

export default function AnomalyTable({ entries, playerNames, focusedPlayerId }: Props) {
  const otherName = (e: AnomalyEntry) => {
    if (focusedPlayerId != null) {
      const otherId = e.player_a_id === focusedPlayerId ? e.player_b_id : e.player_a_id
      return playerNames[otherId] ?? `#${otherId}`
    }
    return `${playerNames[e.player_a_id] ?? `#${e.player_a_id}`} & ${playerNames[e.player_b_id] ?? `#${e.player_b_id}`}`
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{focusedPlayerId != null ? 'Player' : 'Pairing'}</TableHead>
            <TableHead className="text-right">Deviation</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Actual</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Expected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={`${e.player_a_id}-${e.player_b_id}`}>
              <TableCell className="font-medium">{otherName(e)}</TableCell>
              <TableCell className={`text-right font-mono ${e.deviation > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {e.deviation > 0 ? '+' : ''}{e.deviation.toFixed(2)}
              </TableCell>
              <TableCell className="hidden text-right sm:table-cell">{e.actual}</TableCell>
              <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{e.expected.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
