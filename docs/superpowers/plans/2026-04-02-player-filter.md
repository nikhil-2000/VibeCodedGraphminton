# Player Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global player filter (persisted in React context) that restricts all stats to games where all 4 participants are in the selected player set. Default is regulars-only (no subs). UI is a nav bar popover with preset chips and a player checklist.

**Architecture:** Backend — a single `_valid_game_ids` helper in `services/stats.py` converts a player ID list to a subquery of valid game IDs; every service function applies it. Anomalies service has its own equivalent helper (Python set, no cross-module import). All affected endpoints gain a `player_ids` query param. Frontend — `PlayerFilterContext` loads all players on mount, defaults to regulars-only, exposes `selectedIds` to all pages via `usePlayerFilter()`. A `PlayerFilterPopover` in the nav bar lets users switch presets or pick individual players.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React 19 + TypeScript + shadcn/ui Popover (frontend).

---

## File Structure

**Backend — modify:**
- `backend/app/services/stats.py` — add `_valid_game_ids` helper; add `player_ids` param to all 7 functions
- `backend/app/services/anomalies.py` — add `_valid_game_id_set` helper; propagate to both anomaly functions and their internal helpers
- `backend/app/routers/stats.py` — add `player_ids: list[int] = Query(default=[])` to all endpoints
- `backend/app/routers/anomalies.py` — same
- `backend/app/routers/players.py` — add `player_ids` to `GET /{player_id}/stats`
- `backend/tests/integration/test_stats.py` — add filter tests

**Frontend — create:**
- `frontend/src/context/PlayerFilterContext.tsx` — context, provider, `usePlayerFilter` hook

**Frontend — modify:**
- `frontend/src/main.tsx` — wrap app in `<PlayerFilterProvider>`
- `frontend/src/components/PlayerFilterPopover.tsx` — create popover component
- `frontend/src/components/Nav.tsx` — add `<PlayerFilterPopover />`
- `frontend/src/api/stats.ts` — add `playerIds` param to `getLeaderboard`, `getAllPartnerships`, `getHeadToHead`
- `frontend/src/api/players.ts` — add `playerIds` param to `getPlayerStats`, `getPlayerPartnerships`
- `frontend/src/api/anomalies.ts` — add `playerIds` param to both functions
- `frontend/src/pages/LeaderboardPage.tsx` — consume context
- `frontend/src/pages/PlayerDetailPage.tsx` — consume context
- `frontend/src/pages/GraphPage.tsx` — consume context
- `frontend/src/pages/AnomaliesPage.tsx` — consume context

---

## Tasks

### Task 1: Backend stats service — `_valid_game_ids` + filter all stat functions

**Files:**
- Modify: `backend/app/services/stats.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/test_stats.py`:

```python
@pytest.fixture
def mixed_fixture(client: TestClient):
    """
    Game 1 (regulars only): RegA+RegB beat RegX+RegY 21-9
    Game 2 (includes sub):  RegA+SubS beat RegB+RegY 21-15
    """
    a = _create_player(client, "RegA")
    b = _create_player(client, "RegB")
    x = _create_player(client, "RegX")
    y = _create_player(client, "RegY")
    s = client.post("/players", json={"canonical_name": "SubS", "is_sub": True, "aliases": []}).json()["id"]
    resp = client.post("/ingest/scores", json={"files": [
        "08-04-2024,1,RegA,RegB,21,RegX,RegY,9\n"
        "08-04-2024,2,RegA,SubS,21,RegB,RegY,15\n"
    ]})
    assert resp.status_code == 200, resp.json()
    return {"a": a, "b": b, "x": x, "y": y, "s": s}


def test_leaderboard_player_ids_filter(client: TestClient, mixed_fixture):
    a, b, x, y, s = mixed_fixture["a"], mixed_fixture["b"], mixed_fixture["x"], mixed_fixture["y"], mixed_fixture["s"]
    regular_ids = [a, b, x, y]
    qs = "&".join(f"player_ids={i}" for i in regular_ids)

    # Unfiltered: RegA has 2 games (played in both)
    unfiltered = {e["player_id"]: e for e in client.get("/stats/leaderboard").json()}
    assert unfiltered[a]["games_played"] == 2

    # Filtered to regulars: RegA has 1 game, SubS absent
    filtered = {e["player_id"]: e for e in client.get(f"/stats/leaderboard?{qs}").json()}
    assert filtered[a]["games_played"] == 1
    assert s not in filtered


def test_player_stats_player_ids_filter(client: TestClient, mixed_fixture):
    a, s = mixed_fixture["a"], mixed_fixture["s"]
    regular_ids = [mixed_fixture["a"], mixed_fixture["b"], mixed_fixture["x"], mixed_fixture["y"]]
    qs = "&".join(f"player_ids={i}" for i in regular_ids)

    unfiltered = client.get(f"/stats/player/{a}").json()
    assert unfiltered["games_played"] == 2

    filtered = client.get(f"/stats/player/{a}?{qs}").json()
    assert filtered["games_played"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_stats.py::test_leaderboard_player_ids_filter backend/tests/integration/test_stats.py::test_player_stats_player_ids_filter -v
```

