# Anomalies Player Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player focus dropdown to the Anomalies page that drills down to show only that player's anomaly rows, using new player-scoped endpoints backed by the existing service logic.

**Architecture:** Extend the two existing anomaly service functions with `focus_player_id` and nullable `limit` params. Add four new FastAPI routes that call them. Add two new frontend API functions. Wire a `<Select>` dropdown into `AnomaliesPage.tsx` that switches between global and player-scoped fetches.

**Tech Stack:** Python/FastAPI, SQLAlchemy, pytest, React, TypeScript, shadcn `Select`

## Global Constraints

- Branch: `feat/anomalies-player-focus`
- Backend tests: `docker compose -f docker-compose.test.yml run --rm backend-test pytest`
- Frontend type-check: `npm run type-check` (run from `frontend/`)
- Frontend tests: `npm test` (run from `frontend/`)
- No worktree — all edits directly on checked-out branch

---

## File Map

| File | Change |
|------|--------|
| `backend/app/services/anomalies.py` | Add `focus_player_id` + nullable `limit` to both service functions |
| `backend/app/routers/anomalies.py` | Add four player-scoped routes |
| `backend/tests/integration/test_anomalies.py` | Add tests for the four new endpoints |
| `frontend/src/api/anomalies.ts` | Add two player-scoped fetch functions |
| `frontend/src/pages/AnomaliesPage.tsx` | Add `focusedPlayerId` state + player `<Select>` dropdown |

---

### Task 1: Extend anomaly service functions

**Files:**
- Modify: `backend/app/services/anomalies.py`

