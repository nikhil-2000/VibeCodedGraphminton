# Game Browser Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the game browser so each card shows team player names and a colour-coded left border strip (green ≤3pt gap, yellow 3–6pt, red >6pt). Clicking "Show prediction" below the score expands an inline section with expected vs actual scores and whether the result was an upset.

**Architecture:** `get_games` is updated to batch-fetch team members so the list endpoint returns `GameDetailResponse` (no extra per-game round trips). A new `GET /games/{id}/prediction` endpoint computes expected scores on demand using historical averages: for each player, average their points (a) with their current partner, (b) vs each opponent individually — the mean of those three figures is their expected output; the pair's expected score is the mean of both players' expectations. The frontend fetches the prediction lazily when the card is first expanded.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 19 + TypeScript + Tailwind v4 (frontend).

---

## File Structure

**Backend — modify:**
- `backend/app/services/games.py` — update `get_games` to include team members; add `get_game_prediction`
- `backend/app/schemas.py` — add `GamePrediction`
- `backend/app/routers/games.py` — change `/games` response type; add `GET /games/{id}/prediction`
- `backend/tests/integration/test_games.py` — add prediction tests (extend existing file)

**Frontend — modify:**
- `frontend/src/api/games.ts` — update `getGames` return type; add `getGamePrediction`
- `frontend/src/components/GameCard.tsx` — rewrite with strip, names, expandable prediction
- `frontend/src/components/GameCard.test.tsx` — rewrite tests for new props/behaviour

---

## Tasks

### Task 1: Backend — team members in game list + prediction endpoint

**Files:**
- Modify: `backend/app/services/games.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/games.py`
- Modify: `backend/tests/integration/test_games.py`

- [ ] **Step 1: Write the failing tests**

Read `backend/tests/integration/test_games.py` to find the existing fixture name, then append:

```python
def test_games_list_includes_team_members(some_games_fixture, client):
    """GET /games should return team_a and team_b player lists."""
    resp = client.get("/games")
    assert resp.status_code == 200
    games = resp.json()
    assert len(games) > 0
    for g in games:
        assert "team_a" in g
        assert "team_b" in g
        assert len(g["team_a"]) == 2
        assert len(g["team_b"]) == 2
        assert "id" in g["team_a"][0]
        assert "canonical_name" in g["team_a"][0]


def test_game_prediction_expected_fields(some_games_fixture, client):
    """GET /games/{id}/prediction returns expected fields."""
    games_resp = client.get("/games")
    game_id = games_resp.json()[0]["id"]
    resp = client.get(f"/games/{game_id}/prediction")
    assert resp.status_code == 200
    data = resp.json()
    assert "expected_score_a" in data
    assert "expected_score_b" in data
    assert data["expected_winner"] in ("A", "B")
    assert data["actual_winner"] in ("A", "B")
    assert isinstance(data["upset"], bool)


def test_game_prediction_winner_matches_score(some_games_fixture, client):
    """actual_winner should reflect the real game outcome."""
    games_resp = client.get("/games")
    for g in games_resp.json():
        game_id = g["id"]
        pred = client.get(f"/games/{game_id}/prediction").json()
        if g["team_a_score"] > g["team_b_score"]:
            assert pred["actual_winner"] == "A"
        else:
            assert pred["actual_winner"] == "B"


def test_game_prediction_404(client):
    resp = client.get("/games/99999/prediction")
    assert resp.status_code == 404
```

Note: replace `some_games_fixture` and `client` with whatever names the existing test file uses for those fixtures.

- [ ] **Step 2: Run failing tests**

```bash
cd backend && python -m pytest tests/integration/test_games.py -v -k "team_members or prediction"
```

Expected: FAIL — `team_a`/`team_b` not in list response; prediction endpoint doesn't exist.

- [ ] **Step 3: Add `GamePrediction` schema to `backend/app/schemas.py`**

Append to the bottom of `backend/app/schemas.py`:

```python
# --- Game Prediction ---

class GamePrediction(BaseModel):
    expected_score_a: float
    expected_score_b: float
    expected_winner: str  # "A" or "B"
    actual_winner: str    # "A" or "B"
    upset: bool
```

- [ ] **Step 4: Update `get_games` and add `get_game_prediction` in `backend/app/services/games.py`**

Replace the `get_games` function (lines 18–56) with this version that batch-fetches team members:

```python
def get_games(
    db: Session,
    week: int | None = None,
    player_id: int | None = None,
    team_ids: tuple[int, int] | None = None,
    vs_ids: tuple[int, int] | None = None,
) -> list[dict[str, Any]]:
    ranked = (
        db.query(Game, _session_rank.c.session)
        .join(_session_rank, _session_rank.c.played_on == Game.played_on)
    )

    if week is not None:
        ranked = ranked.filter(_session_rank.c.session == week)

    if player_id is not None:
        ranked = ranked.join(GamePlayer, GamePlayer.game_id == Game.id).filter(
            GamePlayer.player_id == player_id
        )

    if team_ids is not None:
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        ranked = (
            ranked
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == team_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == team_ids[1]) & (gp2.team == gp1.team))
        )

    if vs_ids is not None:
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        ranked = (
            ranked
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == vs_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == vs_ids[1]) & (gp2.team != gp1.team))
        )

    rows = ranked.distinct().all()
    game_ids = [g.id for g, _ in rows]

    # Batch-fetch team members for all returned games
    gp_rows = (
        db.query(GamePlayer.game_id, GamePlayer.player_id, GamePlayer.team, Player.canonical_name)
        .join(Player, Player.id == GamePlayer.player_id)
        .filter(GamePlayer.game_id.in_(game_ids))
        .all()
    )
    teams: dict[int, dict[str, list]] = {}
    for r in gp_rows:
        if r.game_id not in teams:
            teams[r.game_id] = {"A": [], "B": []}
        teams[r.game_id][r.team].append({"id": r.player_id, "canonical_name": r.canonical_name})

    result = []
    for g, session in rows:
        summary = _game_summary(g, session)
        game_teams = teams.get(g.id, {"A": [], "B": []})
        summary["team_a"] = game_teams["A"]
        summary["team_b"] = game_teams["B"]
        result.append(summary)
    return result
```

Then append `get_game_prediction` after `get_game_detail`:

```python
def get_game_prediction(db: Session, game_id: int) -> dict[str, Any]:
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")

    a_ids = [r.player_id for r in db.query(GamePlayer.player_id).filter(
        GamePlayer.game_id == game_id, GamePlayer.team == "A"
    ).all()]
    b_ids = [r.player_id for r in db.query(GamePlayer.player_id).filter(
        GamePlayer.game_id == game_id, GamePlayer.team == "B"
    ).all()]

    def _avg_with_partner(pid: int, partner_id: int) -> float | None:
        gpa = aliased(GamePlayer)
        gpb = aliased(GamePlayer)
        pts = case((gpa.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(gpa, (gpa.game_id == Game.id) & (gpa.player_id == pid))
            .join(gpb, (gpb.game_id == Game.id) & (gpb.player_id == partner_id) & (gpb.team == gpa.team))
            .scalar()
        )
        return float(result) if result is not None else None

    def _avg_vs_opponent(pid: int, opp_id: int) -> float | None:
        gpa = aliased(GamePlayer)
        gpo = aliased(GamePlayer)
        pts = case((gpa.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(gpa, (gpa.game_id == Game.id) & (gpa.player_id == pid))
            .join(gpo, (gpo.game_id == Game.id) & (gpo.player_id == opp_id) & (gpo.team != gpa.team))
            .scalar()
        )
        return float(result) if result is not None else None

    def _overall_avg(pid: int) -> float:
        pts = case((GamePlayer.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(Game, GamePlayer.game_id == Game.id)
            .filter(GamePlayer.player_id == pid)
            .scalar()
        )
        return float(result or 0)

    def _expected_for_player(pid: int, partner_id: int, opp1_id: int, opp2_id: int) -> float:
        scores = [
            _avg_with_partner(pid, partner_id),
            _avg_vs_opponent(pid, opp1_id),
            _avg_vs_opponent(pid, opp2_id),
        ]
        valid = [s for s in scores if s is not None]
        return sum(valid) / len(valid) if valid else _overall_avg(pid)

    exp_a = (
        _expected_for_player(a_ids[0], a_ids[1], b_ids[0], b_ids[1])
        + _expected_for_player(a_ids[1], a_ids[0], b_ids[0], b_ids[1])
    ) / 2
    exp_b = (
        _expected_for_player(b_ids[0], b_ids[1], a_ids[0], a_ids[1])
        + _expected_for_player(b_ids[1], b_ids[0], a_ids[0], a_ids[1])
    ) / 2

    actual_winner = "A" if game.team_a_score > game.team_b_score else "B"
    expected_winner = "A" if exp_a >= exp_b else "B"

    return {
        "expected_score_a": round(exp_a, 1),
        "expected_score_b": round(exp_b, 1),
        "expected_winner": expected_winner,
        "actual_winner": actual_winner,
        "upset": expected_winner != actual_winner,
    }
```