Expected: FAIL — `player_ids` param does not exist yet.

- [ ] **Step 3: Add `_valid_game_ids` helper and update all service functions**

Replace the entire contents of `backend/app/services/stats.py`:

```python
from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, case
from ..models import Player, Game, GamePlayer


def _valid_game_ids(db: Session, player_ids: list[int] | None):
    """Returns a subquery of game IDs where all 4 participants are in player_ids.
    Returns None when player_ids is None or empty (no filter — all games counted)."""
    if not player_ids:
        return None
    excluded = (
        db.query(GamePlayer.game_id)
        .filter(GamePlayer.player_id.notin_(player_ids))
        .subquery()
    )
    return db.query(Game.id).filter(~Game.id.in_(excluded)).subquery()


def get_player_stats(db: Session, player_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    valid_ids = _valid_game_ids(db, player_ids)
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    q = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    result = q.one()

    games_played = result.games_played or 0
    wins = int(result.wins or 0)
    return {
        "player_id": player_id,
        "games_played": games_played,
        "wins": wins,
        "losses": games_played - wins,
        "win_rate": round(wins / games_played, 4) if games_played else 0.0,
        "avg_points": round(float(result.avg_points or 0), 2),
    }


def get_leaderboard(db: Session, sort_by: str = "win_rate", player_ids: list[int] | None = None) -> list[dict[str, Any]]:
    valid_ids = _valid_game_ids(db, player_ids)
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    q = (
        db.query(
            Player.id,
            Player.canonical_name,
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(GamePlayer, Player.id == GamePlayer.player_id)
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(Player.id, Player.canonical_name)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    entries: list[dict[str, Any]] = []
    for row in rows:
        games = row.games_played or 0
        wins = int(row.wins or 0)
        entries.append({
            "player_id": row.id,
            "canonical_name": row.canonical_name,
            "games_played": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
            "avg_points": round(float(row.avg_points or 0), 2),
        })

    sort_key = "avg_points" if sort_by == "avg_points" else "win_rate"
    return sorted(entries, key=lambda e: e[sort_key], reverse=True)


def get_all_partnerships(db: Session, player_id: int | None = None, player_ids: list[int] | None = None) -> list[dict[str, Any]]:
    valid_ids = _valid_game_ids(db, player_ids)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    won_case = case(
        ((gp1.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp1.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )

    query = (
        db.query(
            gp1.player_id.label("player_a_id"),
            gp2.player_id.label("player_b_id"),
            func.count().label("games_together"),
            func.sum(won_case).label("wins"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .join(Game, gp1.game_id == Game.id)
        .group_by(gp1.player_id, gp2.player_id)
    )

    if player_id is not None:
        query = query.filter((gp1.player_id == player_id) | (gp2.player_id == player_id))
    if valid_ids is not None:
        query = query.filter(Game.id.in_(valid_ids))

    rows = query.all()
    results: list[dict[str, Any]] = []
    for row in rows:
        games = row.games_together or 0
        wins = int(row.wins or 0)
        results.append({
            "player_a_id": row.player_a_id,
            "player_b_id": row.player_b_id,
            "games_together": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
        })
    return results


def get_partnership_for_player(db: Session, player_id: int, player_ids: list[int] | None = None) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    rows = get_all_partnerships(db, player_id, player_ids)
    result: list[dict[str, Any]] = []
    for r in rows:
        entry: dict[str, Any] = {
            "partner_id": r["player_b_id"] if r["player_a_id"] == player_id else r["player_a_id"],
        }
        entry.update({k: v for k, v in r.items() if k not in ("player_a_id", "player_b_id")})
        result.append(entry)
    return result


def get_specific_partnership(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    lo, hi = min(player_a_id, player_b_id), max(player_a_id, player_b_id)
    for r in get_all_partnerships(db, player_ids=player_ids):
        if r["player_a_id"] == lo and r["player_b_id"] == hi:
            return r
    return {"player_a_id": lo, "player_b_id": hi, "games_together": 0, "wins": 0, "losses": 0, "win_rate": 0.0}


def get_head_to_head(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(db, player_ids)
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
    for game, team_a in rows:
        if team_a == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
        "games_played": a_wins + b_wins,
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
    }


def get_matchup(db: Session, pair_a: tuple[int, int], pair_b: tuple[int, int], player_ids: list[int] | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(db, player_ids)
    gp_a1 = aliased(GamePlayer)
    gp_a2 = aliased(GamePlayer)
    gp_b1 = aliased(GamePlayer)
    gp_b2 = aliased(GamePlayer)

    q = (
        db.query(Game, gp_a1.team.label("pair_a_team"))
        .join(gp_a1, (gp_a1.game_id == Game.id) & (gp_a1.player_id == pair_a[0]))
        .join(gp_a2, (gp_a2.game_id == Game.id) & (gp_a2.player_id == pair_a[1]) & (gp_a2.team == gp_a1.team))
        .join(gp_b1, (gp_b1.game_id == Game.id) & (gp_b1.player_id == pair_b[0]) & (gp_b1.team != gp_a1.team))
        .join(gp_b2, (gp_b2.game_id == Game.id) & (gp_b2.player_id == pair_b[1]) & (gp_b2.team == gp_b1.team))
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    a_wins = b_wins = 0
    for game, pair_a_team in rows:
        if pair_a_team == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "pair_a": list(pair_a),
        "pair_b": list(pair_b),
        "games_played": a_wins + b_wins,
        "pair_a_wins": a_wins,
        "pair_b_wins": b_wins,
    }
```

