# Player Head-to-Head Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/compare/:a/:b` page showing H2H matchup history and side-by-side overall stats for any two players, reachable from the nav and from each player's detail page.

**Architecture:** Extend the existing `get_head_to_head` service to return score diff and per-player win breakdowns; add a new `get_compare_stats` service for side-by-side extended stats; add a new `get_opponent_ids` service and an `opponent_id` games filter to support UI dropdowns and the filtered game list. Four new frontend pages/components consume these endpoints.

**Tech Stack:** FastAPI, SQLAlchemy (1.x case/aliased patterns), Pydantic, pytest (real PostgreSQL, rollback fixture), React 19, TypeScript, Tailwind v4, shadcn/ui

---

## File Map

| File | Action |
|------|--------|
| `backend/app/services/stats.py` | Extend `get_head_to_head`; add `_get_extended_stats`, `get_compare_stats`, `get_opponent_ids` |
| `backend/app/schemas.py` | Extend `HeadToHeadResponse`; add `PlayerExtendedStats`, `CompareStatsResponse` |
| `backend/app/routers/stats.py` | Add `GET /stats/compare/{a}/{b}` and `GET /stats/opponents/{id}` |
| `backend/app/services/games.py` | Add `opponent_id` param to `get_games` |
| `backend/app/routers/games.py` | Add `opponent_id` query param |
| `backend/tests/integration/test_stats.py` | Tests for extended h2h, compare stats, opponent IDs |
| `backend/tests/integration/test_games.py` | Test for `opponent_id` filter |
| `frontend/src/api/stats.ts` | Add `getCompareStats`, `getOpponentIds` |
| `frontend/src/api/games.ts` | Add `opponent_id` to `GamesFilter` and `getGames` |
| `frontend/src/types/index.ts` | Add `CompareStats`, `PlayerExtendedStats` exports |
| `frontend/src/components/H2HCard.tsx` | New — head-to-head summary card |
| `frontend/src/components/CompareStatsCard.tsx` | New — side-by-side overall stats |
| `frontend/src/pages/ComparePage.tsx` | New — selector page |
| `frontend/src/pages/CompareDetailPage.tsx` | New — `/compare/:a/:b` detail view |
| `frontend/src/pages/PlayerDetailPage.tsx` | Add "Compare with…" button + dialog |
| `frontend/src/components/Nav.tsx` | Add Compare link after Players |
| `frontend/src/App.tsx` | Add `/compare` and `/compare/:a/:b` routes |

---

### Task 1: Extend H2H service and schema with score diff and win breakdown

**Files:**
- Modify: `backend/app/services/stats.py`
- Modify: `backend/app/schemas.py`
- Test: `backend/tests/integration/test_stats.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/test_stats.py` (append after existing `test_head_to_head`):

```python
def test_head_to_head_extended(client: TestClient, two_games):
    a, b = two_games["a"], two_games["b"]
    # two_games: Game 2 has Alpha+Xray (21) beat Beta+Yankee (15) → diff=6, normal win for Alpha
    data = client.get(f"/stats/head-to-head/{a}/{b}").json()
    assert data["avg_score_diff"] == 6.0
    assert data["favours"] == "a"
    assert data["player_a_close_wins"] == 0
    assert data["player_a_normal_wins"] == 1   # diff=6: 3 < 6 ≤ 6 → normal
    assert data["player_a_thrashing_wins"] == 0
    assert data["player_b_close_wins"] == 0
    assert data["player_b_normal_wins"] == 0
    assert data["player_b_thrashing_wins"] == 0


def test_head_to_head_favours_even(client: TestClient):
    """When neither player has won any games, favours is 'even'."""
    a = _create_player(client, "EvenA")
    b = _create_player(client, "EvenB")
    data = client.get(f"/stats/head-to-head/{a}/{b}").json()
    assert data["games_played"] == 0
    assert data["favours"] == "even"
    assert data["avg_score_diff"] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_head_to_head_extended tests/integration/test_stats.py::test_head_to_head_favours_even -v
```

Expected: FAIL — `KeyError: 'avg_score_diff'`

- [ ] **Step 3: Extend `HeadToHeadResponse` schema in `backend/app/schemas.py`**

Replace:
```python
class HeadToHeadResponse(BaseModel):
    player_a_id: int
    player_b_id: int
    games_played: int
    player_a_wins: int
    player_b_wins: int
```

With:
```python
class HeadToHeadResponse(BaseModel):
    player_a_id: int
    player_b_id: int
    games_played: int
    player_a_wins: int
    player_b_wins: int
    avg_score_diff: float
    favours: str  # "a", "b", or "even"
    player_a_close_wins: int
    player_a_normal_wins: int
    player_a_thrashing_wins: int
    player_b_close_wins: int
    player_b_normal_wins: int
    player_b_thrashing_wins: int
```

