import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { FixtureDifficultyEntry } from '../types'

interface Props {
  entries: FixtureDifficultyEntry[]
  playerNames: Record<number, string>
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`
const tone = (n: number) => (n > 0 ? 'text-green-500' : n < 0 ? 'text-red-500' : '')

export default function FixtureDifficultyTable({ entries, playerNames }: Props) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Player</TableHead>
            <TableHead className="text-right">Favourable</TableHead>
            <TableHead className="text-right">Even</TableHead>
            <TableHead className="text-right">Underdog</TableHead>
            <TableHead className="text-right">Favourable %</TableHead>
            <TableHead className="text-right">Net difficulty</TableHead>
            <TableHead className="text-right">vs expected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.player_id}>
              <TableCell className="font-medium">{playerNames[e.player_id] ?? `#${e.player_id}`}</TableCell>
              <TableCell className="text-right">{e.favourable}</TableCell>
              <TableCell className="text-right">{e.even}</TableCell>
              <TableCell className="text-right">{e.underdog}</TableCell>
              <TableCell className="text-right">
                {e.favourable_pct === null ? '–' : `${Math.round(e.favourable_pct * 100)}%`}
              </TableCell>
              <TableCell className={`text-right font-mono ${e.net_difficulty === null ? '' : tone(e.net_difficulty)}`}>
                {e.net_difficulty === null ? '–' : signed(e.net_difficulty)}
              </TableCell>
              <TableCell className="text-right">
                {e.vs_expected === null ? (
                  '–'
                ) : (
                  <>
                    <span className={`font-mono ${tone(e.vs_expected)}`}>{signed(e.vs_expected)}</span>
                    {e.expected_net !== null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">exp {signed(e.expected_net)}</span>
                    )}
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