- [ ] **Step 4: Run all stats tests**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_stats.py -v
```

Expected: the two new filter tests still FAIL (routers don't pass `player_ids` yet), existing tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add backend/app/services/stats.py backend/tests/integration/test_stats.py && git commit -m "feat: player_ids filter in stats service"
```

---

### Task 2: Backend anomalies service — propagate filter

**Files:**
- Modify: `backend/app/services/anomalies.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/test_anomalies.py`. First read the file to see existing tests, then append:

```python
def test_partnership_anomalies_player_ids_filter(client: TestClient):
    """Sub game partnerships should not appear when filtered to regulars."""
    # Create 4 regulars and 1 sub
    reg_ids = []
    for name in ["AnoRegA", "AnoRegB", "AnoRegX", "AnoRegY"]:
        reg_ids.append(client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"])
    sub_id = client.post("/players", json={"canonical_name": "AnoSubS", "is_sub": True, "aliases": []}).json()["id"]

    # Ingest 3 games: 2 regulars-only, 1 with sub
    resp = client.post("/ingest/scores", json={"files": [
        "09-04-2024,1,AnoRegA,AnoRegB,21,AnoRegX,AnoRegY,9\n"
        "09-04-2024,2,AnoRegA,AnoRegB,21,AnoRegX,AnoRegY,15\n"
        "09-04-2024,3,AnoRegA,AnoSubS,21,AnoRegX,AnoRegY,10\n"
    ]})
    assert resp.status_code == 200, resp.json()

    qs = "&".join(f"player_ids={i}" for i in reg_ids)
    response = client.get(f"/anomalies/partnerships/overplayed?{qs}")
    assert response.status_code == 200
    data = response.json()
    # sub player should not appear in any anomaly entry
    for entry in data:
        assert entry["player_a_id"] != sub_id
        assert entry["player_b_id"] != sub_id
```