- [ ] **Step 5: Update `backend/app/routers/games.py`**

Read `backend/app/routers/games.py`, then:

1. Import `GamePrediction` from schemas and `get_game_prediction` from the service.

2. Change the `GET /games` endpoint's `response_model` from `list[GameResponse]` to `list[GameDetailResponse]`.

3. Append the new endpoint:

```python
@router.get("/{game_id}/prediction", response_model=GamePrediction)
def game_prediction(game_id: int, db: Session = Depends(get_db)):
    try:
        return games_service.get_game_prediction(db, game_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 6: Run tests**

```bash
cd backend && python -m pytest tests/integration/test_games.py -v
```

Expected: all tests pass including the three new ones.

- [ ] **Step 7: Run full backend suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/services/games.py backend/app/routers/games.py backend/tests/integration/test_games.py
git commit -m "feat: GET /games returns team members; add GET /games/{id}/prediction"
```

---

### Task 2: Frontend — GameCard rewrite with strip, names, and expandable prediction

**Files:**
- Modify: `frontend/src/api/games.ts`
- Modify: `frontend/src/components/GameCard.tsx`
- Modify: `frontend/src/components/GameCard.test.tsx`

- [ ] **Step 1: Update `frontend/src/api/games.ts`**

Replace the entire file:

```typescript
import { apiFetch } from './client'
import type { GameDetail } from '../types'

export interface GamesFilter {
  week?: number
  player_id?: number
  team?: string
  vs?: string
}

export const getGames = (filter: GamesFilter = {}) => {
  const params = new URLSearchParams()
  if (filter.week !== undefined) params.set('week', String(filter.week))
  if (filter.player_id !== undefined) params.set('player_id', String(filter.player_id))
  if (filter.team) params.set('team', filter.team)
  if (filter.vs) params.set('vs', filter.vs)
  const qs = params.toString()
  return apiFetch<GameDetail[]>(`/games${qs ? `?${qs}` : ''}`)
}

export const getGame = (id: number) =>
  apiFetch<GameDetail>(`/games/${id}`)

export interface GamePrediction {
  expected_score_a: number
  expected_score_b: number
  expected_winner: 'A' | 'B'
  actual_winner: 'A' | 'B'
  upset: boolean
}

export const getGamePrediction = (id: number) =>
  apiFetch<GamePrediction>(`/games/${id}/prediction`)
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. If `GamesPage.tsx` has type errors from the `Game → GameDetail` change, fix them by updating the state type: `useState<GameDetail[]>([])`.

- [ ] **Step 3: Write the failing tests for GameCard**

Replace the entire contents of `frontend/src/components/GameCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GameCard from './GameCard'
import type { GameDetail } from '../types'

vi.mock('../api/games', () => ({
  getGamePrediction: vi.fn().mockResolvedValue({
    expected_score_a: 18.5,
    expected_score_b: 15.2,
    expected_winner: 'A',
    actual_winner: 'A',
    upset: false,
  }),
}))

const game: GameDetail = {
  id: 1,
  played_on: '2024-11-11',
  session: 28,
  game_number: 9,
  team_a_score: 21,
  team_b_score: 19,
  team_a: [
    { id: 1, canonical_name: 'Alice' },
    { id: 2, canonical_name: 'Bob' },
  ],
  team_b: [
    { id: 3, canonical_name: 'Chan' },
    { id: 4, canonical_name: 'Jay' },
  ],
}

const blowoutGame: GameDetail = {
  ...game,
  id: 2,
  team_a_score: 21,
  team_b_score: 5,  // gap = 16 → red strip
}

const normalGame: GameDetail = {
  ...game,
  id: 3,
  team_a_score: 21,
  team_b_score: 17,  // gap = 4 → yellow strip
}

