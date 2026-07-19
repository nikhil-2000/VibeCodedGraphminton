import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PlayerSelect from './PlayerSelect'
import { validateGames, ingestGames } from '../api/ingest'
import type { GameRowIn, GameRowError } from '../api/ingest'
import type { Player } from '../types'

export interface SessionRow {
  teamA: [number | null, number | null]
  teamARaw: [string | undefined, string | undefined]
  scoreA: number | string
  teamB: [number | null, number | null]
  teamBRaw: [string | undefined, string | undefined]
  scoreB: number | string
}

export interface SessionData {
  id: string
  dateStr: string
  rows: SessionRow[]
}

interface Props {
  session: SessionData
  players: Player[]
  onPlayerCreated: () => void
  onChange: (updated: SessionData) => void
  onRemove: () => void
  onUploaded: () => void
}

export default function SessionCard({ session, players, onPlayerCreated, onChange, onRemove, onUploaded }: Props) {
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({})
  const [validating, setValidating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)

  const updateRow = (idx: number, patch: Partial<SessionRow>) => {
    const updated = session.rows.map((r, i) => i === idx ? { ...r, ...patch } : r)
    onChange({ ...session, rows: updated })
    setRowErrors({})
    setUploadError(null)
  }

  const setDate = (dateStr: string) => {
    onChange({ ...session, dateStr })
  }

  // Build GameRowIn[] from rows that are fully resolved
  const toPayload = (): GameRowIn[] | null => {
    const result: GameRowIn[] = []
    for (const row of session.rows) {
      if (row.teamA[0] === null || row.teamA[1] === null || row.teamB[0] === null || row.teamB[1] === null) return null
      const sA = Number(row.scoreA)
      const sB = Number(row.scoreB)
      if (isNaN(sA) || isNaN(sB)) return null
      result.push({ team_a: [row.teamA[0], row.teamA[1]], score_a: sA, team_b: [row.teamB[0], row.teamB[1]], score_b: sB })
    }
    return result
  }

  const isFullyResolved = toPayload() !== null && session.dateStr.length > 0

  const handleValidate = async () => {
    const games = toPayload()
    if (!games) return
    setValidating(true)
    setRowErrors({})
    try {
      const { errors } = await validateGames({ played_on: session.dateStr, games })
      const map: Record<number, string[]> = {}
      for (const e of errors) map[e.row - 1] = e.errors
      setRowErrors(map)
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setValidating(false)
    }
  }

  const isValid = isFullyResolved && Object.keys(rowErrors).length === 0

  const handleUpload = async () => {
    const games = toPayload()
    if (!games) return
    setUploading(true)
    setUploadError(null)
    try {
      await ingestGames({ played_on: session.dateStr, games })
      setUploaded(true)
      onUploaded()
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const addRow = () => {
    onChange({
      ...session,
      rows: [...session.rows, {
        teamA: [null, null], teamARaw: [undefined, undefined],
        scoreA: '', scoreB: '',
        teamB: [null, null], teamBRaw: [undefined, undefined],
      }],
    })
  }

  if (uploaded) {
    return (
      <Card className="opacity-50">
        <CardHeader className="py-3 px-4 text-sm text-muted-foreground">
          ✓ {session.dateStr} — {session.rows.length} games uploaded
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 py-3 px-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Date</span>
          <Input
            type="date"
            value={session.dateStr}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-xs text-muted-foreground">
          Remove
        </Button>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-1 pr-2 text-left font-medium">#</th>
                <th className="pb-1 pr-1 text-left font-medium">Team A P1</th>
                <th className="pb-1 pr-2 text-left font-medium">Team A P2</th>
                <th className="pb-1 pr-1 text-center font-medium">A</th>
                <th className="pb-1 pr-1 text-center font-medium">B</th>
                <th className="pb-1 pr-1 text-left font-medium">Team B P1</th>
                <th className="pb-1 text-left font-medium">Team B P2</th>
              </tr>
            </thead>
            <tbody>
              {session.rows.map((row, i) => {
                const errs = rowErrors[i]
                return (
                  <tr key={i} className={errs ? 'bg-destructive/5' : ''}>
                    <td className="py-0.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-0.5 pr-1">
                      <PlayerSelect
                        value={row.teamA[0]}
                        rawName={row.teamARaw[0]}
                        onChange={(id) => updateRow(i, { teamA: [id, row.teamA[1]] })}
                        players={players}
                        onPlayerCreated={onPlayerCreated}
                      />
                    </td>
                    <td className="py-0.5 pr-2">
                      <PlayerSelect
                        value={row.teamA[1]}
                        rawName={row.teamARaw[1]}
                        onChange={(id) => updateRow(i, { teamA: [row.teamA[0], id] })}
                        players={players}
                        onPlayerCreated={onPlayerCreated}
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <Input
                        type="number"
                        value={row.scoreA}
                        onChange={(e) => updateRow(i, { scoreA: e.target.value })}
                        className="h-8 w-14 text-center text-sm"
                        min={0}
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <Input
                        type="number"
                        value={row.scoreB}
                        onChange={(e) => updateRow(i, { scoreB: e.target.value })}
                        className="h-8 w-14 text-center text-sm"
                        min={0}
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <PlayerSelect
                        value={row.teamB[0]}
                        rawName={row.teamBRaw[0]}
                        onChange={(id) => updateRow(i, { teamB: [id, row.teamB[1]] })}
                        players={players}
                        onPlayerCreated={onPlayerCreated}
                      />
                    </td>
                    <td className="py-0.5">
                      <PlayerSelect
                        value={row.teamB[1]}
                        rawName={row.teamBRaw[1]}
                        onChange={(id) => updateRow(i, { teamB: [row.teamB[0], id] })}
                        players={players}
                        onPlayerCreated={onPlayerCreated}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {Object.keys(rowErrors).length > 0 && (
          <div className="mt-2 space-y-0.5">
            {Object.entries(rowErrors).map(([idx, errs]) =>
              errs.map((e) => (
                <p key={e} className="text-xs text-destructive">Row {Number(idx) + 1}: {e}</p>
              ))
            )}
          </div>
        )}

        {uploadError && <p className="mt-2 text-xs text-destructive">{uploadError}</p>}

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={addRow}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            + Add row
          </button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={!isFullyResolved || validating}
            >
              {validating ? 'Validating…' : 'Validate'}
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={!isValid || uploading}
            >
              {uploading ? 'Uploading…' : 'Upload session'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