- [ ] **Step 2: Run test to verify it fails**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_anomalies.py::test_partnership_anomalies_player_ids_filter -v
```

Expected: FAIL — `player_ids` param not yet accepted.

- [ ] **Step 3: Update anomalies service**

Replace the entire contents of `backend/app/services/anomalies.py`:

```python
from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from ..models import Game, GamePlayer


MIN_GAMES_THRESHOLD = 3


def _valid_game_id_set(db: Session, player_ids: list[int] | None) -> set[int] | None:
    """Returns the set of game IDs where all participants are in player_ids.
    Returns None when player_ids is None or empty (no filter)."""
    if not player_ids:
        return None
    excluded = {
        row.game_id
        for row in db.query(GamePlayer.game_id)
        .filter(GamePlayer.player_id.notin_(player_ids))
        .distinct()
        .all()
    }
    all_ids = {row.id for row in db.query(Game.id).all()}
    return all_ids - excluded


def _get_player_game_counts(db: Session, valid_game_ids: set[int] | None = None) -> dict[int, int]:
    q = db.query(GamePlayer.player_id, func.count().label("games")).group_by(GamePlayer.player_id)
    if valid_game_ids is not None:
        q = q.filter(GamePlayer.game_id.in_(valid_game_ids))
    rows = q.all()
    return {row.player_id: row.games for row in rows}


def _get_total_games(db: Session, valid_game_ids: set[int] | None = None) -> int:
    q = db.query(func.count(Game.id))
    if valid_game_ids is not None:
        q = q.filter(Game.id.in_(valid_game_ids))
    return q.scalar() or 0


def _get_all_player_pairs(player_counts: dict[int, int]) -> list[tuple[int, int]]:
    ids = sorted(player_counts.keys())
    return [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]


def _expected_frequency(games_a: int, games_b: int, total: int, prob_given_same_game: float) -> float:
    if total == 0:
        return 0.0
    return (games_a / total) * (games_b / total) * total * prob_given_same_game


def get_partnership_anomalies(db: Session, overplayed: bool, limit: int = 10, player_ids: list[int] | None = None) -> list[dict[str, Any]]:
    valid_game_ids = _valid_game_id_set(db, player_ids)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    q = (
        db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
    )
    if valid_game_ids is not None:
        q = q.filter(gp1.game_id.in_(valid_game_ids))

    actual_counts = {(min(r.a, r.b), max(r.a, r.b)): int(r.n) for r in q.all()}

    player_counts = _get_player_game_counts(db, valid_game_ids)
    total = _get_total_games(db, valid_game_ids)
    all_pairs = _get_all_player_pairs(player_counts)

    results: list[dict[str, Any]] = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total, 1 / 3)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]


def get_head_to_head_anomalies(db: Session, overplayed: bool, limit: int = 10, player_ids: list[int] | None = None) -> list[dict[str, Any]]:
    valid_game_ids = _valid_game_id_set(db, player_ids)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    q = (
        db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team != gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
    )
    if valid_game_ids is not None:
        q = q.filter(gp1.game_id.in_(valid_game_ids))

    actual_counts = {(min(r.a, r.b), max(r.a, r.b)): int(r.n) for r in q.all()}

    player_counts = _get_player_game_counts(db, valid_game_ids)
    total = _get_total_games(db, valid_game_ids)
    all_pairs = _get_all_player_pairs(player_counts)

    results: list[dict[str, Any]] = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total, 2 / 3)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]
```

- [ ] **Step 4: Run anomalies tests**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_anomalies.py -v
```

Expected: new test still FAILS (router not updated yet), existing tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add backend/app/services/anomalies.py backend/tests/integration/test_anomalies.py && git commit -m "feat: player_ids filter in anomalies service"
```

---

### Task 3: Backend routers — add `player_ids` query param

**Files:**
- Modify: `backend/app/routers/stats.py`
- Modify: `backend/app/routers/anomalies.py`
- Modify: `backend/app/routers/players.py`

- [ ] **Step 1: Update stats router**

Replace the entire contents of `backend/app/routers/stats.py`:

```python
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import stats as stats_service
from ..schemas import (
    LeaderboardEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    PlayerStatsResponse,
    HeadToHeadResponse,
    MatchupResponse,
)

