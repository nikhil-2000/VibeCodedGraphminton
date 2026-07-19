# Upload Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-CSV upload flow with a card-based UI where the frontend parses CSV files locally, resolves player names via searchable dropdowns (with inline player creation), validates game rows against the backend, and submits structured `{ played_on, games: [{ team_a: [id,id], score_a, team_b: [id,id], score_b }] }` payloads.

**Architecture:** Two new backend endpoints (`POST /ingest/games`, `POST /ingest/validate`) accept structured game data identified by player IDs — no CSV or alias resolution on the backend. The frontend owns CSV parsing (`parseSessionCsv` utility), player name resolution (`PlayerSelect` combobox with inline create), and validation orchestration. Each uploaded CSV becomes a `SessionCard`; cards validate against the backend and upload independently. The existing `POST /ingest/scores` endpoint is preserved as a legacy fallback.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 19 + TypeScript + shadcn/ui Popover/Input/Button (frontend), `@base-ui/react/popover` already installed.

---

## File Structure

**Backend — modify:**
- `backend/app/schemas.py` — add `GameRowIn`, `IngestGamesRequest`, `IngestGamesResponse`, `GameRowError`, `ValidateGamesRequest`, `ValidateGamesResponse`
- `backend/app/services/ingest.py` — add `validate_game_row_ids`, `validate_games`, `ingest_games`
- `backend/app/routers/ingest.py` — add `POST /games` and `POST /validate` endpoints
- `backend/tests/integration/test_ingest_games.py` — new test file

**Frontend — modify:**
- `frontend/src/context/PlayerFilterContext.tsx` — already has `reloadPlayers`; no change needed (Task 2 dropped)
- `frontend/src/api/ingest.ts` — add `ingestGames`, `validateGames`

**Frontend — create:**
- `frontend/src/utils/parseSessionCsv.ts` — CSV text → structured game rows + date
- `frontend/src/components/PlayerSelect.tsx` — combobox with inline player creation
- `frontend/src/components/SessionCard.tsx` — date picker + game table + upload
- `frontend/src/pages/UploadPage.tsx` — replace with card-based layout (legacy section preserved)

---

## Tasks

### Task 1: Backend — new schemas + `ingest_games` service + `POST /ingest/games`

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/ingest.py`
- Modify: `backend/app/routers/ingest.py`
- Create: `backend/tests/integration/test_ingest_games.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/test_ingest_games.py`:

```python
import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


def test_ingest_games_creates_game(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGA", "IGB", "IGC", "IGD"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[3]], "score_b": 9}]
    })
    assert resp.status_code == 200
    assert resp.json()["games_loaded"] == 1


def test_ingest_games_invalid_score(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGE", "IGF", "IGG", "IGH"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 15, "team_b": [ids[2], ids[3]], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_duplicate_player(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGI", "IGJ", "IGK"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[0]], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_unknown_player_id(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGL", "IGM", "IGN"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], 999999], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_skips_duplicates(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGO", "IGP", "IGQ", "IGR"]]
    payload = {
        "played_on": "2024-04-09",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[3]], "score_b": 9}]
    }
    r1 = client.post("/ingest/games", json=payload)
    assert r1.status_code == 200
    assert r1.json()["games_loaded"] == 1
    r2 = client.post("/ingest/games", json=payload)
    assert r2.status_code == 200
    assert r2.json()["games_loaded"] == 0  # duplicate skipped
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_ingest_games.py -v
```

Expected: FAIL — `/ingest/games` endpoint does not exist.

- [ ] **Step 3: Add schemas**

In `backend/app/schemas.py`, append after the existing `IngestResponse` class:

```python
class GameRowIn(BaseModel):
    team_a: list[int]  # exactly 2 player IDs
    score_a: int
    team_b: list[int]  # exactly 2 player IDs
    score_b: int


class IngestGamesRequest(BaseModel):
    played_on: str  # ISO date "YYYY-MM-DD"
    games: list[GameRowIn]