- [ ] **Step 4: Rewrite `get_head_to_head` in `backend/app/services/stats.py`**

Add module-level constants after the imports:
```python
_CLOSE_THRESHOLD = 3
_THRASHING_THRESHOLD = 6
```

Replace the entire `get_head_to_head` function:
```python
def get_head_to_head(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(player_ids)
    gp_a = aliased(GamePlayer)
    gp_b = aliased(GamePlayer)

    q = (
        db.query(Game, gp_a.team.label("team_a"))
        .join(gp_a, (gp_a.game_id == Game.id) & (gp_a.player_id == player_a_id))
        .join(gp_b, (gp_b.game_id == Game.id) & (gp_b.player_id == player_b_id) & (gp_b.team != gp_a.team))
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    a_wins = b_wins = 0
    a_close = a_normal = a_thrashing = 0
    b_close = b_normal = b_thrashing = 0
    total_diff = 0

    for game, team_a in rows:
        diff = abs(game.team_a_score - game.team_b_score)
        total_diff += diff
        a_won = (team_a == "A" and game.team_a_score > game.team_b_score) or \
                (team_a == "B" and game.team_b_score > game.team_a_score)

        if a_won:
            a_wins += 1
            if diff <= _CLOSE_THRESHOLD:
                a_close += 1
            elif diff <= _THRASHING_THRESHOLD:
                a_normal += 1
            else:
                a_thrashing += 1
        else:
            b_wins += 1
            if diff <= _CLOSE_THRESHOLD:
                b_close += 1
            elif diff <= _THRASHING_THRESHOLD:
                b_normal += 1
            else:
                b_thrashing += 1

    total = a_wins + b_wins
    avg_diff = round(total_diff / total, 2) if total else 0.0
    favours = "a" if a_wins > b_wins else ("b" if b_wins > a_wins else "even")

    return {
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
        "games_played": total,
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
        "avg_score_diff": avg_diff,
        "favours": favours,
        "player_a_close_wins": a_close,
        "player_a_normal_wins": a_normal,
        "player_a_thrashing_wins": a_thrashing,
        "player_b_close_wins": b_close,
        "player_b_normal_wins": b_normal,
        "player_b_thrashing_wins": b_thrashing,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_head_to_head tests/integration/test_stats.py::test_head_to_head_extended tests/integration/test_stats.py::test_head_to_head_favours_even -v
```

Expected: all 3 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/stats.py backend/app/schemas.py backend/tests/integration/test_stats.py
git commit -m "feat: extend h2h endpoint with score diff and win breakdown by margin"
```

---

### Task 2: Add `get_compare_stats` service, schema, and endpoint

**Files:**
- Modify: `backend/app/services/stats.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/stats.py`
- Test: `backend/tests/integration/test_stats.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/integration/test_stats.py`:

```python
def test_compare_stats(client: TestClient, two_games):
    a, b = two_games["a"], two_games["b"]
    # Alpha (a): 2 games, 2 wins — game1: diff=12 thrashing, game2: diff=6 normal
    # Beta (b):  2 games, 1 win  — game1: diff=12 thrashing win
    response = client.get(f"/stats/compare/{a}/{b}")
    assert response.status_code == 200
    data = response.json()
    pa = data["player_a"]
    pb = data["player_b"]
    assert pa["games_played"] == 2
    assert pa["wins"] == 2
    assert pa["close_wins"] == 0
    assert pa["normal_wins"] == 1
    assert pa["thrashing_wins"] == 1
    assert pb["games_played"] == 2
    assert pb["wins"] == 1
    assert pb["close_wins"] == 0
    assert pb["normal_wins"] == 0
    assert pb["thrashing_wins"] == 1


def test_compare_stats_unknown_player(client: TestClient):
    assert client.get("/stats/compare/99999/88888").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_compare_stats tests/integration/test_stats.py::test_compare_stats_unknown_player -v
```

Expected: FAIL — 404 (endpoint doesn't exist)

- [ ] **Step 3: Add schemas to `backend/app/schemas.py`**

Add after `HeadToHeadResponse`:
```python
class PlayerExtendedStats(BaseModel):
    player_id: int
    games_played: int
    wins: int
    win_rate: float
    avg_points: float
    close_wins: int
    normal_wins: int
    thrashing_wins: int


class CompareStatsResponse(BaseModel):
    player_a: PlayerExtendedStats
    player_b: PlayerExtendedStats