**Interfaces:**
- Produces:
  - `get_partnership_anomalies(db, overplayed, limit=10, player_ids=None, season_id=None, focus_player_id=None)`
  - `get_head_to_head_anomalies(db, overplayed, limit=10, player_ids=None, season_id=None, focus_player_id=None)`
  - Both: when `focus_player_id` is set, filter results to rows where `player_a_id == focus_player_id or player_b_id == focus_player_id`. When `limit` is `None`, return all results.

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/integration/test_anomalies.py`:

```python
def test_partnership_focus_player(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/partnerships/overplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_partnership_focus_player_returns_all_rows(client: TestClient, anomaly_seed):
    # No limit — should return all rows for the player, not just 10
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/partnerships/underplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_head_to_head_focus_player(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/head-to-head/overplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_head_to_head_focus_player_underplayed(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/head-to-head/underplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose -f docker-compose.test.yml run --rm backend-test pytest tests/integration/test_anomalies.py::test_partnership_focus_player -v
```

Expected: FAIL with 404 (route not yet defined)

- [ ] **Step 3: Update `get_partnership_anomalies` in `backend/app/services/anomalies.py`**

Change the signature and add filter before the return:

```python
def get_partnership_anomalies(
    db: Session,
    overplayed: bool,
    limit: int | None = 10,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
    focus_player_id: int | None = None,
) -> list[dict[str, Any]]:
```

Replace the final two lines (`results.sort(...)` and `return results[:limit]`) with:

```python
    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    if focus_player_id is not None:
        results = [r for r in results if r["player_a_id"] == focus_player_id or r["player_b_id"] == focus_player_id]
    return results if limit is None else results[:limit]
```

- [ ] **Step 4: Update `get_head_to_head_anomalies` identically**

Same signature change and same replacement of the final two lines:

```python
def get_head_to_head_anomalies(
    db: Session,
    overplayed: bool,
    limit: int | None = 10,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
    focus_player_id: int | None = None,
) -> list[dict[str, Any]]:
```

```python
    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    if focus_player_id is not None:
        results = [r for r in results if r["player_a_id"] == focus_player_id or r["player_b_id"] == focus_player_id]
    return results if limit is None else results[:limit]
```

- [ ] **Step 5: Run full backend anomaly tests**

```bash
docker compose -f docker-compose.test.yml run --rm backend-test pytest tests/integration/test_anomalies.py -v
```

Expected: all existing tests still PASS, new ones still FAIL (routes not added yet)

---

### Task 2: Add player-scoped routes

**Files:**
- Modify: `backend/app/routers/anomalies.py`

**Interfaces:**
- Consumes: `anomaly_service.get_partnership_anomalies(..., focus_player_id, limit=None)` and `anomaly_service.get_head_to_head_anomalies(..., focus_player_id, limit=None)`
- Produces:
  - `GET /anomalies/partnerships/overplayed/{player_id}` → `list[AnomalyEntry]`
  - `GET /anomalies/partnerships/underplayed/{player_id}` → `list[AnomalyEntry]`
  - `GET /anomalies/head-to-head/overplayed/{player_id}` → `list[AnomalyEntry]`
  - `GET /anomalies/head-to-head/underplayed/{player_id}` → `list[AnomalyEntry]`

- [ ] **Step 1: Add four routes to `backend/app/routers/anomalies.py`**

Append after the existing four routes (static routes are already matched before `{player_id}` since player_id is an integer):

```python
@router.get("/partnerships/overplayed/{player_id}", response_model=list[AnomalyEntry])
def partnerships_overplayed_for_player(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    season_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_partnership_anomalies(
        db, overplayed=True, limit=None,
        player_ids=player_ids or None, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/partnerships/underplayed/{player_id}", response_model=list[AnomalyEntry])
def partnerships_underplayed_for_player(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    season_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_partnership_anomalies(
        db, overplayed=False, limit=None,
        player_ids=player_ids or None, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/head-to-head/overplayed/{player_id}", response_model=list[AnomalyEntry])
def head_to_head_overplayed_for_player(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    season_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_head_to_head_anomalies(
        db, overplayed=True, limit=None,
        player_ids=player_ids or None, season_id=season_id,
        focus_player_id=player_id,
    )


@router.get("/head-to-head/underplayed/{player_id}", response_model=list[AnomalyEntry])
def head_to_head_underplayed_for_player(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    season_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    return anomaly_service.get_head_to_head_anomalies(
        db, overplayed=False, limit=None,
        player_ids=player_ids or None, season_id=season_id,
        focus_player_id=player_id,
    )
```

- [ ] **Step 2: Run the new tests**

```bash
docker compose -f docker-compose.test.yml run --rm backend-test pytest tests/integration/test_anomalies.py -v
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/anomalies.py backend/app/routers/anomalies.py backend/tests/integration/test_anomalies.py
git commit -m "feat: add player-focused anomaly endpoints with no limit"
```

---

### Task 3: Add frontend API functions

**Files:**
- Modify: `frontend/src/api/anomalies.ts`

**Interfaces:**
- Produces:
  - `getPartnershipAnomaliesForPlayer(playerId: number, type: 'overplayed' | 'underplayed', playerIds?: number[], seasonId?: number | null): Promise<AnomalyEntry[]>`
  - `getHeadToHeadAnomaliesForPlayer(playerId: number, type: 'overplayed' | 'underplayed', playerIds?: number[], seasonId?: number | null): Promise<AnomalyEntry[]>`

- [ ] **Step 1: Add two functions to `frontend/src/api/anomalies.ts`**

Append to the file:

```ts
export const getPartnershipAnomaliesForPlayer = (
  playerId: number,
  type: 'overplayed' | 'underplayed',
  playerIds?: number[],
  seasonId?: number | null,
) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}/${playerId}${params ? '?' + params : ''}`)
}

export const getHeadToHeadAnomaliesForPlayer = (
  playerId: number,
  type: 'overplayed' | 'underplayed',
  playerIds?: number[],
  seasonId?: number | null,
) => {
  const params = qs(playerIdsQs(playerIds), seasonQs(seasonId))
  return apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}/${playerId}${params ? '?' + params : ''}`)
}
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/anomalies.ts
git commit -m "feat: add player-scoped anomaly API functions"
```

---

### Task 4: Wire player focus dropdown into AnomaliesPage

**Files:**
- Modify: `frontend/src/pages/AnomaliesPage.tsx`

**Interfaces:**
- Consumes:
  - `getPartnershipAnomaliesForPlayer(playerId, type, playerIds, seasonId)` from `../api/anomalies`
  - `getHeadToHeadAnomaliesForPlayer(playerId, type, playerIds, seasonId)` from `../api/anomalies`
  - `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@/components/ui/select`

- [ ] **Step 1: Update imports in `AnomaliesPage.tsx`**

Add to the existing anomalies import line:

```ts
import {
  getPartnershipAnomalies,
  getHeadToHeadAnomalies,
  getPartnershipAnomaliesForPlayer,
  getHeadToHeadAnomaliesForPlayer,
} from '../api/anomalies'
```

Add select import:

```ts
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
```

- [ ] **Step 2: Add `focusedPlayerId` state**

After the existing `useState` calls, add:

```ts
const [focusedPlayerId, setFocusedPlayerId] = useState<number | null>(null)
```

- [ ] **Step 3: Update the fetch `useEffect`**

Replace the existing fetch `useEffect` with:

```ts
useEffect(() => {
  setLoading(true)
  setError(null)
  const promise = focusedPlayerId !== null
    ? (tab === 'partnerships'
        ? getPartnershipAnomaliesForPlayer(focusedPlayerId, direction, selectedIds, selectedSeasonId)
        : getHeadToHeadAnomaliesForPlayer(focusedPlayerId, direction, selectedIds, selectedSeasonId))
    : (tab === 'partnerships'
        ? getPartnershipAnomalies(direction, 20, selectedIds, selectedSeasonId)
        : getHeadToHeadAnomalies(direction, 20, selectedIds, selectedSeasonId))
  promise
    .then(setEntries)
    .catch((e: Error) => setError(e.message))
    .finally(() => setLoading(false))
}, [tab, direction, selectedIds, selectedSeasonId, focusedPlayerId])
```

- [ ] **Step 4: Add the player dropdown to the JSX**

In the filter bar `<div>`, add the `<Select>` after the direction buttons (inside the `ml-auto` div alongside them):

Replace:
```tsx
<div className="ml-auto flex gap-2">
  {(['overplayed', 'underplayed'] as Direction[]).map((d) => (
    <Button
      key={d}
      variant={direction === d ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setDirection(d)}
      className="capitalize"
    >
      {d}
    </Button>
  ))}
</div>
```

With:
```tsx
<div className="ml-auto flex gap-2 items-center">
  {(['overplayed', 'underplayed'] as Direction[]).map((d) => (
    <Button
      key={d}
      variant={direction === d ? 'secondary' : 'outline'}
      size="sm"
      onClick={() => setDirection(d)}
      className="capitalize"
    >
      {d}
    </Button>
  ))}
  <Select
    value={focusedPlayerId !== null ? String(focusedPlayerId) : 'all'}
    onValueChange={(v) => setFocusedPlayerId(v === 'all' ? null : Number(v))}
  >
    <SelectTrigger className="h-8 w-36 text-xs">
      <SelectValue placeholder="All players" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All players</SelectItem>
      {Object.entries(playerNames)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([id, name]) => (
          <SelectItem key={id} value={id}>{name}</SelectItem>
        ))}
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 5: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test
```

Expected: all existing tests pass (no AnomaliesPage tests exist, so just verifying no regressions)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AnomaliesPage.tsx
git commit -m "feat: add player focus dropdown to anomalies page"
```