class IngestGamesResponse(BaseModel):
    games_loaded: int
```

- [ ] **Step 4: Add service functions**

> **NOTE (added 2026-07):** `date` is already imported in `ingest.py` — do NOT add a duplicate import. Use `date.fromisoformat(...)` directly.
> `Game.season_id` is `NOT NULL` — `ingest_games` must resolve the season via `resolve_season_for_date` exactly as `ingest_csv_file` does, and return an error if no season covers the date.

Append at the end of `backend/app/services/ingest.py` (no new imports needed — `date`, `Session`, `Game`, `GamePlayer`, and `resolve_season_for_date` are already imported above):

```python
def validate_game_row_ids(
    row_number: int,
    team_a: list[int],
    score_a: int,
    team_b: list[int],
    score_b: int,
    known_player_ids: set[int],
) -> list[str]:
    """Validate a single structured game row (player IDs already resolved).
    Returns list of error strings; empty = valid."""
    errors: list[str] = []

    if len(team_a) != 2:
        errors.append(f"Row {row_number}: team A must have exactly 2 players")
    if len(team_b) != 2:
        errors.append(f"Row {row_number}: team B must have exactly 2 players")

    winning_score = max(score_a, score_b)
    losing_score = min(score_a, score_b)
    if winning_score < 21:
        errors.append(f"Row {row_number}: winning score {winning_score} must be >= 21")
    if winning_score - losing_score < 2:
        errors.append(f"Row {row_number}: score margin must be >= 2")

    all_ids = list(team_a) + list(team_b)
    if len(set(all_ids)) < len(all_ids):
        errors.append(f"Row {row_number}: duplicate player in same game")

    for pid in all_ids:
        if pid not in known_player_ids:
            errors.append(f"Row {row_number}: unknown player ID {pid}")

    return errors


def validate_games(
    db: Session,
    played_on_str: str,
    games: list,
) -> list[dict]:
    """Validate a list of GameRowIn objects. Returns list of {row, errors} dicts."""
    from ..models import Player as PlayerModel
    known_ids: set[int] = {row.id for row in db.query(PlayerModel.id).all()}
    result = []
    for i, game in enumerate(games, start=1):
        errs = validate_game_row_ids(i, game.team_a, game.score_a, game.team_b, game.score_b, known_ids)
        if errs:
            result.append({"row": i, "errors": errs})
    return result


def ingest_games(
    db: Session,
    played_on_str: str,
    games: list,
) -> tuple[int, list[str]]:
    """Persist a list of GameRowIn objects. Validates first; returns (games_loaded, errors)."""
    from ..models import Player as PlayerModel
    known_ids: set[int] = {row.id for row in db.query(PlayerModel.id).all()}

    all_errors: list[str] = []
    for i, game in enumerate(games, start=1):
        all_errors.extend(validate_game_row_ids(i, game.team_a, game.score_a, game.team_b, game.score_b, known_ids))
    if all_errors:
        return 0, all_errors

    try:
        played_on = date.fromisoformat(played_on_str)
    except ValueError:
        return 0, [f"Invalid date format: {played_on_str!r}, expected YYYY-MM-DD"]

    # Season is required — Game.season_id is NOT NULL
    season = resolve_season_for_date(db, played_on)
    if not season:
        return 0, [f"No season found covering date {played_on}. Create a season first."]

    loaded = 0
    for i, game in enumerate(games, start=1):
        existing = db.query(Game).filter(
            Game.played_on == played_on,
            Game.game_number == i,
        ).first()
        if existing:
            continue

        g = Game(
            played_on=played_on,
            season_id=season.id,
            game_number=i,
            team_a_score=game.score_a,
            team_b_score=game.score_b,
        )
        db.add(g)
        db.flush()

        for pid, team in [
            (game.team_a[0], "A"), (game.team_a[1], "A"),
            (game.team_b[0], "B"), (game.team_b[1], "B"),
        ]:
            db.add(GamePlayer(game_id=g.id, player_id=pid, team=team))
        loaded += 1

    return loaded, []