```

- [ ] **Step 4: Add `_get_extended_stats` and `get_compare_stats` to `backend/app/services/stats.py`**

Add after `get_head_to_head`:
```python
def _get_extended_stats(db: Session, player_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(player_ids)
    diff = func.abs(Game.team_a_score - Game.team_b_score)

    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    close_win_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score) & (diff <= _CLOSE_THRESHOLD), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score) & (diff <= _CLOSE_THRESHOLD), 1),
        else_=0,
    )
    normal_win_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score) & (diff > _CLOSE_THRESHOLD) & (diff <= _THRASHING_THRESHOLD), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score) & (diff > _CLOSE_THRESHOLD) & (diff <= _THRASHING_THRESHOLD), 1),
        else_=0,
    )
    thrashing_win_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score) & (diff > _THRASHING_THRESHOLD), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score) & (diff > _THRASHING_THRESHOLD), 1),
        else_=0,
    )

    q = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
            func.sum(close_win_case).label("close_wins"),
            func.sum(normal_win_case).label("normal_wins"),
            func.sum(thrashing_win_case).label("thrashing_wins"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    row = q.one()

    games = row.games_played or 0
    wins = int(row.wins or 0)
    return {
        "player_id": player_id,
        "games_played": games,
        "wins": wins,
        "win_rate": round(wins / games, 4) if games else 0.0,
        "avg_points": round(float(row.avg_points or 0), 2),
        "close_wins": int(row.close_wins or 0),
        "normal_wins": int(row.normal_wins or 0),
        "thrashing_wins": int(row.thrashing_wins or 0),
    }


def get_compare_stats(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    if not db.get(Player, player_a_id):
        raise KeyError(f"Player {player_a_id} not found")
    if not db.get(Player, player_b_id):
        raise KeyError(f"Player {player_b_id} not found")
    return {
        "player_a": _get_extended_stats(db, player_a_id, player_ids),
        "player_b": _get_extended_stats(db, player_b_id, player_ids),
    }
```

- [ ] **Step 5: Add imports and endpoint to `backend/app/routers/stats.py`**

Add to the import at the top:
```python
from ..schemas import (
    LeaderboardEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    PlayerStatsResponse,
    HeadToHeadResponse,
    MatchupResponse,
    CompareStatsResponse,
)
```

Append endpoint:
```python
@router.get("/compare/{player_a_id}/{player_b_id}", response_model=CompareStatsResponse)
def compare_stats(
    player_a_id: int,
    player_b_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_compare_stats(db, player_a_id, player_b_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_compare_stats tests/integration/test_stats.py::test_compare_stats_unknown_player -v
```

Expected: both PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/stats.py backend/app/schemas.py backend/app/routers/stats.py backend/tests/integration/test_stats.py
git commit -m "feat: add compare stats endpoint with per-player extended win breakdown"
```

---

### Task 3: Add `get_opponent_ids` endpoint and `opponent_id` game filter

**Files:**
- Modify: `backend/app/services/stats.py`
- Modify: `backend/app/routers/stats.py`
- Modify: `backend/app/services/games.py`
- Modify: `backend/app/routers/games.py`
- Test: `backend/tests/integration/test_stats.py`
- Test: `backend/tests/integration/test_games.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/integration/test_stats.py`:

```python
def test_get_opponent_ids(client: TestClient, two_games):
    a, b, x, y = two_games["a"], two_games["b"], two_games["x"], two_games["y"]
    # Game 1: Alpha+Beta vs Xray+Yankee → Alpha opposes Xray, Yankee
    # Game 2: Alpha+Xray vs Beta+Yankee  → Alpha opposes Beta, Yankee
    # Alpha's opponents: Beta, Xray, Yankee
    data = client.get(f"/stats/opponents/{a}").json()
    assert set(data) == {b, x, y}


def test_get_opponent_ids_empty(client: TestClient):
    p = _create_player(client, "Lonely")
    data = client.get(f"/stats/opponents/{p}").json()
    assert data == []
```

Append to `backend/tests/integration/test_games.py`:

```python
def test_filter_games_by_opponent_id(client: TestClient, seeded_games):
    a, x = seeded_games["a"], seeded_games["x"]
    # Game 1: GA+GB vs GX+GY  → GA and GX are opponents
    # Game 2: GA+GX vs GB+GY  → GA and GX are partners
    response = client.get(f"/games?player_id={a}&opponent_id={x}")
    assert response.status_code == 200
    assert len(response.json()) == 1  # only game 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_get_opponent_ids tests/integration/test_stats.py::test_get_opponent_ids_empty tests/integration/test_games.py::test_filter_games_by_opponent_id -v
```

Expected: all FAIL

- [ ] **Step 3: Add `get_opponent_ids` to `backend/app/services/stats.py`**

Append after `get_compare_stats`:
```python
def get_opponent_ids(db: Session, player_id: int, player_ids: list[int] | None = None) -> list[int]:
    valid_ids = _valid_game_ids(player_ids)
    gp_self = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)

    q = (
        db.query(gp_opp.player_id.distinct())
        .join(gp_self, (gp_self.game_id == gp_opp.game_id) & (gp_self.team != gp_opp.team) & (gp_self.player_id == player_id))
        .join(Game, gp_opp.game_id == Game.id)
        .filter(gp_opp.player_id != player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    return [row[0] for row in q.all()]
```

- [ ] **Step 4: Add `/stats/opponents/{player_id}` endpoint to `backend/app/routers/stats.py`**

Append:
```python
@router.get("/opponents/{player_id}", response_model=list[int])
def opponents(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return stats_service.get_opponent_ids(db, player_id, player_ids or None)
```

- [ ] **Step 5: Add `opponent_id` param to `get_games` in `backend/app/services/games.py`**

Replace the function signature and the `player_id` block:
```python
def get_games(
    db: Session,
    week: int | None = None,
    player_id: int | None = None,
    opponent_id: int | None = None,
    team_ids: tuple[int, int] | None = None,
    vs_ids: tuple[int, int] | None = None,
) -> list[dict[str, Any]]:
    ranked = (
        db.query(Game, _session_rank.c.session)
        .join(_session_rank, _session_rank.c.played_on == Game.played_on)
    )

    if week is not None:
        ranked = ranked.filter(_session_rank.c.session == week)

    if player_id is not None and opponent_id is not None:
        gp_self = aliased(GamePlayer)
        gp_opp = aliased(GamePlayer)
        ranked = (
            ranked
            .join(gp_self, (gp_self.game_id == Game.id) & (gp_self.player_id == player_id))
            .join(gp_opp, (gp_opp.game_id == Game.id) & (gp_opp.player_id == opponent_id) & (gp_opp.team != gp_self.team))
        )
    elif player_id is not None:
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

    return [_game_summary(g, session) for g, session in ranked.distinct().all()]
```

- [ ] **Step 6: Add `opponent_id` query param to `backend/app/routers/games.py`**

Replace the `list_games` function:
```python
@router.get("", response_model=list[GameResponse])
def list_games(
    week: Optional[int] = None,
    player_id: Optional[int] = None,
    opponent_id: Optional[int] = None,
    team: Optional[str] = None,
    vs: Optional[str] = None,
    db: Session = Depends(get_db),
):
    team_ids = None
    vs_ids = None
    if team:
        try:
            a, b = [int(x) for x in team.split(",")]
            team_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="team must be two comma-separated player IDs")
    if vs:
        try:
            a, b = [int(x) for x in vs.split(",")]
            vs_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="vs must be two comma-separated player IDs")

    return games_service.get_games(
        db, week=week, player_id=player_id, opponent_id=opponent_id,
        team_ids=team_ids, vs_ids=vs_ids,
    )
```

- [ ] **Step 7: Run all new tests**

```bash
cd backend && python -m pytest tests/integration/test_stats.py::test_get_opponent_ids tests/integration/test_stats.py::test_get_opponent_ids_empty tests/integration/test_games.py::test_filter_games_by_opponent_id -v
```

Expected: all PASS

- [ ] **Step 8: Run the full test suite to check for regressions**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/stats.py backend/app/routers/stats.py backend/app/services/games.py backend/app/routers/games.py backend/tests/integration/test_stats.py backend/tests/integration/test_games.py
git commit -m "feat: add opponent IDs endpoint and opponent_id game filter"
```

---

### Task 4: Regenerate frontend types and update API layer

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/api/stats.ts`
- Modify: `frontend/src/api/games.ts`

- [ ] **Step 1: Regenerate types from the updated OpenAPI schema**

```bash
cd backend && python export_openapi.py
cd ../frontend && npm run generate-types
```

Expected output from export: `Written to /path/to/openapi.json`
Expected output from generate-types: exits 0, updates `src/types/api.gen.ts`

- [ ] **Step 2: Add new type exports to `frontend/src/types/index.ts`**

Add after the existing exports:
```typescript
export type PlayerExtendedStats = Schema["PlayerExtendedStats"];
export type CompareStats = Schema["CompareStatsResponse"];
```

- [ ] **Step 3: Add `getCompareStats` and `getOpponentIds` to `frontend/src/api/stats.ts`**

The full updated file:
```typescript
import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead, CompareStats } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate', playerIds?: number[]) => {
  const base = new URLSearchParams({ sort_by: sortBy }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?${base}${filter ? '&' + filter : ''}`)
}

export const getAllPartnerships = (playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<Partnership[]>(`/stats/partnerships${filter ? '?' + filter : ''}`)
}

export const getHeadToHead = (playerAId: number, playerBId: number, playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<HeadToHead>(`/stats/head-to-head/${playerAId}/${playerBId}${filter ? '?' + filter : ''}`)
}

export const getCompareStats = (playerAId: number, playerBId: number, playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<CompareStats>(`/stats/compare/${playerAId}/${playerBId}${filter ? '?' + filter : ''}`)
}

export const getOpponentIds = (playerId: number, playerIds?: number[]) => {
  const filter = playerIdsQs(playerIds)
  return apiFetch<number[]>(`/stats/opponents/${playerId}${filter ? '?' + filter : ''}`)
}
```

- [ ] **Step 4: Add `opponent_id` to `GamesFilter` in `frontend/src/api/games.ts`**

```typescript
import { apiFetch } from './client'
import type { Game, GameDetail } from '../types'

export interface GamesFilter {
  week?: number
  player_id?: number
  opponent_id?: number
  team?: string
  vs?: string
}

export const getGames = (filter: GamesFilter = {}) => {
  const params = new URLSearchParams()
  if (filter.week !== undefined) params.set('week', String(filter.week))
  if (filter.player_id !== undefined) params.set('player_id', String(filter.player_id))
  if (filter.opponent_id !== undefined) params.set('opponent_id', String(filter.opponent_id))
  if (filter.team) params.set('team', filter.team)
  if (filter.vs) params.set('vs', filter.vs)
  const qs = params.toString()
  return apiFetch<Game[]>(`/games${qs ? `?${qs}` : ''}`)
}

export const getGame = (id: number) =>
  apiFetch<GameDetail>(`/games/${id}`)
```

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0, no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/stats.ts frontend/src/api/games.ts openapi.json frontend/src/types/api.gen.ts
git commit -m "feat: regenerate types and update frontend API layer for compare feature"
```

---

### Task 5: Build `H2HCard` component

**Files:**
- Create: `frontend/src/components/H2HCard.tsx`

- [ ] **Step 1: Create `frontend/src/components/H2HCard.tsx`**

```typescript
import type { HeadToHead, Player } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  h2h: HeadToHead
  playerA: Player
  playerB: Player
}

function WinBreakdown({
  label,
  close,
  normal,
  thrashing,
}: {
  label: string
  close: number
  normal: number
  thrashing: number
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between rounded bg-green-950 px-2 py-1 text-xs text-green-300">
          <span>Close</span>
          <span className="font-bold">{close}</span>
        </div>
        <div className="flex justify-between rounded bg-yellow-950 px-2 py-1 text-xs text-yellow-300">
          <span>Normal</span>
          <span className="font-bold">{normal}</span>
        </div>
        <div className="flex justify-between rounded bg-red-950 px-2 py-1 text-xs text-red-300">
          <span>Thrashing</span>
          <span className="font-bold">{thrashing}</span>
        </div>
      </div>
    </div>
  )
}

export default function H2HCard({ h2h, playerA, playerB }: Props) {
  if (h2h.games_played === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Head-to-Head</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No direct matchups yet.</p>
        </CardContent>
      </Card>
    )
  }

  const aWinPct = ((h2h.player_a_wins / h2h.games_played) * 100).toFixed(1)
  const bWinPct = ((h2h.player_b_wins / h2h.games_played) * 100).toFixed(1)
  const favoursName =
    h2h.favours === 'a'
      ? playerA.canonical_name
      : h2h.favours === 'b'
        ? playerB.canonical_name
        : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Head-to-Head · {h2h.games_played} game{h2h.games_played !== 1 ? 's' : ''}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 items-center gap-2">
          <div>
            <p className="text-2xl font-bold">{aWinPct}%</p>
            <p className="text-xs text-muted-foreground">{playerA.canonical_name} win %</p>
          </div>
          <p className="text-center text-xs text-muted-foreground">win rate</p>
          <div className="text-right">
            <p className="text-2xl font-bold">{bWinPct}%</p>
            <p className="text-xs text-muted-foreground">{playerB.canonical_name} win %</p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <p className="text-xl font-bold">{h2h.avg_score_diff} pts</p>
          <p className="text-xs text-muted-foreground">
            avg score diff
            {favoursName ? (
              <>
                {' · '}
                <span className="font-medium text-blue-400">in favour of {favoursName}</span>
              </>
            ) : (
              ' · even'
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <WinBreakdown
            label={`${playerA.canonical_name}'s ${h2h.player_a_wins} wins`}
            close={h2h.player_a_close_wins}
            normal={h2h.player_a_normal_wins}
            thrashing={h2h.player_a_thrashing_wins}
          />
          <WinBreakdown
            label={`${playerB.canonical_name}'s ${h2h.player_b_wins} wins`}
            close={h2h.player_b_close_wins}
            normal={h2h.player_b_normal_wins}
            thrashing={h2h.player_b_thrashing_wins}
          />
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/H2HCard.tsx
git commit -m "feat: add H2HCard component"
```

---

### Task 6: Build `CompareStatsCard` component

**Files:**
- Create: `frontend/src/components/CompareStatsCard.tsx`

- [ ] **Step 1: Create `frontend/src/components/CompareStatsCard.tsx`**

```typescript
import type { CompareStats, Player } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  stats: CompareStats
  playerA: Player
  playerB: Player
}

interface StatRow {
  label: string
  aDisplay: string | number
  bDisplay: string | number
  aVal: number
  bVal: number
  divider?: boolean
}

export default function CompareStatsCard({ stats, playerA, playerB }: Props) {
  const a = stats.player_a
  const b = stats.player_b

  const rows: StatRow[] = [
    {
      label: 'win rate',
      aDisplay: `${(a.win_rate * 100).toFixed(1)}%`,
      bDisplay: `${(b.win_rate * 100).toFixed(1)}%`,
      aVal: a.win_rate,
      bVal: b.win_rate,
    },
    {
      label: 'avg pts',
      aDisplay: a.avg_points.toFixed(1),
      bDisplay: b.avg_points.toFixed(1),
      aVal: a.avg_points,
      bVal: b.avg_points,
    },
    { label: 'games', aDisplay: a.games_played, bDisplay: b.games_played, aVal: a.games_played, bVal: b.games_played },
    { label: 'total wins', aDisplay: a.wins, bDisplay: b.wins, aVal: a.wins, bVal: b.wins },
    { label: 'close wins', aDisplay: a.close_wins, bDisplay: b.close_wins, aVal: a.close_wins, bVal: b.close_wins, divider: true },
    { label: 'normal wins', aDisplay: a.normal_wins, bDisplay: b.normal_wins, aVal: a.normal_wins, bVal: b.normal_wins },
    { label: 'thrashings', aDisplay: a.thrashing_wins, bDisplay: b.thrashing_wins, aVal: a.thrashing_wins, bVal: b.thrashing_wins },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Overall Stats</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-2">
          <div className="py-1 text-xs font-semibold text-muted-foreground">
            {playerA.canonical_name}
          </div>
          <div />
          <div className="py-1 text-right text-xs font-semibold text-muted-foreground">
            {playerB.canonical_name}
          </div>
          <div className="col-span-3 mb-1 h-px bg-border" />

          {rows.map(({ label, aDisplay, bDisplay, aVal, bVal, divider }) => (
            <>
              {divider && <div key={`div-${label}`} className="col-span-3 my-1 h-px bg-border" />}
              <div
                key={`a-${label}`}
                className={`py-1.5 text-base font-bold ${aVal >= bVal ? 'text-foreground' : 'text-slate-600'}`}
              >
                {aDisplay}
              </div>
              <div
                key={`l-${label}`}
                className="self-center text-center text-xs text-muted-foreground"
              >
                {label}
              </div>
              <div
                key={`b-${label}`}
                className={`py-1.5 text-right text-base font-bold ${bVal >= aVal ? 'text-foreground' : 'text-slate-600'}`}
              >
                {bDisplay}
              </div>
            </>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CompareStatsCard.tsx
git commit -m "feat: add CompareStatsCard component"
```

---

### Task 7: Build `ComparePage` selector

**Files:**
- Create: `frontend/src/pages/ComparePage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/ComparePage.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlayers } from '../api/players'
import { getOpponentIds } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Player } from '../types'

export default function ComparePage() {
  const navigate = useNavigate()
  const { selectedIds } = usePlayerFilter()
  const [players, setPlayers] = useState<Player[]>([])
  const [playerAId, setPlayerAId] = useState<number | null>(null)
  const [playerBId, setPlayerBId] = useState<number | null>(null)
  const [opponentIds, setOpponentIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    getPlayers().then(setPlayers).catch(() => {})
  }, [])

  useEffect(() => {
    if (playerAId === null) {
      setOpponentIds(new Set())
      setPlayerBId(null)
      return
    }
    getOpponentIds(playerAId, selectedIds)
      .then((ids) => {
        setOpponentIds(new Set(ids))
        setPlayerBId(null)
      })
      .catch(() => {})
  }, [playerAId, selectedIds])

  const playerBOptions = players.filter((p) => p.id !== playerAId && opponentIds.has(p.id))

  const handleCompare = () => {
    if (playerAId === null || playerBId === null) return
    const lo = Math.min(playerAId, playerBId)
    const hi = Math.max(playerAId, playerBId)
    navigate(`/compare/${lo}/${hi}`)
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Compare Players</h1>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Player A</label>
          <Select onValueChange={(v) => setPlayerAId(Number(v))}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select player" />
            </SelectTrigger>
            <SelectContent>
              {players.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.canonical_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Player B</label>
          <Select
            disabled={playerAId === null || playerBOptions.length === 0}
            onValueChange={(v) => setPlayerBId(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue
                placeholder={playerAId === null ? 'Select A first' : 'Select player'}
              />
            </SelectTrigger>
            <SelectContent>
              {playerBOptions.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.canonical_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleCompare} disabled={playerAId === null || playerBId === null}>
          Compare
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ComparePage.tsx
git commit -m "feat: add Compare selector page"
```

---

### Task 8: Build `CompareDetailPage`

**Files:**
- Create: `frontend/src/pages/CompareDetailPage.tsx`

- [ ] **Step 1: Create `frontend/src/pages/CompareDetailPage.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getPlayer } from '../api/players'
import { getHeadToHead, getCompareStats } from '../api/stats'
import { getGames } from '../api/games'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import H2HCard from '../components/H2HCard'
import CompareStatsCard from '../components/CompareStatsCard'
import GameCard from '../components/GameCard'
import type { Player, HeadToHead, CompareStats, Game } from '../types'

export default function CompareDetailPage() {
  const { a: rawA, b: rawB } = useParams<{ a: string; b: string }>()
  const navigate = useNavigate()
  const { selectedIds } = usePlayerFilter()

  const aId = Number(rawA)
  const bId = Number(rawB)

  // Normalise URL: smaller ID always first
  useEffect(() => {
    if (aId > bId) {
      navigate(`/compare/${bId}/${aId}`, { replace: true })
    }
  }, [aId, bId, navigate])

  const [playerA, setPlayerA] = useState<Player | null>(null)
  const [playerB, setPlayerB] = useState<Player | null>(null)
  const [h2h, setH2H] = useState<HeadToHead | null>(null)
  const [compareStats, setCompareStats] = useState<CompareStats | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (aId > bId) return // wait for redirect to canonical URL
    Promise.all([
      getPlayer(aId),
      getPlayer(bId),
      getHeadToHead(aId, bId, selectedIds),
      getCompareStats(aId, bId, selectedIds),
      getGames({ player_id: aId, opponent_id: bId }),
    ])
      .then(([pa, pb, h, cs, gs]) => {
        setPlayerA(pa)
        setPlayerB(pb)
        setH2H(h)
        setCompareStats(cs)
        setGames(gs)
      })
      .catch((e: Error) => setError(e.message))
  }, [aId, bId, selectedIds])

  if (error) return <p className="text-destructive">{error}</p>
  if (!playerA || !playerB || !h2h || !compareStats) {
    return <p className="text-muted-foreground">Loading…</p>
  }

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/compare" className="hover:text-yellow-400">
          Compare
        </Link>
        {' / '}
        {playerA.canonical_name} vs {playerB.canonical_name}
      </div>

      <h1 className="mb-6 text-2xl font-bold">
        {playerA.canonical_name}{' '}
        <span className="font-normal text-muted-foreground">vs</span>{' '}
        {playerB.canonical_name}
      </h1>

      <div className="space-y-6">
        <H2HCard h2h={h2h} playerA={playerA} playerB={playerB} />
        <CompareStatsCard stats={compareStats} playerA={playerA} playerB={playerB} />

        <div>
          <h2 className="mb-3 text-lg font-semibold">Games</h2>
          {games.length === 0 ? (
            <p className="text-muted-foreground">No direct matchups found.</p>
          ) : (
            <div className="space-y-3">
              {games.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/CompareDetailPage.tsx
git commit -m "feat: add CompareDetailPage"
```

---

### Task 9: Wire routes, nav, and PlayerDetailPage "Compare with…" button

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Nav.tsx`
- Modify: `frontend/src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Add routes to `frontend/src/App.tsx`**

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import LeaderboardPage from './pages/LeaderboardPage'
import PlayersPage from './pages/PlayersPage'
import PlayerDetailPage from './pages/PlayerDetailPage'
import GamesPage from './pages/GamesPage'
import UploadPage from './pages/UploadPage'
import GraphPage from './pages/GraphPage'
import AnomaliesPage from './pages/AnomaliesPage'
import ComparePage from './pages/ComparePage'
import CompareDetailPage from './pages/CompareDetailPage'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:id" element={<PlayerDetailPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/anomalies" element={<AnomaliesPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/compare/:a/:b" element={<CompareDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Add Compare link to `frontend/src/components/Nav.tsx`**

```typescript
const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/players', label: 'Players' },
  { to: '/compare', label: 'Compare' },
  { to: '/games', label: 'Games' },
  { to: '/graph', label: 'Graph' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/upload', label: 'Upload' },
]
```

- [ ] **Step 3: Add "Compare with…" button and dialog to `frontend/src/pages/PlayerDetailPage.tsx`**

Full updated file:
```typescript
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships, getPlayers, deletePlayer, updatePlayer } from '../api/players'
import { getOpponentIds } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const navigate = useNavigate()
  const { selectedIds } = usePlayerFilter()

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [error, setError] = useState<string | null>(null)
  const [togglingSubb, setTogglingSubb] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [opponentIds, setOpponentIds] = useState<Set<number>>(new Set())
  const [compareTarget, setCompareTarget] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      getPlayer(playerId),
      getPlayerStats(playerId, selectedIds),
      getPlayerPartnerships(playerId, selectedIds),
      getPlayers(),
    ])
      .then(([p, s, partners, players]) => {
        setPlayer(p)
        setStats(s)
        setPartnerships(partners)
        setAllPlayers(players)
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId, selectedIds])

  useEffect(() => {
    if (!compareOpen) return
    getOpponentIds(playerId, selectedIds)
      .then((ids) => setOpponentIds(new Set(ids)))
      .catch(() => {})
  }, [compareOpen, playerId, selectedIds])

  const handleToggleSub = () => {
    if (!player || togglingSubb) return
    setTogglingSubb(true)
    updatePlayer(playerId, { is_sub: !player.is_sub })
      .then((updated) => setPlayer(updated))
      .finally(() => setTogglingSubb(false))
  }

  const handleDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    deletePlayer(playerId)
      .then(() => navigate('/players'))
      .catch((e: Error) => {
        setDeleteError(e.message)
        setDeleting(false)
      })
  }

  const handleCompare = () => {
    if (!compareTarget) return
    const lo = Math.min(playerId, compareTarget)
    const hi = Math.max(playerId, compareTarget)
    navigate(`/compare/${lo}/${hi}`)
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (!player || !stats) return <p className="text-muted-foreground">Loading…</p>

  const compareOptions = allPlayers.filter((p) => p.id !== playerId && opponentIds.has(p.id))

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/players" className="hover:text-yellow-400">Players</Link>
        {' / '}
        {player.canonical_name}
      </div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{player.canonical_name}</h1>
        <button
          onClick={handleToggleSub}
          disabled={togglingSubb}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            player.is_sub
              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {player.is_sub ? 'Sub' : 'Regular'}
        </button>
        <Button variant="outline" size="sm" onClick={() => { setCompareTarget(null); setCompareOpen(true) }}>
          Compare with…
        </Button>
        <Button variant="destructive" size="sm" onClick={() => { setDeleteError(null); setDeleteOpen(true) }}>
          Delete
        </Button>
      </div>
      {player.aliases.length > 0 && (
        <p className="mb-6 text-sm text-muted-foreground">
          Also known as: {player.aliases.map((a) => a.alias).join(', ')}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <StatCard label="Games" value={stats.games_played} />
        <StatCard label="Wins" value={stats.wins} />
        <StatCard label="Losses" value={stats.losses} />
        <StatCard label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} />
        <StatCard label="Avg Pts" value={stats.avg_points.toFixed(1)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Partnerships</CardTitle>
        </CardHeader>
        <CardContent>
          {partnerships.length === 0
            ? <p className="text-muted-foreground">No partnerships yet.</p>
            : <PartnershipTable partnerships={partnerships} playerNames={Object.fromEntries(allPlayers.map((p) => [p.id, p.canonical_name]))} />}
        </CardContent>
      </Card>

      {/* Compare dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare {player.canonical_name} with…</DialogTitle>
          </DialogHeader>
          {compareOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opponents to compare with yet.</p>
          ) : (
            <Select onValueChange={(v) => setCompareTarget(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a player" />
              </SelectTrigger>
              <SelectContent>
                {compareOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.canonical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOpen(false)}>Cancel</Button>
            <Button onClick={handleCompare} disabled={!compareTarget}>Compare</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {player.canonical_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Players with recorded games cannot be deleted.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0

- [ ] **Step 5: Run full backend test suite one final time**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Nav.tsx frontend/src/pages/PlayerDetailPage.tsx
git commit -m "feat: wire compare routes, nav link, and player detail compare button"
```

---

## Self-Review

**Spec coverage:**
- ✅ `/compare` selector page — Task 7
- ✅ `/compare/:a/:b` detail page — Task 8
- ✅ "Compare with…" on player detail — Task 9
- ✅ Nav link — Task 9
- ✅ URL normalisation (smaller ID first, redirect) — Task 8
- ✅ H2H section: win %, avg score diff with favours label, per-player close/normal/thrashing breakdown — Tasks 1, 5
- ✅ Empty state (no matchups) — Task 5
- ✅ Overall stats: win rate, avg pts, games, wins, close/normal/thrashing wins; white leader, dimmed loser — Task 6
- ✅ Games section filtered to direct matchups — Tasks 3, 8
- ✅ Global filter respected by h2h and compare stats endpoints — Tasks 1, 2
- ✅ `GET /stats/h2h` (extended) and `GET /stats/compare/{a}/{b}` — Tasks 1, 2
- ✅ Player B dropdown filtered to actual opponents — Tasks 3, 7

**Placeholder scan:** None found.

**Type consistency:**
- `HeadToHead` (frontend type) maps to extended `HeadToHeadResponse` — used in `H2HCard` and `CompareDetailPage` ✅
- `CompareStats` maps to `CompareStatsResponse` — used in `CompareStatsCard` and `CompareDetailPage` ✅
- `_CLOSE_THRESHOLD = 3`, `_THRASHING_THRESHOLD = 6` defined once at module level, used in both `get_head_to_head` and `_get_extended_stats` ✅
- `opponent_id` added consistently to service, router, and frontend `GamesFilter` ✅