describe('GameCard', () => {
  it('renders session, date and game number', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText(/Session 28/)).toBeInTheDocument()
    expect(screen.getByText('2024-11-11')).toBeInTheDocument()
    expect(screen.getByText(/Game #9/)).toBeInTheDocument()
  })

  it('renders team player names', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText(/Alice.*Bob|Bob.*Alice/)).toBeInTheDocument()
    expect(screen.getByText(/Chan.*Jay|Jay.*Chan/)).toBeInTheDocument()
  })

  it('renders scores', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('19')).toBeInTheDocument()
  })

  it('applies green strip for close game (≤3pt gap)', () => {
    const { container } = render(<GameCard game={game} />)  // gap = 2
    expect(container.querySelector('.bg-green-500')).toBeTruthy()
  })

  it('applies yellow strip for normal game (3–6pt gap)', () => {
    const { container } = render(<GameCard game={normalGame} />)  // gap = 4
    expect(container.querySelector('.bg-yellow-500')).toBeTruthy()
  })

  it('applies red strip for blowout game (>6pt gap)', () => {
    const { container } = render(<GameCard game={blowoutGame} />)  // gap = 16
    expect(container.querySelector('.bg-red-500')).toBeTruthy()
  })

  it('shows prediction after expanding', async () => {
    render(<GameCard game={game} />)
    fireEvent.click(screen.getByText(/show prediction/i))
    await waitFor(() => {
      expect(screen.getByText(/18\.5/)).toBeInTheDocument()
    })
  })

  it('collapses prediction on second click', async () => {
    render(<GameCard game={game} />)
    fireEvent.click(screen.getByText(/show prediction/i))
    await waitFor(() => screen.getByText(/18\.5/))
    fireEvent.click(screen.getByText(/hide prediction/i))
    expect(screen.queryByText(/18\.5/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run failing tests**

```bash
cd frontend && npm test -- --run GameCard
```

Expected: FAIL — `GameCard` doesn't yet accept `GameDetail` or render new content.

- [ ] **Step 5: Rewrite `frontend/src/components/GameCard.tsx`**

```typescript
import { useState } from 'react'
import type { GameDetail } from '../types'
import { getGamePrediction, type GamePrediction } from '../api/games'

interface Props {
  game: GameDetail
}

function nameList(players: { id: number; canonical_name: string }[]): string {
  return players.map((p) => p.canonical_name).join(' & ')
}

function stripColour(gap: number): string {
  if (gap <= 3) return 'bg-green-500'
  if (gap <= 6) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function GameCard({ game }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  const gap = Math.abs(game.team_a_score - game.team_b_score)

  const [expanded, setExpanded] = useState(false)
  const [prediction, setPrediction] = useState<GamePrediction | null>(null)
  const [loadingPrediction, setLoadingPrediction] = useState(false)

  const handleToggle = () => {
    if (!expanded && !prediction) {
      setLoadingPrediction(true)
      getGamePrediction(game.id)
        .then(setPrediction)
        .finally(() => setLoadingPrediction(false))
    }
    setExpanded((v) => !v)
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex">
        <div className={`w-1 shrink-0 ${stripColour(gap)}`} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{game.played_on}</span>
            {game.session != null && <span>Session {game.session}</span>}
            <span>Game #{game.game_number}</span>
          </div>

          {/* Team names */}
          <div className="mb-1 flex items-center justify-between text-sm font-medium">
            <span>{nameList(game.team_a)}</span>
            <span>{nameList(game.team_b)}</span>
          </div>

          {/* Score */}
          <div className="flex items-center justify-center gap-6 text-lg font-bold">
            <span className={aWon ? 'text-green-500' : 'text-muted-foreground'}>
              {game.team_a_score}
            </span>
            <span className="text-muted-foreground">vs</span>
            <span className={!aWon ? 'text-green-500' : 'text-muted-foreground'}>
              {game.team_b_score}
            </span>
          </div>

          {/* Expand toggle */}
          <button
            onClick={handleToggle}
            className="mt-2 w-full text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? '▲ Hide prediction' : '▼ Show prediction'}
          </button>

          {/* Prediction */}
          {expanded && (
            <div className="mt-2 border-t border-border pt-2 text-sm">
              {loadingPrediction ? (
                <p className="text-muted-foreground text-xs">Loading…</p>
              ) : prediction ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    Expected {prediction.expected_score_a.toFixed(1)}–{prediction.expected_score_b.toFixed(1)}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      prediction.upset ? 'text-yellow-400' : 'text-muted-foreground'
                    }`}
                  >
                    {prediction.upset ? '⚡ Upset' : '✓ Expected result'}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
cd frontend && npm test -- --run GameCard
```

Expected: all 9 tests pass.

- [ ] **Step 7: Run full frontend test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass. Fix any type errors in `GamesPage.tsx` if it uses `Game[]` state — change to `GameDetail[]`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/games.ts frontend/src/components/GameCard.tsx frontend/src/components/GameCard.test.tsx
git commit -m "feat: game cards show team names, colour strip, and expandable prediction"
```