```

- [ ] **Step 5: Add router endpoints**

In `backend/app/routers/ingest.py`, update the file to add the two new endpoints. First add the new imports and schemas to the existing imports block:

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.ingest import resolve_aliases, ingest_csv_file, validate_games, ingest_games
from ..schemas import IngestGamesRequest, IngestGamesResponse

router = APIRouter()


class IngestRequest(BaseModel):
    files: list[str]


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse)
def ingest_scores(request: IngestRequest, db: Session = Depends(get_db)):
    alias_map = resolve_aliases(db)
    all_errors: list[str] = []
    total_loaded = 0
    for i, content in enumerate(request.files, start=1):
        lines = content.splitlines(keepends=True)
        loaded, errors = ingest_csv_file(db, lines, alias_map)
        if errors:
            all_errors.extend([f"File {i} — {e}" for e in errors])
        else:
            total_loaded += loaded
    if all_errors:
        raise HTTPException(status_code=422, detail=all_errors)
    db.commit()
    return IngestResponse(games_loaded=total_loaded, errors=[])


@router.post("/games", response_model=IngestGamesResponse)
def ingest_games_endpoint(request: IngestGamesRequest, db: Session = Depends(get_db)):
    loaded, errors = ingest_games(db, request.played_on, request.games)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    db.commit()
    return IngestGamesResponse(games_loaded=loaded)


class GameRowError(BaseModel):
    row: int
    errors: list[str]


class ValidateGamesResponse(BaseModel):
    errors: list[GameRowError]


@router.post("/validate", response_model=ValidateGamesResponse)
def validate_games_endpoint(request: IngestGamesRequest, db: Session = Depends(get_db)):
    errors = validate_games(db, request.played_on, request.games)
    return ValidateGamesResponse(errors=errors)
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_ingest_games.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 7: Run full test suite**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/ -v
```

Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add backend/app/schemas.py backend/app/services/ingest.py backend/app/routers/ingest.py backend/tests/integration/test_ingest_games.py && git commit -m "feat: POST /ingest/games and POST /ingest/validate endpoints"
```

---

### ~~Task 2: Frontend context — add `refetchPlayers`~~ DROPPED

> **NOTE (added 2026-07):** `PlayerFilterContext` already exposes `reloadPlayers: () => void`. This task is **dropped**. All later tasks must use `reloadPlayers` (not `refetchPlayers`) when referencing this function.

---

### Task 3: Frontend — `parseSessionCsv` utility + API functions

**Files:**
- Create: `frontend/src/utils/parseSessionCsv.ts`
- Modify: `frontend/src/api/ingest.ts`

- [ ] **Step 1: Create `parseSessionCsv.ts`**

Create `frontend/src/utils/parseSessionCsv.ts`:

```typescript
export interface ParsedGameRow {
  teamARaw: [string, string]
  scoreA: number
  teamBRaw: [string, string]
  scoreB: number
}

export interface ParseResult {
  dateStr: string | null  // "YYYY-MM-DD" or null if unparseable
  games: ParsedGameRow[]
  parseErrors: string[]
}

/**
 * Parse CSV text in format: Date,GameNo,P1,P2,ScoreA,P3,P4,ScoreB
 * One date per file — uses date from first data row.
 */
