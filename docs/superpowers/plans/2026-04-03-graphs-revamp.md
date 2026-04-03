# Graphs Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the force-graph visualization with a "Trends" page showing five data-rich views: Win% over time (line), Avg points over time (line), Form heatmap (session × game grid), Partnership frequency matrix (N×N), and Partnership strength matrix (N×N).

**Architecture:** One new backend endpoint `GET /stats/time-series?player_id=X` returns per-session aggregates plus individual game outcomes for a single player. The frontend's `GraphPage` is completely rewritten with a player selector at the top (drives the three player-specific charts) and two partnership matrices that use the existing `GET /stats/partnerships` endpoint filtered through the global player filter. Recharts renders the two line charts; the heatmap and matrices use CSS grid.

**Tech Stack:** FastAPI + SQLAlchemy (backend), Recharts + React 19 + TypeScript + Tailwind v4 (frontend).

---

## File Structure

**Backend — modify:**
- `backend/app/schemas.py` — add `GameOutcome`, `SessionStats`, `TimeSeriesResponse`
- `backend/app/services/stats.py` — add `get_time_series`
- `backend/app/routers/stats.py` — add `GET /time-series`

**Backend — create:**
- `backend/tests/integration/test_time_series.py`

**Frontend — modify:**
- `frontend/package.json` — add recharts
- `frontend/src/api/stats.ts` — add `getTimeSeries`
- `frontend/src/pages/GraphPage.tsx` — complete rewrite

**Frontend — create:**
- `frontend/src/components/WinRateChart.tsx` + `.test.tsx`
- `frontend/src/components/AvgPointsChart.tsx` + `.test.tsx`
- `frontend/src/components/FormHeatmap.tsx` + `.test.tsx`
- `frontend/src/components/PartnershipMatrix.tsx` + `.test.tsx`

---

## Tasks

### Task 1: Backend time-series endpoint + tests

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/stats.py`
- Modify: `backend/app/routers/stats.py`
- Create: `backend/tests/integration/test_time_series.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/test_time_series.py`:

```python
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models import Player, Game, GamePlayer

client = TestClient(app)


@pytest.fixture()
def two_session_fixture(db: Session):
    alice = Player(canonical_name="Alice", is_sub=False)
    bob = Player(canonical_name="Bob", is_sub=False)
    chan = Player(canonical_name="Chan", is_sub=False)
    jay = Player(canonical_name="Jay", is_sub=False)
    db.add_all([alice, bob, chan, jay])
    db.flush()

    # Session 1: 2 games, Alice wins both
    g1 = Game(played_on=date(2024, 4, 1), game_number=1, team_a_score=21, team_b_score=9)
    g2 = Game(played_on=date(2024, 4, 1), game_number=2, team_a_score=18, team_b_score=15)
    # Session 2: 2 games, Alice wins 1, loses 1
    g3 = Game(played_on=date(2024, 4, 8), game_number=1, team_a_score=21, team_b_score=10)
    g4 = Game(played_on=date(2024, 4, 8), game_number=2, team_a_score=9, team_b_score=21)
    db.add_all([g1, g2, g3, g4])
    db.flush()

    # Alice on team A for g1, g2, g3; team B for g4
    db.add_all([
        GamePlayer(game_id=g1.id, player_id=alice.id, team="A"),
        GamePlayer(game_id=g1.id, player_id=bob.id, team="A"),
        GamePlayer(game_id=g1.id, player_id=chan.id, team="B"),
        GamePlayer(game_id=g1.id, player_id=jay.id, team="B"),
        GamePlayer(game_id=g2.id, player_id=alice.id, team="A"),
        GamePlayer(game_id=g2.id, player_id=bob.id, team="A"),
        GamePlayer(game_id=g2.id, player_id=chan.id, team="B"),
        GamePlayer(game_id=g2.id, player_id=jay.id, team="B"),
        GamePlayer(game_id=g3.id, player_id=alice.id, team="A"),
        GamePlayer(game_id=g3.id, player_id=bob.id, team="A"),
        GamePlayer(game_id=g3.id, player_id=chan.id, team="B"),
        GamePlayer(game_id=g3.id, player_id=jay.id, team="B"),
        GamePlayer(game_id=g4.id, player_id=alice.id, team="B"),
        GamePlayer(game_id=g4.id, player_id=bob.id, team="B"),
        GamePlayer(game_id=g4.id, player_id=chan.id, team="A"),
        GamePlayer(game_id=g4.id, player_id=jay.id, team="A"),
    ])
    db.commit()
    db.refresh(alice)
    return {"alice": alice, "bob": bob, "chan": chan, "jay": jay}


