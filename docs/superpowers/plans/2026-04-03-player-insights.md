# Player Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new sections to the player detail page — form summary (last 5 sessions vs season), rivals (closest avg score differential), bogeys (opponents who overperform vs you), and freebies (opponents who underperform vs you).

**Architecture:** A shared `_h2h_opponent_stats` helper in a new `services/insights.py` computes per-opponent head-to-head data (games faced, avg score diff, their win rate vs you, their overall win rate). Three thin service functions call this helper and sort differently. Three separate FastAPI endpoints keep callers independent. On the frontend, the form summary is computed client-side from the existing `GET /stats/time-series` data (added in Feature 3). The three insight lists each make their own API call. All four respect the global player filter (`player_ids`). Min 5 head-to-head games threshold applied in the shared helper.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 19 + TypeScript + Tailwind v4 (frontend).

---

## File Structure

**Backend — create:**
- `backend/app/services/insights.py` — `_h2h_opponent_stats` helper + `get_rivals`, `get_bogeys`, `get_freebies`
- `backend/tests/integration/test_insights.py`

**Backend — modify:**
- `backend/app/schemas.py` — add `RivalEntry`, `InsightPlayerEntry`
- `backend/app/routers/stats.py` — add three endpoints

**Frontend — create:**
- `frontend/src/components/FormSummaryCard.tsx` + `.test.tsx`
- `frontend/src/components/RivalsCard.tsx` + `.test.tsx`
- `frontend/src/components/InsightPlayerCard.tsx` + `.test.tsx`

**Frontend — modify:**
- `frontend/src/api/stats.ts` — add `getRivals`, `getBogeys`, `getFreebies`
- `frontend/src/pages/PlayerDetailPage.tsx` — add four new sections

---

## Tasks

### Task 1: Backend — insights service, schemas, endpoints, tests

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services/insights.py`
- Modify: `backend/app/routers/stats.py`
- Create: `backend/tests/integration/test_insights.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/integration/test_insights.py`:

```python
import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models import Player, Game, GamePlayer

client = TestClient(app)

MIN_H2H = 5  # must match services/insights.py


@pytest.fixture()
def insights_fixture(db: Session):
    alice = Player(canonical_name="Alice", is_sub=False)
    bob = Player(canonical_name="Bob", is_sub=False)   # rival: close avg score diff
    chan = Player(canonical_name="Chan", is_sub=False)  # bogey: overperforms vs alice
    dan = Player(canonical_name="Dan", is_sub=False)   # freebie: underperforms vs alice
    eve = Player(canonical_name="Eve", is_sub=False)   # filler
    db.add_all([alice, bob, chan, dan, eve])
    db.flush()

    base = date(2024, 1, 1)

    def game(day, num, team_a_ids, team_b_ids, sa, sb):
        g = Game(played_on=base + timedelta(days=day), game_number=num,
                 team_a_score=sa, team_b_score=sb)
        db.add(g)
        db.flush()
        for pid in team_a_ids:
            db.add(GamePlayer(game_id=g.id, player_id=pid, team="A"))
        for pid in team_b_ids:
            db.add(GamePlayer(game_id=g.id, player_id=pid, team="B"))

    # alice+eve vs bob+dan: 5 games, close scores (diff=2), alice wins 3
    for i in range(5):
        sa, sb = (21, 19) if i < 3 else (19, 21)
        game(i, 1, [alice.id, eve.id], [bob.id, dan.id], sa, sb)

    # alice+eve vs chan+dan: 5 h2h games, chan wins 4 (big scores, diff=11)
    for i in range(5, 10):
        sa, sb = (10, 21) if i < 9 else (21, 10)
        game(i, 1, [alice.id, eve.id], [chan.id, dan.id], sa, sb)

    # chan+eve vs bob+dan: 5 extra games for chan (chan wins 2)
    # → chan overall: 6/10 = 60%; chan vs alice: 4/5 = 80%; delta = +20%  (bogey)
    for i in range(10, 15):
        sa, sb = (21, 10) if i < 12 else (10, 21)
        game(i, 1, [chan.id, eve.id], [bob.id, dan.id], sa, sb)

    # alice+eve vs dan+bob: 5 h2h games, dan wins 1 (big scores, diff=11)
    for i in range(15, 20):
        sa, sb = (21, 10) if i < 19 else (10, 21)
        game(i, 1, [alice.id, eve.id], [dan.id, bob.id], sa, sb)

    # dan+chan vs bob+eve: 5 extra games for dan (dan wins 4)
    # → dan overall: 5/10 = 50%; dan vs alice: 1/5 = 20%; delta = -30%  (freebie)
    for i in range(20, 25):
        sa, sb = (21, 10) if i < 24 else (10, 21)
        game(i, 1, [dan.id, chan.id], [bob.id, eve.id], sa, sb)

    db.commit()
    for p in [alice, bob, chan, dan, eve]:
        db.refresh(p)
    return dict(alice=alice, bob=bob, chan=chan, dan=dan, eve=eve)


