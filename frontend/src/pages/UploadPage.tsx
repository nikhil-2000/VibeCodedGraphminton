import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import SessionCard, { type SessionData, type SessionRow } from '../components/SessionCard'
import { parseSessionCsv } from '../utils/parseSessionCsv'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { postScores } from '../api/ingest'

let nextId = 1
const makeId = () => String(nextId++)

function csvToSessionData(csvText: string): SessionData {
  const { dateStr, games, parseErrors } = parseSessionCsv(csvText)
  const rows: SessionRow[] = games.map((g) => ({
    teamA: [null, null],
    teamARaw: g.teamARaw,
    scoreA: g.scoreA,
    teamB: [null, null],
    teamBRaw: g.teamBRaw,
    scoreB: g.scoreB,
  }))
  return { id: makeId(), dateStr: dateStr ?? '', rows }
}

export default function UploadPage() {
  const { allPlayers, reloadPlayers } = usePlayerFilter()
  const [sessions, setSessions] = useState<SessionData[]>([])
  const [uploadAllError, setUploadAllError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Legacy upload state
  const [legacyText, setLegacyText] = useState('')
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [legacyResult, setLegacyResult] = useState<string | null>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        setSessions((prev) => [...prev, csvToSessionData(text)])
      }
      reader.readAsText(file)
    })
  }

  const addBlankSession = () => {
    setSessions((prev) => [...prev, {
      id: makeId(),
      dateStr: '',
      rows: [{
        teamA: [null, null], teamARaw: [undefined, undefined],
        scoreA: '', scoreB: '',
        teamB: [null, null], teamBRaw: [undefined, undefined],
      }],
    }])
  }

  const updateSession = (id: string, updated: SessionData) => {
    setSessions((prev) => prev.map((s) => s.id === id ? updated : s))
  }

  const removeSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  const handleUploaded = (_id: string) => {
    // SessionCard greys itself out; we just track it for "upload all"
  }

  const handleUploadAll = async () => {
    setUploadAllError(null)
    // Trigger upload on each card by dispatching a custom event they listen to
    // Simple approach: find all "Upload session" buttons and click them
    document.querySelectorAll<HTMLButtonElement>('[data-upload-btn]').forEach((btn) => {
      if (!btn.disabled) btn.click()
    })
  }

  // Legacy upload
  const handleLegacyUpload = async () => {
    setLegacyLoading(true)
    setLegacyResult(null)
    try {
      const result = await postScores([legacyText])
      setLegacyResult(`Loaded ${result.games_loaded} games`)
    } catch (e) {
      setLegacyResult(`Error: ${(e as Error).message}`)
    } finally {
      setLegacyLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Upload CSV
          </Button>
          <Button variant="outline" size="sm" onClick={addBlankSession}>
            Add session manually
          </Button>
          {sessions.length > 1 && (
            <Button size="sm" onClick={handleUploadAll}>
              Upload all
            </Button>
          )}
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
          <p className="text-sm">Upload a CSV or add a session manually to get started</p>
        </div>
      )}

      <div className="space-y-4">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            players={allPlayers}
            onPlayerCreated={reloadPlayers}
            onChange={(updated) => updateSession(session.id, updated)}
            onRemove={() => removeSession(session.id)}
            onUploaded={() => handleUploaded(session.id)}
          />
        ))}
      </div>

      {uploadAllError && <p className="text-sm text-destructive">{uploadAllError}</p>}

      {/* Legacy upload — preserved until new flow is confirmed */}
      <details className="mt-8">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Legacy upload (raw CSV)
        </summary>
        <div className="mt-3 space-y-3">
          <textarea
            className="w-full rounded border border-border bg-background p-2 font-mono text-xs"
            rows={8}
            placeholder="Paste raw CSV content here…"
            value={legacyText}
            onChange={(e) => setLegacyText(e.target.value)}
          />
          <Button size="sm" onClick={handleLegacyUpload} disabled={!legacyText.trim() || legacyLoading}>
            {legacyLoading ? 'Uploading…' : 'Upload'}
          </Button>
          {legacyResult && <p className="text-sm">{legacyResult}</p>}
        </div>
      </details>
    </div>
  )
}