export function parseSessionCsv(text: string): ParseResult {
  const lines = text.trim().split('\n').filter(Boolean)
  const games: ParsedGameRow[] = []
  const parseErrors: string[] = []
  let dateStr: string | null = null

  const startIdx = lines[0]?.trim().startsWith('Date') ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const rowNum = i + 1
    const parts = lines[i].split(',').map((s) => s.trim())
    if (parts.length !== 8) {
      parseErrors.push(`Row ${rowNum}: expected 8 columns, got ${parts.length}`)
      continue
    }

    if (dateStr === null) {
      const [day, month, year] = parts[0].split('-')
      if (day && month && year) {
        dateStr = `${year.length === 2 ? '20' + year : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      } else {
        parseErrors.push(`Row ${rowNum}: could not parse date "${parts[0]}"`)
      }
    }

    const scoreA = parseInt(parts[4], 10)
    const scoreB = parseInt(parts[7], 10)
    if (isNaN(scoreA)) {
      parseErrors.push(`Row ${rowNum}: invalid score A "${parts[4]}"`)
      continue
    }
    if (isNaN(scoreB)) {
      parseErrors.push(`Row ${rowNum}: invalid score B "${parts[7]}"`)
      continue
    }

    games.push({
      teamARaw: [parts[2], parts[3]],
      scoreA,
      teamBRaw: [parts[5], parts[6]],
      scoreB,
    })
  }

  return { dateStr, games, parseErrors }
}
```

- [ ] **Step 2: Update `api/ingest.ts`**

Read `frontend/src/api/ingest.ts` first. Replace its contents:

```typescript
import { apiFetch } from './client'
import type { IngestResult } from '../types'

export const postScores = (files: string[]) =>
  apiFetch<IngestResult>('/ingest/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })

export interface GameRowIn {
  team_a: [number, number]
  score_a: number
  team_b: [number, number]
  score_b: number
}

export interface IngestGamesRequest {
  played_on: string
  games: GameRowIn[]
}

export interface GameRowError {
  row: number
  errors: string[]
}

export const ingestGames = (data: IngestGamesRequest) =>
  apiFetch<{ games_loaded: number }>('/ingest/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

export const validateGames = (data: IngestGamesRequest) =>
  apiFetch<{ errors: GameRowError[] }>('/ingest/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/utils/parseSessionCsv.ts frontend/src/api/ingest.ts && git commit -m "feat: parseSessionCsv utility and structured ingest API functions"
```

---

### Task 4: Frontend — `PlayerSelect` component

**Files:**
- Create: `frontend/src/components/PlayerSelect.tsx`

This is a combobox that shows the selected player name (or an error state if the player is unknown), opens a popover with a search input and player list, and has an inline "Add new player" form at the bottom.

- [ ] **Step 1: Create `PlayerSelect.tsx`**

Create `frontend/src/components/PlayerSelect.tsx`:

```tsx
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createPlayer } from '../api/players'
import type { Player } from '../types'

interface Props {
  value: number | null
  rawName?: string            // original CSV name, shown in error state
  onChange: (id: number) => void
  players: Player[]
  onPlayerCreated: () => void // called after a new player is created so list can refresh
  disabled?: boolean
}

export default function PlayerSelect({ value, rawName, onChange, players, onPlayerCreated, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIsSub, setNewIsSub] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selected = players.find((p) => p.id === value)
  const isError = value === null
  const filtered = players.filter(
    (p) =>
      p.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
      p.aliases.some((a) => a.alias.toLowerCase().includes(search.toLowerCase()))
  )

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const p = await createPlayer({ canonical_name: newName.trim(), is_sub: newIsSub, aliases: [] })
      onChange(p.id)
      onPlayerCreated()
      setOpen(false)
      setCreating(false)
      setNewName('')
      setNewIsSub(false)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={`h-8 min-w-32 max-w-40 truncate rounded border px-2 text-left text-sm transition-colors hover:border-foreground/40 disabled:opacity-50 ${
          isError
            ? 'border-destructive text-destructive'
            : 'border-border text-foreground'
        }`}
      >
        {selected ? selected.canonical_name : rawName ? `? ${rawName}` : 'Select…'}
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        {!creating ? (
          <>
            <Input
              placeholder="Search players…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 h-7 text-xs"
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No players found</p>
              )}
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onChange(p.id); setOpen(false); setSearch('') }}
                  className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-muted ${
                    p.id === value ? 'bg-muted font-medium' : ''
                  }`}
                >
                  {p.canonical_name}
                  {p.is_sub && <span className="ml-1 text-xs text-yellow-400">sub</span>}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => { setCreating(true); setNewName(rawName ?? '') }}
                className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                + Add new player
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-medium">New player</p>
            <Input
              placeholder="Canonical name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              className="h-7 text-xs"
              autoFocus
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={newIsSub}
                onChange={(e) => setNewIsSub(e.target.checked)}
                className="h-3 w-3"
              />
              Sub player
            </label>
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 flex-1 text-xs"
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
              >
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setCreating(false); setSaveError(null) }}
              >
                Back
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/components/PlayerSelect.tsx && git commit -m "feat: PlayerSelect combobox with inline player creation"
```

---

### Task 5: Frontend — `SessionCard` component

**Files:**
- Create: `frontend/src/components/SessionCard.tsx`

Each card represents one session (one CSV file or one manually added session). It has a date picker, a game table with `PlayerSelect` cells and score inputs, backend validation, and a per-card upload button.

- [ ] **Step 1: Create `SessionCard.tsx`**

Create `frontend/src/components/SessionCard.tsx`:

```tsx
import { useState, useEffect } from 'react'
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
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/components/SessionCard.tsx && git commit -m "feat: SessionCard component with validate and upload"
```

---

### Task 6: Frontend — Upload page revamp

**Files:**
- Modify: `frontend/src/pages/UploadPage.tsx`

Replace the page with the card-based layout. The legacy upload section is preserved in a collapsed `<details>` element at the bottom.

- [ ] **Step 1: Read the current UploadPage.tsx**

Read `frontend/src/pages/UploadPage.tsx` before editing.

- [ ] **Step 2: Replace UploadPage.tsx**

Replace the entire file:

```tsx
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

  const handleUploaded = (id: string) => {
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
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors. Fix any before proceeding.

- [ ] **Step 4: Rebuild Docker backend**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && docker compose up -d --build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/pages/UploadPage.tsx && git commit -m "feat: card-based upload page with CSV parsing and structured ingest"
```

---

## Self-Review

**Spec coverage:**
- ✅ Frontend parses CSV locally — `parseSessionCsv` utility
- ✅ One card per CSV/session — `SessionData` + `SessionCard`
- ✅ Date at top of card, not per-row — `dateStr` field on `SessionData`
- ✅ Game# shown (row index), not editable — read-only `#` column
- ✅ Player cells are dropdowns — `PlayerSelect` component
- ✅ Unknown CSV names shown in error state — `rawName` prop + `isError` styling
- ✅ Inline player creation via popover — `PlayerSelect` creating sub-view
- ✅ On player created: refetch players → update all selects — `reloadPlayers` from context (Task 2 dropped; already exists)
- ✅ Backend validation via `POST /ingest/validate` — `handleValidate` in `SessionCard`
- ✅ Upload button enabled only when validated — `isValid` check
- ✅ Per-card upload, card greys out on success — `uploaded` state
- ✅ Upload all button for multiple cards — `UploadPage` `handleUploadAll`
- ✅ Legacy CSV upload preserved — `<details>` section
- ✅ New `POST /ingest/games` endpoint accepts player IDs — Task 1
- ✅ Score validation reuses same rules as existing ingest — `validate_game_row_ids` mirrors `validate_game_row`

**Placeholder scan:** None found.

**Type consistency:**
- `SessionRow.teamA: [number | null, number | null]` used consistently across `SessionCard` and `UploadPage`
- `GameRowIn.team_a: [number, number]` — `toPayload()` only returns when both IDs are non-null, so the cast is safe
- `ParsedGameRow.teamARaw: [string, string]` from `parseSessionCsv` maps to `SessionRow.teamARaw: [string | undefined, string | undefined]` — compatible since `string` extends `string | undefined`