router = APIRouter()


@router.get("/player/{player_id}", response_model=PlayerStatsResponse)
def player_stats(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_player_stats(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    sort_by: Literal["win_rate", "avg_points"] = "win_rate",
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return stats_service.get_leaderboard(db, sort_by, player_ids or None)


@router.get("/partnerships", response_model=list[PartnershipResponse])
def all_partnerships(
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return stats_service.get_all_partnerships(db, player_ids=player_ids or None)


@router.get("/partnerships/{player_id}", response_model=list[PlayerPartnershipResponse])
def partnerships_for_player(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_partnership_for_player(db, player_id, player_ids or None)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/partnerships/{player_a_id}/{player_b_id}", response_model=PartnershipResponse)
def specific_partnership(
    player_a_id: int,
    player_b_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return stats_service.get_specific_partnership(db, player_a_id, player_b_id, player_ids or None)


@router.get("/head-to-head/{player_a_id}/{player_b_id}", response_model=HeadToHeadResponse)
def head_to_head(
    player_a_id: int,
    player_b_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return stats_service.get_head_to_head(db, player_a_id, player_b_id, player_ids or None)


@router.get("/matchup/{pair_a_ids}/vs/{pair_b_ids}", response_model=MatchupResponse)
def matchup(
    pair_a_ids: str,
    pair_b_ids: str,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        a1, a2 = [int(x) for x in pair_a_ids.split(",")]
        b1, b2 = [int(x) for x in pair_b_ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=422, detail="Pair IDs must be comma-separated integers e.g. /1,2/vs/3,4")
    return stats_service.get_matchup(db, (a1, a2), (b1, b2), player_ids or None)
```

- [ ] **Step 2: Update anomalies router**

Replace the entire contents of `backend/app/routers/anomalies.py`:

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import anomalies as anomaly_service
from ..schemas import AnomalyEntry

router = APIRouter()


@router.get("/partnerships/overplayed", response_model=list[AnomalyEntry])
def partnerships_overplayed(
    limit: int = 10,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_partnership_anomalies(db, overplayed=True, limit=limit, player_ids=player_ids or None)


@router.get("/partnerships/underplayed", response_model=list[AnomalyEntry])
def partnerships_underplayed(
    limit: int = 10,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_partnership_anomalies(db, overplayed=False, limit=limit, player_ids=player_ids or None)


@router.get("/head-to-head/overplayed", response_model=list[AnomalyEntry])
def head_to_head_overplayed(
    limit: int = 10,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=True, limit=limit, player_ids=player_ids or None)


@router.get("/head-to-head/underplayed", response_model=list[AnomalyEntry])
def head_to_head_underplayed(
    limit: int = 10,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=False, limit=limit, player_ids=player_ids or None)
```

- [ ] **Step 3: Update players router — add `player_ids` to the stats endpoint**

In `backend/app/routers/players.py`, find the stats endpoint and replace it:

```python
from fastapi import APIRouter, Depends, HTTPException, Response, Query

@router.get("/{player_id}/stats", response_model=PlayerStatsResponse)
def get_player_stats(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_player_stats(db, player_id, player_ids or None)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
```

Note: add `Query` to the existing `from fastapi import` line.

- [ ] **Step 4: Run all backend tests**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/ -v
```

Expected: all tests pass including the 2 filter tests added in Task 1 and the anomalies filter test from Task 2.

- [ ] **Step 5: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add backend/app/routers/stats.py backend/app/routers/anomalies.py backend/app/routers/players.py && git commit -m "feat: player_ids query param on all stats and anomaly endpoints"
```

---

### Task 4: Frontend — `PlayerFilterContext`

**Files:**
- Create: `frontend/src/context/PlayerFilterContext.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create context file**

Create `frontend/src/context/PlayerFilterContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getPlayers } from '../api/players'
import type { Player } from '../types'

type Preset = 'everyone' | 'regulars' | 'custom'

interface PlayerFilterContextValue {
  allPlayers: Player[]
  selectedIds: number[]
  setSelectedIds: (ids: number[]) => void
  activePreset: Preset
  setPreset: (preset: 'everyone' | 'regulars') => void
}

const PlayerFilterContext = createContext<PlayerFilterContextValue | null>(null)

export function PlayerFilterProvider({ children }: { children: ReactNode }) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedIds, setSelectedIdsRaw] = useState<number[]>([])
  const [activePreset, setActivePreset] = useState<Preset>('regulars')

  useEffect(() => {
    getPlayers().then((players) => {
      setAllPlayers(players)
      setSelectedIdsRaw(players.filter((p) => !p.is_sub).map((p) => p.id))
    })
  }, [])

  const setSelectedIds = (ids: number[]) => {
    setSelectedIdsRaw(ids)
    const allIds = allPlayers.map((p) => p.id)
    const regularIds = allPlayers.filter((p) => !p.is_sub).map((p) => p.id)
    const sorted = [...ids].sort((a, b) => a - b)
    const isAll = sorted.join() === [...allIds].sort((a, b) => a - b).join()
    const isRegulars = sorted.join() === [...regularIds].sort((a, b) => a - b).join()
    setActivePreset(isAll ? 'everyone' : isRegulars ? 'regulars' : 'custom')
  }

  const setPreset = (preset: 'everyone' | 'regulars') => {
    const ids = preset === 'everyone'
      ? allPlayers.map((p) => p.id)
      : allPlayers.filter((p) => !p.is_sub).map((p) => p.id)
    setSelectedIdsRaw(ids)
    setActivePreset(preset)
  }

  return (
    <PlayerFilterContext.Provider value={{ allPlayers, selectedIds, setSelectedIds, activePreset, setPreset }}>
      {children}
    </PlayerFilterContext.Provider>
  )
}

export function usePlayerFilter() {
  const ctx = useContext(PlayerFilterContext)
  if (!ctx) throw new Error('usePlayerFilter must be used inside PlayerFilterProvider')
  return ctx
}
```

- [ ] **Step 2: Wrap app in the provider**

In `frontend/src/main.tsx`, replace the file contents:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PlayerFilterProvider } from './context/PlayerFilterContext.tsx'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <PlayerFilterProvider>
        <App />
      </PlayerFilterProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/context/PlayerFilterContext.tsx frontend/src/main.tsx && git commit -m "feat: PlayerFilterContext — global player filter with regulars-only default"
```

---

### Task 5: Frontend — `PlayerFilterPopover` + Nav

**Files:**
- Create: `frontend/src/components/PlayerFilterPopover.tsx`
- Modify: `frontend/src/components/Nav.tsx`

Shadcn `Popover` is already available — it was installed as part of shadcn/ui setup. No new packages needed.

- [ ] **Step 1: Create `PlayerFilterPopover`**

Create `frontend/src/components/PlayerFilterPopover.tsx`:

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePlayerFilter } from '../context/PlayerFilterContext'

export default function PlayerFilterPopover() {
  const { allPlayers, selectedIds, setSelectedIds, activePreset, setPreset } = usePlayerFilter()

  const label =
    activePreset === 'everyone' ? 'Everyone' :
    activePreset === 'regulars' ? 'Regulars' :
    `${selectedIds.length} players`

  const togglePlayer = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded border border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Filter players
        </p>
        <div className="mb-3 flex gap-2">
          <Button
            size="sm"
            variant={activePreset === 'regulars' ? 'default' : 'outline'}
            onClick={() => setPreset('regulars')}
            className="flex-1 text-xs"
          >
            Regulars only
          </Button>
          <Button
            size="sm"
            variant={activePreset === 'everyone' ? 'default' : 'outline'}
            onClick={() => setPreset('everyone')}
            className="flex-1 text-xs"
          >
            Everyone
          </Button>
        </div>
        <div className="max-h-60 space-y-0.5 overflow-y-auto">
          {allPlayers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => togglePlayer(p.id)}
                className="h-3.5 w-3.5"
              />
              <span className={p.is_sub ? 'text-muted-foreground' : ''}>{p.canonical_name}</span>
              {p.is_sub && <span className="text-xs text-yellow-400">sub</span>}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Add popover to Nav**

In `frontend/src/components/Nav.tsx`, add the import and the component between the nav links and the theme toggle button:

```tsx
import { NavLink } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import PlayerFilterPopover from './PlayerFilterPopover'

const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/players', label: 'Players' },
  { to: '/games', label: 'Games' },
  { to: '/graph', label: 'Graph' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/upload', label: 'Upload' },
]

export default function Nav() {
  const { theme, toggle } = useTheme()

  return (
    <nav className="border-b border-border bg-card px-4">
      <div className="mx-auto flex max-w-5xl items-center gap-1 py-3">
        <span className="mr-6 font-bold text-yellow-400">Graph-minton</span>
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rounded px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? 'bg-yellow-400 text-gray-950 font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <PlayerFilterPopover />
          <button
            onClick={toggle}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors. If shadcn Popover is not present, check `frontend/src/components/ui/` for `popover.tsx`. If missing, install with: `cd frontend && npx shadcn@latest add popover`

- [ ] **Step 4: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/components/PlayerFilterPopover.tsx frontend/src/components/Nav.tsx && git commit -m "feat: player filter popover in nav bar"
```

---

### Task 6: Frontend — update API functions and wire pages

**Files:**
- Modify: `frontend/src/api/stats.ts`
- Modify: `frontend/src/api/players.ts`
- Modify: `frontend/src/api/anomalies.ts`
- Modify: `frontend/src/pages/LeaderboardPage.tsx`
- Modify: `frontend/src/pages/PlayerDetailPage.tsx`
- Modify: `frontend/src/pages/GraphPage.tsx`
- Modify: `frontend/src/pages/AnomaliesPage.tsx`

- [ ] **Step 1: Update `api/stats.ts`**

Replace the contents of `frontend/src/api/stats.ts`:

```typescript
import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership, HeadToHead } from '../types'

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
```

- [ ] **Step 2: Update `api/players.ts` — add `playerIds` to stats functions**

Read `frontend/src/api/players.ts` first, then update the `getPlayerStats` and `getPlayerPartnerships` functions:

```typescript
export const getPlayerStats = (id: number, playerIds?: number[]) => {
  const filter = playerIds?.length ? '?' + playerIds.map((pid) => `player_ids=${pid}`).join('&') : ''
  return apiFetch<PlayerStats>(`/stats/player/${id}${filter}`)
}

export const getPlayerPartnerships = (id: number, playerIds?: number[]) => {
  const filter = playerIds?.length ? '?' + playerIds.map((pid) => `player_ids=${pid}`).join('&') : ''
  return apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}${filter}`)
}
```

- [ ] **Step 3: Update `api/anomalies.ts`**

Replace the contents of `frontend/src/api/anomalies.ts`:

```typescript
import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

const playerIdsQs = (playerIds?: number[]): string =>
  playerIds?.length ? playerIds.map((id) => `player_ids=${id}`).join('&') : ''

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[]) => {
  const base = new URLSearchParams({ limit: String(limit) }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?${base}${filter ? '&' + filter : ''}`)
}

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20, playerIds?: number[]) => {
  const base = new URLSearchParams({ limit: String(limit) }).toString()
  const filter = playerIdsQs(playerIds)
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?${base}${filter ? '&' + filter : ''}`)
}
```

- [ ] **Step 4: Update `LeaderboardPage`**

Read `frontend/src/pages/LeaderboardPage.tsx` first, then make these changes:

Add import:
```typescript
import { usePlayerFilter } from '../context/PlayerFilterContext'
```

Inside the component, add:
```typescript
const { selectedIds } = usePlayerFilter()
```

Update the `useEffect` to include `selectedIds` and pass it to the API call:
```typescript
useEffect(() => {
  setLoading(true)
  getLeaderboard(sortBy, selectedIds)
    .then(setEntries)
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false))
}, [sortBy, selectedIds])
```

- [ ] **Step 5: Update `GraphPage`**

Read `frontend/src/pages/GraphPage.tsx` first, then make these changes:

Add import:
```typescript
import { usePlayerFilter } from '../context/PlayerFilterContext'
```

Inside the component, replace the existing players/partnerships fetch:
```typescript
const { selectedIds, allPlayers: contextPlayers } = usePlayerFilter()