def test_rivals_top_is_bob(insights_fixture):
    alice_id = insights_fixture["alice"].id
    resp = client.get(f"/stats/rivals/{alice_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert data[0]["player_id"] == insights_fixture["bob"].id
    assert data[0]["avg_score_diff"] == pytest.approx(2.0)
    assert data[0]["games"] == 5


def test_rivals_returns_max_3(insights_fixture):
    alice_id = insights_fixture["alice"].id
    resp = client.get(f"/stats/rivals/{alice_id}")
    assert len(resp.json()) <= 3


def test_bogeys_top_is_chan(insights_fixture):
    alice_id = insights_fixture["alice"].id
    resp = client.get(f"/stats/bogeys/{alice_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert data[0]["player_id"] == insights_fixture["chan"].id
    assert data[0]["delta"] == pytest.approx(0.2, abs=0.05)


def test_freebies_top_is_dan(insights_fixture):
    alice_id = insights_fixture["alice"].id
    resp = client.get(f"/stats/freebies/{alice_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert data[0]["player_id"] == insights_fixture["dan"].id
    assert data[0]["delta"] < 0  # underperforms vs alice


def test_rivals_404_unknown_player():
    resp = client.get("/stats/rivals/99999")
    assert resp.status_code == 404


def test_bogeys_404_unknown_player():
    resp = client.get("/stats/bogeys/99999")
    assert resp.status_code == 404


def test_freebies_404_unknown_player():
    resp = client.get("/stats/freebies/99999")
    assert resp.status_code == 404


def test_rivals_player_ids_filter(insights_fixture):
    # Filter that excludes dan and bob → alice has no qualifying h2h opponents
    alice_id = insights_fixture["alice"].id
    eve_id = insights_fixture["eve"].id
    chan_id = insights_fixture["chan"].id
    # Only include alice, eve, chan — games with bob/dan don't qualify
    resp = client.get(
        f"/stats/rivals/{alice_id}?player_ids={alice_id}&player_ids={eve_id}&player_ids={chan_id}"
    )
    assert resp.status_code == 200
    # bob/dan excluded → no alice vs bob games qualify, only alice vs chan (but chan's partner
    # dan is excluded too, so those games also don't qualify)
    assert resp.json() == []
```

- [ ] **Step 2: Run failing tests**

```bash
cd backend && python -m pytest tests/integration/test_insights.py -v
```

Expected: FAIL — endpoints do not exist yet.

- [ ] **Step 3: Add schemas to `backend/app/schemas.py`**

Append to the bottom of `backend/app/schemas.py`:

```python
# --- Player Insights ---

class RivalEntry(BaseModel):
    player_id: int
    canonical_name: str
    games: int
    avg_score_diff: float


class InsightPlayerEntry(BaseModel):
    player_id: int
    canonical_name: str
    games: int
    win_rate_vs_you: float
    overall_win_rate: float
    delta: float  # win_rate_vs_you - overall_win_rate; positive = bogey, negative = freebie
```

- [ ] **Step 4: Create `backend/app/services/insights.py`**

```python
from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, case
from ..models import Player, Game, GamePlayer
from .stats import _valid_game_ids

MIN_H2H_GAMES = 5
TOP_N = 3


def _h2h_opponent_stats(
    db: Session, player_id: int, player_ids: list[int] | None = None
) -> list[dict[str, Any]]:
    """For all opponents who faced player_id >= MIN_H2H_GAMES times as opponents,
    return per-opponent stats. Both h2h and overall win rates respect player_ids filter."""
    valid_ids = _valid_game_ids(player_ids)

    gp_self = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)

    opp_won = case(
        ((gp_opp.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp_opp.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    score_diff = func.abs(Game.team_a_score - Game.team_b_score)

    h2h_q = (
        db.query(
            gp_opp.player_id.label("opponent_id"),
            Player.canonical_name,
            func.count(gp_opp.id).label("games"),
            func.avg(score_diff).label("avg_score_diff"),
            func.avg(opp_won).label("opp_win_rate_vs"),
        )
        .join(Game, gp_opp.game_id == Game.id)
        .join(
            gp_self,
            (gp_self.game_id == gp_opp.game_id)
            & (gp_self.player_id == player_id)
            & (gp_self.team != gp_opp.team),
        )
        .join(Player, Player.id == gp_opp.player_id)
        .filter(gp_opp.player_id != player_id)
    )
    if valid_ids is not None:
        h2h_q = h2h_q.filter(Game.id.in_(valid_ids))

    h2h_rows = (
        h2h_q
        .group_by(gp_opp.player_id, Player.canonical_name)
        .having(func.count(gp_opp.id) >= MIN_H2H_GAMES)
        .all()
    )
    if not h2h_rows:
        return []

    # Overall win rate for each opponent across all filtered games (not just vs player_id)
    opp_ids = [r.opponent_id for r in h2h_rows]
    gp_all = aliased(GamePlayer)
    all_won = case(
        ((gp_all.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp_all.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    overall_q = (
        db.query(
            gp_all.player_id,
            func.avg(all_won).label("overall_win_rate"),
        )
        .join(Game, gp_all.game_id == Game.id)
        .filter(gp_all.player_id.in_(opp_ids))
    )
    if valid_ids is not None:
        overall_q = overall_q.filter(Game.id.in_(valid_ids))
    overall_map = {
        r.player_id: round(float(r.overall_win_rate or 0), 4)
        for r in overall_q.group_by(gp_all.player_id).all()
    }

    results = []
    for r in h2h_rows:
        owr = overall_map.get(r.opponent_id, 0.0)
        h2h_wr = round(float(r.opp_win_rate_vs or 0), 4)
        results.append({
            "player_id": r.opponent_id,
            "canonical_name": r.canonical_name,
            "games": r.games,
            "avg_score_diff": round(float(r.avg_score_diff or 0), 2),
            "win_rate_vs_you": h2h_wr,
            "overall_win_rate": owr,
            "delta": round(h2h_wr - owr, 4),
        })
    return results


def get_rivals(
    db: Session, player_id: int, player_ids: list[int] | None = None
) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    entries = _h2h_opponent_stats(db, player_id, player_ids)
    return sorted(entries, key=lambda e: e["avg_score_diff"])[:TOP_N]


def get_bogeys(
    db: Session, player_id: int, player_ids: list[int] | None = None
) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    entries = _h2h_opponent_stats(db, player_id, player_ids)
    return sorted(entries, key=lambda e: e["delta"], reverse=True)[:TOP_N]


def get_freebies(
    db: Session, player_id: int, player_ids: list[int] | None = None
) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    entries = _h2h_opponent_stats(db, player_id, player_ids)
    return sorted(entries, key=lambda e: e["delta"])[:TOP_N]
```

- [ ] **Step 5: Add endpoints to `backend/app/routers/stats.py`**

Add to the existing imports in `routers/stats.py`:

```python
from ..schemas import (
    LeaderboardEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    PlayerStatsResponse,
    HeadToHeadResponse,
    MatchupResponse,
    TimeSeriesResponse,
    RivalEntry,
    InsightPlayerEntry,
)
from ..services import insights as insights_service
```

Append to the bottom of `backend/app/routers/stats.py`:

```python
@router.get("/rivals/{player_id}", response_model=list[RivalEntry])
def rivals(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return insights_service.get_rivals(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/bogeys/{player_id}", response_model=list[InsightPlayerEntry])
def bogeys(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return insights_service.get_bogeys(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/freebies/{player_id}", response_model=list[InsightPlayerEntry])
def freebies(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return insights_service.get_freebies(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/integration/test_insights.py -v
```

Expected: all 8 tests pass.

- [ ] **Step 7: Run full backend suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/services/insights.py backend/app/routers/stats.py backend/tests/integration/test_insights.py
git commit -m "feat: GET /stats/rivals, /bogeys, /freebies endpoints with shared h2h helper"
```

---

### Task 2: FormSummaryCard component

**Files:**
- Create: `frontend/src/components/FormSummaryCard.tsx`
- Create: `frontend/src/components/FormSummaryCard.test.tsx`

The card compares the player's last 5 sessions against their whole season. Win rate and avg points are shown for each, with a colour-coded delta: green when the recent form is better, red when worse, grey/neutral when equal.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/FormSummaryCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FormSummaryCard from './FormSummaryCard'
import type { SessionStats } from '../api/stats'

function makeSession(session: number, wins: number, games: number, avgPts: number): SessionStats {
  return {
    session,
    played_on: `2024-0${session}-01`,
    games_played: games,
    wins,
    losses: games - wins,
    win_rate: wins / games,
    avg_points_for: avgPts,
    avg_points_against: 15,
    games: [],
  }
}

// 8 sessions total; last 5 are stronger (win rate 0.7) vs earlier 3 (win rate 0.3)
const goodFormSessions: SessionStats[] = [
  makeSession(1, 2, 6, 14),  // 33%
  makeSession(2, 1, 6, 13),  // 17%
  makeSession(3, 2, 6, 14),  // 33%
  makeSession(4, 4, 6, 18),  // 67%
  makeSession(5, 4, 6, 18),  // 67%
  makeSession(6, 5, 6, 20),  // 83%
  makeSession(7, 4, 6, 18),  // 67%
  makeSession(8, 4, 6, 17),  // 67%
]

describe('FormSummaryCard', () => {
  it('renders win rate rows', () => {
    render(<FormSummaryCard sessions={goodFormSessions} />)
    expect(screen.getByText(/win rate/i)).toBeInTheDocument()
  })

  it('renders avg points rows', () => {
    render(<FormSummaryCard sessions={goodFormSessions} />)
    expect(screen.getByText(/avg points/i)).toBeInTheDocument()
  })

  it('shows green delta when last 5 win rate is above season', () => {
    render(<FormSummaryCard sessions={goodFormSessions} />)
    // last 5: 21/30 = 70%; season: 26/48 = 54%; delta positive → green
    const greenEl = document.querySelector('.text-green-500')
    expect(greenEl).toBeTruthy()
  })

  it('renders empty state with fewer than 2 sessions', () => {
    render(<FormSummaryCard sessions={[makeSession(1, 3, 6, 16)]} />)
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
cd frontend && npm test -- --run FormSummaryCard
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `frontend/src/components/FormSummaryCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SessionStats } from '../api/stats'

interface Props {
  sessions: SessionStats[]
}

interface FormStats {
  winRate: number
  avgPoints: number
}

function computeStats(sessions: SessionStats[]): FormStats {
  const games = sessions.reduce((s, x) => s + x.games_played, 0)
  const wins = sessions.reduce((s, x) => s + x.wins, 0)
  const totalPoints = sessions.reduce((s, x) => s + x.avg_points_for * x.games_played, 0)
  return {
    winRate: games > 0 ? wins / games : 0,
    avgPoints: games > 0 ? totalPoints / games : 0,
  }
}

interface DeltaRowProps {
  label: string
  season: number
  last5: number
  format: (v: number) => string
  deltaFormat: (v: number) => string
}

function DeltaRow({ label, season, last5, format, deltaFormat }: DeltaRowProps) {
  const delta = last5 - season
  const colour =
    delta > 0.005 ? 'text-green-500' : delta < -0.005 ? 'text-red-500' : 'text-muted-foreground'
  const sign = delta >= 0 ? '+' : ''
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground w-24">{label}</span>
      <span className="w-20 text-right">{format(season)}</span>
      <span className={`w-32 text-right font-medium ${colour}`}>
        {format(last5)} ({sign}{deltaFormat(delta)})
      </span>
    </div>
  )
}

export default function FormSummaryCard({ sessions }: Props) {
  if (sessions.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Form</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not enough data</p>
        </CardContent>
      </Card>
    )
  }

  const last5 = sessions.slice(-5)
  const seasonStats = computeStats(sessions)
  const last5Stats = computeStats(last5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Form</CardTitle>
        <p className="text-xs text-muted-foreground">Last 5 sessions vs season</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="w-24" />
          <span className="w-20 text-right">Season</span>
          <span className="w-32 text-right">Last 5</span>
        </div>
        <DeltaRow
          label="Win rate"
          season={seasonStats.winRate}
          last5={last5Stats.winRate}
          format={(v) => `${(v * 100).toFixed(1)}%`}
          deltaFormat={(v) => `${(v * 100).toFixed(1)}pp`}
        />
        <DeltaRow
          label="Avg points"
          season={seasonStats.avgPoints}
          last5={last5Stats.avgPoints}
          format={(v) => v.toFixed(1)}
          deltaFormat={(v) => v.toFixed(1)}
        />
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm test -- --run FormSummaryCard
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FormSummaryCard.tsx frontend/src/components/FormSummaryCard.test.tsx
git commit -m "feat: FormSummaryCard — last 5 sessions vs season with colour-coded deltas"
```

---

### Task 3: RivalsCard and InsightPlayerCard components

**Files:**
- Create: `frontend/src/components/RivalsCard.tsx` + `.test.tsx`
- Create: `frontend/src/components/InsightPlayerCard.tsx` + `.test.tsx`

`InsightPlayerCard` is shared by both bogeys and freebies — it takes a `title` prop and a list of `InsightPlayerEntry`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/RivalsCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RivalsCard from './RivalsCard'

const rivals = [
  { player_id: 1, canonical_name: 'Bob', games: 12, avg_score_diff: 2.1 },
  { player_id: 2, canonical_name: 'Chan', games: 8, avg_score_diff: 3.5 },
]

describe('RivalsCard', () => {
  it('renders player names', () => {
    render(<RivalsCard rivals={rivals} />)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Chan')).toBeInTheDocument()
  })

  it('renders avg score diff', () => {
    render(<RivalsCard rivals={rivals} />)
    expect(screen.getByText(/2\.1/)).toBeInTheDocument()
  })

  it('renders empty state when no rivals', () => {
    render(<RivalsCard rivals={[]} />)
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument()
  })
})
```

Create `frontend/src/components/InsightPlayerCard.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import InsightPlayerCard from './InsightPlayerCard'

const bogeys = [
  { player_id: 1, canonical_name: 'Chan', games: 8, win_rate_vs_you: 0.8, overall_win_rate: 0.55, delta: 0.25 },
  { player_id: 2, canonical_name: 'Eve', games: 6, win_rate_vs_you: 0.7, overall_win_rate: 0.5, delta: 0.2 },
]

describe('InsightPlayerCard', () => {
  it('renders the title', () => {
    render(<InsightPlayerCard title="Bogeys" entries={bogeys} />)
    expect(screen.getByText('Bogeys')).toBeInTheDocument()
  })

  it('renders player names', () => {
    render(<InsightPlayerCard title="Bogeys" entries={bogeys} />)
    expect(screen.getByText('Chan')).toBeInTheDocument()
  })

  it('renders win rates', () => {
    render(<InsightPlayerCard title="Bogeys" entries={bogeys} />)
    expect(screen.getByText(/80%/)).toBeInTheDocument()
  })

  it('renders empty state when no entries', () => {
    render(<InsightPlayerCard title="Freebies" entries={[]} />)
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run failing tests**

```bash
cd frontend && npm test -- --run "RivalsCard|InsightPlayerCard"
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `frontend/src/components/RivalsCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RivalEntry {
  player_id: number
  canonical_name: string
  games: number
  avg_score_diff: number
}

interface Props {
  rivals: RivalEntry[]
}

export default function RivalsCard({ rivals }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rivals</CardTitle>
        <p className="text-xs text-muted-foreground">Closest avg score gap (min 5 games)</p>
      </CardHeader>
      <CardContent>
        {rivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data</p>
        ) : (
          <ol className="space-y-1.5">
            {rivals.map((r, i) => (
              <li key={r.player_id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="w-4 text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium">{r.canonical_name}</span>
                </span>
                <span className="text-muted-foreground">
                  {r.avg_score_diff.toFixed(1)}pt gap · {r.games}g
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Create `frontend/src/components/InsightPlayerCard.tsx`**

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface InsightPlayerEntry {
  player_id: number
  canonical_name: string
  games: number
  win_rate_vs_you: number
  overall_win_rate: number
  delta: number
}

interface Props {
  title: string
  entries: InsightPlayerEntry[]
}

export default function InsightPlayerCard({ title, entries }: Props) {
  const subtitle =
    title === 'Bogeys'
      ? 'Overperform against you'
      : 'Underperform against you'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle} (min 5 games)</p>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not enough data</p>
        ) : (
          <ol className="space-y-1.5">
            {entries.map((e, i) => {
              const vsYou = `${Math.round(e.win_rate_vs_you * 100)}%`
              const usual = `${Math.round(e.overall_win_rate * 100)}%`
              const deltaPp = Math.round(Math.abs(e.delta) * 100)
              const colour = e.delta > 0 ? 'text-red-400' : 'text-green-400'
              const sign = e.delta > 0 ? '+' : '−'
              return (
                <li key={e.player_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{e.canonical_name}</span>
                  </span>
                  <span className="text-right text-muted-foreground">
                    {vsYou} vs you · {usual} usual{' '}
                    <span className={`font-medium ${colour}`}>
                      {sign}{deltaPp}pp
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npm test -- --run "RivalsCard|InsightPlayerCard"
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RivalsCard.tsx frontend/src/components/RivalsCard.test.tsx frontend/src/components/InsightPlayerCard.tsx frontend/src/components/InsightPlayerCard.test.tsx
git commit -m "feat: RivalsCard and InsightPlayerCard components"
```

---

### Task 4: Frontend API functions + PlayerDetailPage wiring

**Files:**
- Modify: `frontend/src/api/stats.ts`
- Modify: `frontend/src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Add API functions to `frontend/src/api/stats.ts`**

Append to the bottom of `frontend/src/api/stats.ts`:

```typescript
export interface RivalEntry {
  player_id: number
  canonical_name: string
  games: number
  avg_score_diff: number
}

export interface InsightPlayerEntry {
  player_id: number
  canonical_name: string
  games: number
  win_rate_vs_you: number
  overall_win_rate: number
  delta: number
}

const insightParams = (playerId: number, playerIds?: number[]) => {
  const p = new URLSearchParams()
  playerIds?.forEach((id) => p.append('player_ids', String(id)))
  return p.toString() ? `?${p}` : ''
}

export const getRivals = (playerId: number, playerIds?: number[]): Promise<RivalEntry[]> =>
  apiFetch<RivalEntry[]>(`/stats/rivals/${playerId}${insightParams(playerId, playerIds)}`)

export const getBogeys = (playerId: number, playerIds?: number[]): Promise<InsightPlayerEntry[]> =>
  apiFetch<InsightPlayerEntry[]>(`/stats/bogeys/${playerId}${insightParams(playerId, playerIds)}`)

export const getFreebies = (playerId: number, playerIds?: number[]): Promise<InsightPlayerEntry[]> =>
  apiFetch<InsightPlayerEntry[]>(`/stats/freebies/${playerId}${insightParams(playerId, playerIds)}`)
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Wire into `frontend/src/pages/PlayerDetailPage.tsx`**

Read the current file first, then make these changes:

Add imports at the top:

```typescript
import { getTimeSeries, getRivals, getBogeys, getFreebies } from '../api/stats'
import type { SessionStats, RivalEntry, InsightPlayerEntry } from '../api/stats'
import FormSummaryCard from '../components/FormSummaryCard'
import RivalsCard from '../components/RivalsCard'
import InsightPlayerCard from '../components/InsightPlayerCard'
```

Add new state variables inside the component alongside the existing state:

```typescript
const [sessions, setSessions] = useState<SessionStats[]>([])
const [rivals, setRivals] = useState<RivalEntry[]>([])
const [bogeys, setBogeys] = useState<InsightPlayerEntry[]>([])
const [freebies, setFreebies] = useState<InsightPlayerEntry[]>([])
```

Add the four new fetches to the existing `useEffect` `Promise.all` (or add a separate effect — a separate effect is simpler since insights re-fetch whenever `selectedIds` changes, same as the existing effect):

Replace the existing `useEffect` with one that fetches all data:

```typescript
useEffect(() => {
  Promise.all([
    getPlayer(playerId),
    getPlayerStats(playerId, selectedIds),
    getPlayerPartnerships(playerId, selectedIds),
    getPlayers(),
    getTimeSeries(playerId, selectedIds),
    getRivals(playerId, selectedIds),
    getBogeys(playerId, selectedIds),
    getFreebies(playerId, selectedIds),
  ])
    .then(([p, s, partners, allPlayers, ts, rv, bg, fb]) => {
      setPlayer(p)
      setStats(s)
      setPartnerships(partners)
      setPlayerNames(Object.fromEntries(allPlayers.map((pl) => [pl.id, pl.canonical_name])))
      setSessions(ts.sessions)
      setRivals(rv)
      setBogeys(bg)
      setFreebies(fb)
    })
    .catch((e: Error) => setError(e.message))
}, [playerId, selectedIds])
```

Add four new cards to the JSX, between the stat cards row and the partnerships card:

```tsx
{/* Form summary + insights */}
<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
  <FormSummaryCard sessions={sessions} />
  <RivalsCard rivals={rivals} />
  <InsightPlayerCard title="Bogeys" entries={bogeys} />
  <InsightPlayerCard title="Freebies" entries={freebies} />
</div>
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Run full frontend test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/stats.ts frontend/src/pages/PlayerDetailPage.tsx
git commit -m "feat: player detail page — form summary, rivals, bogeys, freebies"
```