def test_time_series_session_count(two_session_fixture):
    alice_id = two_session_fixture["alice"].id
    resp = client.get(f"/stats/time-series?player_id={alice_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["player_id"] == alice_id
    assert len(data["sessions"]) == 2


def test_time_series_session_1_stats(two_session_fixture):
    alice_id = two_session_fixture["alice"].id
    resp = client.get(f"/stats/time-series?player_id={alice_id}")
    s1 = resp.json()["sessions"][0]
    assert s1["session"] == 1
    assert s1["games_played"] == 2
    assert s1["wins"] == 2
    assert s1["losses"] == 0
    assert s1["win_rate"] == 1.0
    assert s1["avg_points_for"] == 19.5   # (21+18)/2
    assert s1["avg_points_against"] == 12.0  # (9+15)/2


def test_time_series_session_2_stats(two_session_fixture):
    alice_id = two_session_fixture["alice"].id
    resp = client.get(f"/stats/time-series?player_id={alice_id}")
    s2 = resp.json()["sessions"][1]
    assert s2["wins"] == 1
    assert s2["losses"] == 1
    assert s2["win_rate"] == 0.5


def test_time_series_includes_game_outcomes(two_session_fixture):
    alice_id = two_session_fixture["alice"].id
    resp = client.get(f"/stats/time-series?player_id={alice_id}")
    s1 = resp.json()["sessions"][0]
    assert len(s1["games"]) == 2
    assert all(g["won"] for g in s1["games"])
    s2 = resp.json()["sessions"][1]
    won_values = [g["won"] for g in s2["games"]]
    assert True in won_values and False in won_values


def test_time_series_player_ids_filter(two_session_fixture):
    alice_id = two_session_fixture["alice"].id
    bob_id = two_session_fixture["bob"].id
    chan_id = two_session_fixture["chan"].id
    jay_id = two_session_fixture["jay"].id
    # Filter that excludes chan and jay → none of Alice's games qualify
    resp = client.get(
        f"/stats/time-series?player_id={alice_id}&player_ids={alice_id}&player_ids={bob_id}"
    )
    assert resp.status_code == 200
    assert resp.json()["sessions"] == []


def test_time_series_not_found():
    resp = client.get("/stats/time-series?player_id=99999")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run failing tests**

```bash
cd backend && python -m pytest tests/integration/test_time_series.py -v
```

Expected: FAIL — `GET /stats/time-series` does not exist yet.

- [ ] **Step 3: Add schemas to `backend/app/schemas.py`**

Append to the bottom of `backend/app/schemas.py`:

```python
# --- Time Series ---

class GameOutcome(BaseModel):
    game_number: int
    won: bool
    score_for: int
    score_against: int


class SessionStats(BaseModel):
    session: int
    played_on: date
    games_played: int
    wins: int
    losses: int
    win_rate: float
    avg_points_for: float
    avg_points_against: float
    games: list[GameOutcome]


class TimeSeriesResponse(BaseModel):
    player_id: int
    sessions: list[SessionStats]
```

Add `from datetime import date` at the top of `schemas.py` if not already imported.

- [ ] **Step 4: Add `get_time_series` to `backend/app/services/stats.py`**

Add these imports at the top of `stats.py` (after existing imports):

```python
from itertools import groupby
from .games import _session_rank
```

Append the function to `stats.py`:

```python
def get_time_series(
    db: Session, player_id: int, player_ids: list[int] | None = None
) -> dict[str, Any]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    valid_ids = _valid_game_ids(player_ids)

    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_for_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    points_against_case = case(
        (GamePlayer.team == "A", Game.team_b_score),
        else_=Game.team_a_score,
    )

    q = (
        db.query(
            _session_rank.c.session,
            Game.played_on,
            Game.game_number,
            won_case.label("won"),
            points_for_case.label("score_for"),
            points_against_case.label("score_against"),
        )
        .join(GamePlayer, GamePlayer.game_id == Game.id)
        .join(_session_rank, _session_rank.c.played_on == Game.played_on)
        .filter(GamePlayer.player_id == player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))

    rows = q.order_by(_session_rank.c.session, Game.game_number).all()

    sessions = []
    for session_num, group in groupby(rows, key=lambda r: r.session):
        game_rows = list(group)
        wins = sum(r.won for r in game_rows)
        games_played = len(game_rows)
        avg_pf = sum(r.score_for for r in game_rows) / games_played
        avg_pa = sum(r.score_against for r in game_rows) / games_played
        sessions.append({
            "session": session_num,
            "played_on": game_rows[0].played_on,
            "games_played": games_played,
            "wins": wins,
            "losses": games_played - wins,
            "win_rate": round(wins / games_played, 4) if games_played else 0.0,
            "avg_points_for": round(avg_pf, 2),
            "avg_points_against": round(avg_pa, 2),
            "games": [
                {
                    "game_number": r.game_number,
                    "won": bool(r.won),
                    "score_for": r.score_for,
                    "score_against": r.score_against,
                }
                for r in game_rows
            ],
        })

    return {"player_id": player_id, "sessions": sessions}
```

- [ ] **Step 5: Add endpoint to `backend/app/routers/stats.py`**

Add `TimeSeriesResponse` to the existing import from `..schemas` in `stats.py`:

```python
from ..schemas import (
    LeaderboardEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    PlayerStatsResponse,
    HeadToHeadResponse,
    MatchupResponse,
    TimeSeriesResponse,
)
```

Append the endpoint to `backend/app/routers/stats.py`:

```python
@router.get("/time-series", response_model=TimeSeriesResponse)
def time_series(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_time_series(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 6: Run the tests**

```bash
cd backend && python -m pytest tests/integration/test_time_series.py -v
```

Expected: all 6 tests pass.

- [ ] **Step 7: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/services/stats.py backend/app/routers/stats.py backend/tests/integration/test_time_series.py
git commit -m "feat: GET /stats/time-series with per-session aggregates and game outcomes"
```

---

### Task 2: Install recharts + add `getTimeSeries` API function

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `frontend/src/api/stats.ts`

- [ ] **Step 1: Install recharts**

```bash
cd frontend && npm install recharts
```

Expected: `recharts` appears in `package.json` dependencies. Recharts ships its own TypeScript types — no `@types/recharts` needed.

- [ ] **Step 2: Add TypeScript types and `getTimeSeries` to `frontend/src/api/stats.ts`**

Open `frontend/src/api/stats.ts`. Add the following types and function (append to the bottom of the file):

```typescript
export interface GameOutcome {
  game_number: number
  won: boolean
  score_for: number
  score_against: number
}

export interface SessionStats {
  session: number
  played_on: string
  games_played: number
  wins: number
  losses: number
  win_rate: number
  avg_points_for: number
  avg_points_against: number
  games: GameOutcome[]
}

export interface TimeSeriesResponse {
  player_id: number
  sessions: SessionStats[]
}

export const getTimeSeries = (
  playerId: number,
  playerIds?: number[],
): Promise<TimeSeriesResponse> => {
  const params = new URLSearchParams({ player_id: String(playerId) })
  playerIds?.forEach((id) => params.append('player_ids', String(id)))
  return apiFetch<TimeSeriesResponse>(`/stats/time-series?${params}`)
}
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/stats.ts
git commit -m "feat: install recharts and add getTimeSeries API function"
```

---

### Task 3: WinRateChart component

**Files:**
- Create: `frontend/src/components/WinRateChart.tsx`
- Create: `frontend/src/components/WinRateChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/WinRateChart.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WinRateChart from './WinRateChart'
import type { SessionStats } from '../api/stats'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const sessions: SessionStats[] = [
  { session: 1, played_on: '2024-04-01', games_played: 4, wins: 3, losses: 1, win_rate: 0.75, avg_points_for: 18, avg_points_against: 12, games: [] },
  { session: 2, played_on: '2024-04-08', games_played: 4, wins: 2, losses: 2, win_rate: 0.5, avg_points_for: 16, avg_points_against: 15, games: [] },
]

describe('WinRateChart', () => {
  it('renders a line chart', () => {
    render(<WinRateChart sessions={sessions} />)
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('renders empty state when no sessions', () => {
    render(<WinRateChart sessions={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npm test -- --run WinRateChart
```

Expected: FAIL — `WinRateChart` module not found.

- [ ] **Step 3: Create `frontend/src/components/WinRateChart.tsx`**

```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { SessionStats } from '../api/stats'

interface Props {
  sessions: SessionStats[]
}

export default function WinRateChart({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>
  }

  const data = sessions.map((s) => ({
    session: `S${s.session}`,
    winRate: Math.round(s.win_rate * 100),
  }))

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Win rate over time (%)</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="session" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
          <Tooltip formatter={(v: number) => [`${v}%`, 'Win rate']} />
          <Line
            type="monotone"
            dataKey="winRate"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run WinRateChart
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/WinRateChart.tsx frontend/src/components/WinRateChart.test.tsx
git commit -m "feat: WinRateChart line chart component"
```

---

### Task 4: AvgPointsChart component

**Files:**
- Create: `frontend/src/components/AvgPointsChart.tsx`
- Create: `frontend/src/components/AvgPointsChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/AvgPointsChart.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AvgPointsChart from './AvgPointsChart'
import type { SessionStats } from '../api/stats'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="avg-points-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const sessions: SessionStats[] = [
  { session: 1, played_on: '2024-04-01', games_played: 4, wins: 3, losses: 1, win_rate: 0.75, avg_points_for: 18.5, avg_points_against: 12.0, games: [] },
]

describe('AvgPointsChart', () => {
  it('renders a chart', () => {
    render(<AvgPointsChart sessions={sessions} />)
    expect(screen.getByTestId('avg-points-chart')).toBeInTheDocument()
  })

  it('renders empty state when no sessions', () => {
    render(<AvgPointsChart sessions={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npm test -- --run AvgPointsChart
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/components/AvgPointsChart.tsx`**

```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SessionStats } from '../api/stats'

interface Props {
  sessions: SessionStats[]
}

export default function AvgPointsChart({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>
  }

  const data = sessions.map((s) => ({
    session: `S${s.session}`,
    for: s.avg_points_for,
    against: s.avg_points_against,
  }))

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Avg points scored per game</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="session" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 25]} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="for"
            name="Points for"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="against"
            name="Points against"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={{ r: 3 }}
            strokeDasharray="4 2"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run AvgPointsChart
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AvgPointsChart.tsx frontend/src/components/AvgPointsChart.test.tsx
git commit -m "feat: AvgPointsChart line chart component"
```

---

### Task 5: FormHeatmap component

**Files:**
- Create: `frontend/src/components/FormHeatmap.tsx`
- Create: `frontend/src/components/FormHeatmap.test.tsx`

The FormHeatmap renders a CSS grid where columns are sessions (S1, S2, …) and rows are game slots (G1, G2, …). Each cell is a small coloured square: green for a win, red for a loss. Empty cells (a session had fewer games than the max) are shown as grey.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/FormHeatmap.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FormHeatmap from './FormHeatmap'
import type { SessionStats } from '../api/stats'

const sessions: SessionStats[] = [
  {
    session: 1,
    played_on: '2024-04-01',
    games_played: 2,
    wins: 2,
    losses: 0,
    win_rate: 1.0,
    avg_points_for: 20,
    avg_points_against: 10,
    games: [
      { game_number: 1, won: true, score_for: 21, score_against: 9 },
      { game_number: 2, won: true, score_for: 19, score_against: 11 },
    ],
  },
  {
    session: 2,
    played_on: '2024-04-08',
    games_played: 2,
    wins: 1,
    losses: 1,
    win_rate: 0.5,
    avg_points_for: 15,
    avg_points_against: 15,
    games: [
      { game_number: 1, won: true, score_for: 21, score_against: 10 },
      { game_number: 2, won: false, score_for: 9, score_against: 21 },
    ],
  },
]

describe('FormHeatmap', () => {
  it('renders session column headers', () => {
    render(<FormHeatmap sessions={sessions} />)
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.getByText('S2')).toBeInTheDocument()
  })

  it('renders win cells', () => {
    render(<FormHeatmap sessions={sessions} />)
    const winCells = document.querySelectorAll('[data-outcome="win"]')
    expect(winCells.length).toBe(3) // 2 in S1, 1 in S2
  })

  it('renders loss cells', () => {
    render(<FormHeatmap sessions={sessions} />)
    const lossCells = document.querySelectorAll('[data-outcome="loss"]')
    expect(lossCells.length).toBe(1)
  })

  it('renders empty state when no sessions', () => {
    render(<FormHeatmap sessions={[]} />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npm test -- --run FormHeatmap
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/components/FormHeatmap.tsx`**

```typescript
import type { SessionStats, GameOutcome } from '../api/stats'

interface Props {
  sessions: SessionStats[]
}

export default function FormHeatmap({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>
  }

  const maxGames = Math.max(...sessions.map((s) => s.games_played))

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Form heatmap</p>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `2rem repeat(${sessions.length}, 1.5rem)` }}
        >
          {/* Header row */}
          <div /> {/* empty corner */}
          {sessions.map((s) => (
            <div
              key={s.session}
              className="text-center text-xs text-muted-foreground"
            >
              S{s.session}
            </div>
          ))}

          {/* Game rows */}
          {Array.from({ length: maxGames }, (_, i) => (
            <>
              <div
                key={`label-${i}`}
                className="text-right text-xs text-muted-foreground pr-1"
              >
                G{i + 1}
              </div>
              {sessions.map((s) => {
                const game: GameOutcome | undefined = s.games.find(
                  (g) => g.game_number === i + 1,
                )
                if (!game) {
                  return (
                    <div
                      key={`${s.session}-${i}`}
                      className="h-5 w-5 rounded-sm bg-muted"
                    />
                  )
                }
                return (
                  <div
                    key={`${s.session}-${i}`}
                    data-outcome={game.won ? 'win' : 'loss'}
                    title={`${game.score_for}–${game.score_against}`}
                    className={`h-5 w-5 cursor-default rounded-sm ${
                      game.won ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                )
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run FormHeatmap
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FormHeatmap.tsx frontend/src/components/FormHeatmap.test.tsx
git commit -m "feat: FormHeatmap CSS grid component"
```

---

### Task 6: PartnershipMatrix component

**Files:**
- Create: `frontend/src/components/PartnershipMatrix.tsx`
- Create: `frontend/src/components/PartnershipMatrix.test.tsx`

The component renders an N×N grid. It takes `players`, `partnerships`, and `mode` (`'frequency'` | `'strength'`). In frequency mode each cell shows games played together; in strength mode each cell shows win rate as a percentage. The diagonal is always empty (a player can't partner themselves). The colour intensity scales with the value.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/PartnershipMatrix.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PartnershipMatrix from './PartnershipMatrix'
import type { Player } from '../types'
import type { Partnership } from '../types'

const players: Player[] = [
  { id: 1, canonical_name: 'Alice', is_sub: false, aliases: [] },
  { id: 2, canonical_name: 'Bob', is_sub: false, aliases: [] },
  { id: 3, canonical_name: 'Chan', is_sub: false, aliases: [] },
]

const partnerships: Partnership[] = [
  { player_a_id: 1, player_b_id: 2, games_together: 10, wins: 7, losses: 3, win_rate: 0.7 },
  { player_a_id: 2, player_b_id: 3, games_together: 4, wins: 2, losses: 2, win_rate: 0.5 },
]

describe('PartnershipMatrix frequency mode', () => {
  it('renders player names as headers', () => {
    render(<PartnershipMatrix players={players} partnerships={partnerships} mode="frequency" />)
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0)
  })

  it('renders partnership count in cell', () => {
    render(<PartnershipMatrix players={players} partnerships={partnerships} mode="frequency" />)
    expect(screen.getByTitle('Alice × Bob: 10 games')).toBeInTheDocument()
  })

  it('renders empty state when no players', () => {
    render(<PartnershipMatrix players={[]} partnerships={[]} mode="frequency" />)
    expect(screen.getByText(/no data/i)).toBeInTheDocument()
  })
})

describe('PartnershipMatrix strength mode', () => {
  it('shows win rate in cell title', () => {
    render(<PartnershipMatrix players={players} partnerships={partnerships} mode="strength" />)
    expect(screen.getByTitle('Alice × Bob: 70% win rate')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npm test -- --run PartnershipMatrix
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/components/PartnershipMatrix.tsx`**

```typescript
import type { Player } from '../types'
import type { Partnership } from '../types'

interface Props {
  players: Player[]
  partnerships: Partnership[]
  mode: 'frequency' | 'strength'
}

function lookupPartnership(
  partnerships: Partnership[],
  aId: number,
  bId: number,
): Partnership | undefined {
  return partnerships.find(
    (p) =>
      (p.player_a_id === aId && p.player_b_id === bId) ||
      (p.player_a_id === bId && p.player_b_id === aId),
  )
}

function cellStyle(value: number, max: number): React.CSSProperties {
  const intensity = max === 0 ? 0 : value / max
  return { opacity: 0.15 + intensity * 0.85 }
}

export default function PartnershipMatrix({ players, partnerships, mode }: Props) {
  if (players.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>
  }

  const maxFrequency = Math.max(0, ...partnerships.map((p) => p.games_together))

  const title = mode === 'frequency' ? 'Partnership frequency' : 'Partnership strength'

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `6rem repeat(${players.length}, minmax(2.5rem, 1fr))`,
          }}
        >
          {/* Header row */}
          <div />
          {players.map((p) => (
            <div
              key={p.id}
              className="truncate text-center text-xs text-muted-foreground"
              title={p.canonical_name}
            >
              {p.canonical_name.split(' ')[0]}
            </div>
          ))}

          {/* Data rows */}
          {players.map((rowPlayer) => (
            <>
              <div
                key={`label-${rowPlayer.id}`}
                className="truncate text-right text-xs text-muted-foreground pr-1 self-center"
                title={rowPlayer.canonical_name}
              >
                {rowPlayer.canonical_name}
              </div>
              {players.map((colPlayer) => {
                if (rowPlayer.id === colPlayer.id) {
                  return (
                    <div
                      key={`${rowPlayer.id}-${colPlayer.id}`}
                      className="h-8 rounded-sm bg-muted"
                    />
                  )
                }
                const p = lookupPartnership(partnerships, rowPlayer.id, colPlayer.id)
                if (!p) {
                  return (
                    <div
                      key={`${rowPlayer.id}-${colPlayer.id}`}
                      className="h-8 rounded-sm bg-muted opacity-20"
                    />
                  )
                }

                if (mode === 'frequency') {
                  return (
                    <div
                      key={`${rowPlayer.id}-${colPlayer.id}`}
                      title={`${rowPlayer.canonical_name} × ${colPlayer.canonical_name}: ${p.games_together} games`}
                      className="flex h-8 items-center justify-center rounded-sm bg-primary text-xs font-medium text-primary-foreground"
                      style={cellStyle(p.games_together, maxFrequency)}
                    >
                      {p.games_together}
                    </div>
                  )
                }

                const pct = Math.round(p.win_rate * 100)
                const bg =
                  p.win_rate >= 0.6
                    ? 'bg-green-500'
                    : p.win_rate >= 0.4
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                return (
                  <div
                    key={`${rowPlayer.id}-${colPlayer.id}`}
                    title={`${rowPlayer.canonical_name} × ${colPlayer.canonical_name}: ${pct}% win rate`}
                    className={`flex h-8 items-center justify-center rounded-sm text-xs font-medium text-white ${bg}`}
                  >
                    {pct}%
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run PartnershipMatrix
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PartnershipMatrix.tsx frontend/src/components/PartnershipMatrix.test.tsx
git commit -m "feat: PartnershipMatrix CSS grid component (frequency + strength modes)"
```

---

### Task 7: Replace GraphPage and update nav

**Files:**
- Modify: `frontend/src/pages/GraphPage.tsx`

Read `frontend/src/pages/GraphPage.tsx` and `frontend/src/components/Nav.tsx` before making changes.

- [ ] **Step 1: Rewrite `frontend/src/pages/GraphPage.tsx`**

Replace the entire file:

```typescript
import { useEffect, useState } from 'react'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { getTimeSeries, type TimeSeriesResponse } from '../api/stats'
import { getAllPartnerships } from '../api/stats'
import type { Partnership } from '../types'
import WinRateChart from '../components/WinRateChart'
import AvgPointsChart from '../components/AvgPointsChart'
import FormHeatmap from '../components/FormHeatmap'
import PartnershipMatrix from '../components/PartnershipMatrix'

export default function GraphPage() {
  const { allPlayers, selectedIds } = usePlayerFilter()

  const filteredPlayers = allPlayers.filter((p) => selectedIds.includes(p.id))

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null)
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [tsError, setTsError] = useState<string | null>(null)

  // Default selected player to first in filtered list
  useEffect(() => {
    if (filteredPlayers.length > 0 && selectedPlayerId === null) {
      setSelectedPlayerId(filteredPlayers[0].id)
    }
  }, [filteredPlayers, selectedPlayerId])

  // Fetch time-series when player or filter changes
  useEffect(() => {
    if (selectedPlayerId === null) return
    setTsError(null)
    setTsLoading(true)
    getTimeSeries(selectedPlayerId, selectedIds)
      .then(setTimeSeries)
      .catch(() => setTsError('Failed to load trends'))
      .finally(() => setTsLoading(false))
  }, [selectedPlayerId, selectedIds])

  // Fetch partnerships when filter changes
  useEffect(() => {
    getAllPartnerships(selectedIds).then(setPartnerships).catch(() => setPartnerships([]))
  }, [selectedIds])

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Performance over time and partnership analysis
        </p>
      </div>

      {/* Player selector for trend charts */}
      <div className="flex items-center gap-3">
        <label htmlFor="player-select" className="text-sm font-medium">
          Player
        </label>
        <select
          id="player-select"
          value={selectedPlayerId ?? ''}
          onChange={(e) => setSelectedPlayerId(Number(e.target.value))}
          className="rounded border border-border bg-background px-2 py-1 text-sm"
        >
          {filteredPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.canonical_name}
            </option>
          ))}
        </select>
      </div>

      {tsError && <p className="text-sm text-destructive">{tsError}</p>}

      {/* Trend charts */}
      <div
        className={`grid grid-cols-1 gap-6 lg:grid-cols-2 transition-opacity ${
          tsLoading ? 'opacity-50' : ''
        }`}
      >
        <div className="rounded-lg border border-border p-4">
          <WinRateChart sessions={timeSeries?.sessions ?? []} />
        </div>
        <div className="rounded-lg border border-border p-4">
          <AvgPointsChart sessions={timeSeries?.sessions ?? []} />
        </div>
        <div className="rounded-lg border border-border p-4 lg:col-span-2">
          <FormHeatmap sessions={timeSeries?.sessions ?? []} />
        </div>
      </div>

      {/* Partnership matrices */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <PartnershipMatrix
            players={filteredPlayers}
            partnerships={partnerships}
            mode="frequency"
          />
        </div>
        <div className="rounded-lg border border-border p-4">
          <PartnershipMatrix
            players={filteredPlayers}
            partnerships={partnerships}
            mode="strength"
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update nav label from "Graph" to "Trends"**

Read `frontend/src/components/Nav.tsx`. Find the nav link to the graph route and update its label text from `"Graph"` (or whatever it currently says) to `"Trends"`.

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. Fix any if found.

- [ ] **Step 4: Run full frontend test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass. The old GraphCanvas tests should still pass since that component is not deleted, just no longer used by GraphPage.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GraphPage.tsx frontend/src/components/Nav.tsx
git commit -m "feat: replace GraphPage with Trends page — line charts, form heatmap, partnership matrices"
```