useEffect(() => {
  setLoading(true)
  getAllPartnerships(selectedIds)
    .then((ps) => {
      setPlayers(contextPlayers.filter((p) => selectedIds.includes(p.id)))
      setPartnerships(ps)
    })
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false))
}, [selectedIds, contextPlayers])
```

Remove the `getPlayers` import since it's no longer needed in this file (only imported if not used elsewhere). The existing `import { getPlayers } from '../api/players'` line can be removed.

- [ ] **Step 6: Update `AnomaliesPage`**

Read `frontend/src/pages/AnomaliesPage.tsx` first, then make these changes:

Add import:
```typescript
import { usePlayerFilter } from '../context/PlayerFilterContext'
```

Inside the component, add:
```typescript
const { selectedIds } = usePlayerFilter()
```

Update the stats `useEffect` to pass `selectedIds` and include it in dependencies:
```typescript
useEffect(() => {
  setLoading(true)
  const fetch = tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies
  fetch(direction, 20, selectedIds)
    .then(setEntries)
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false))
}, [tab, direction, selectedIds])
```

- [ ] **Step 7: Update `PlayerDetailPage`**

Read `frontend/src/pages/PlayerDetailPage.tsx` first, then make these changes:

Add import:
```typescript
import { usePlayerFilter } from '../context/PlayerFilterContext'
```

Inside the component, add:
```typescript
const { selectedIds } = usePlayerFilter()
```

Update the `useEffect` to pass `selectedIds` to stats calls and include it in dependencies:
```typescript
useEffect(() => {
  Promise.all([
    getPlayer(playerId),
    getPlayerStats(playerId, selectedIds),
    getPlayerPartnerships(playerId, selectedIds),
    getPlayers(),
  ])
    .then(([p, s, partners, allPlayers]) => {
      setPlayer(p)
      setStats(s)
      setPartnerships(partners)
      setPlayerNames(Object.fromEntries(allPlayers.map((pl) => [pl.id, pl.canonical_name])))
    })
    .catch((e: Error) => setError(e.message))
}, [playerId, selectedIds])
```

- [ ] **Step 8: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton && git add frontend/src/api/stats.ts frontend/src/api/players.ts frontend/src/api/anomalies.ts frontend/src/pages/LeaderboardPage.tsx frontend/src/pages/PlayerDetailPage.tsx frontend/src/pages/GraphPage.tsx frontend/src/pages/AnomaliesPage.tsx && git commit -m "feat: wire player filter context to all stats pages and API calls"
```

---

## Self-Review

**Spec coverage:**
- ✅ Game included only if all 4 participants in selected set — `_valid_game_ids` uses "exclude games with any participant outside set" logic
- ✅ Persisted in React context — `PlayerFilterContext` with `useState`
- ✅ Default: regulars-only on load — context `useEffect` sets `selectedIds` to `players.filter(p => !p.is_sub).map(p => p.id)`
- ✅ Nav bar popover — `PlayerFilterPopover` added to `Nav.tsx`
- ✅ Preset chips: "Everyone" and "Regulars only" — `setPreset` function + buttons in popover
- ✅ Individual player checklist — rendered from `allPlayers` with checkboxes
- ✅ All stats endpoints updated — leaderboard, player stats, partnerships (all 3), h2h, matchup, anomalies (4 endpoints), `/players/{id}/stats`

**Placeholder scan:** None found.

**Type consistency:**
- `selectedIds: number[]` passed as `playerIds?: number[]` to all API functions — consistent
- `setPreset('everyone' | 'regulars')` matches `Preset` type — consistent
- `_valid_game_ids` returns subquery or `None`; all callers check `if valid_ids is not None` — consistent
- `_valid_game_id_set` returns `set[int] | None`; anomalies helpers accept same type — consistent
- `player_ids or None` in routers converts `[]` to `None` correctly (empty list is falsy in Python) — consistent
