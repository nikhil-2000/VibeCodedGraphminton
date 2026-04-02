# Player Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add player deletion (blocked when games exist) and safe player editing (is_sub + aliases only, canonical name immutable).

**Architecture:** Two backend tasks tighten the existing player service and add a DELETE endpoint; two frontend tasks wire up an edit dialog and delete button on the PlayerDetailPage. Types are regenerated from the OpenAPI spec after backend changes so the frontend stays in sync.

**Tech Stack:** FastAPI + SQLAlchemy (backend), React + TypeScript + shadcn/ui (frontend), openapi-typescript for type generation.

---

## File Structure

**Backend — modify only:**
- `backend/app/schemas.py` — remove `canonical_name` from `PlayerUpdate`
- `backend/app/services/players.py` — remove canonical_name update logic; add `delete_player`
- `backend/app/routers/players.py` — add `DELETE /{player_id}` endpoint
- `backend/tests/integration/test_players.py` — new tests for delete + name-change rejection

**Frontend — modify/create:**
- `frontend/src/types/api.gen.ts` — regenerated (do not edit manually)
- `frontend/src/api/players.ts` — add `deletePlayer`, `updatePlayer`
- `frontend/src/pages/PlayerDetailPage.tsx` — add edit dialog + delete button

---

## Tasks

### Task 1: Block canonical name changes in PATCH

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/services/players.py`
- Modify: `backend/tests/integration/test_players.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/integration/test_players.py`:
```python
def test_patch_cannot_change_canonical_name(client: TestClient):
    created = client.post("/players", json={"canonical_name": "Original", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"canonical_name": "Changed"})
    # canonical_name is not a recognised field — should be ignored, name stays the same
    assert response.status_code == 200
    assert response.json()["canonical_name"] == "Original"
```

- [ ] **Step 2: Run test to verify it currently fails**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_players.py::test_patch_cannot_change_canonical_name -v
```

Expected: FAIL — name is currently mutated by the service.

- [ ] **Step 3: Remove `canonical_name` from `PlayerUpdate` and the service**

In `backend/app/schemas.py`, replace the `PlayerUpdate` class:
```python
class PlayerUpdate(BaseModel):
    is_sub: Optional[bool] = None
    add_aliases: list[str] = []
    remove_aliases: list[str] = []
```

In `backend/app/services/players.py`, remove the canonical_name mutation block so `update_player` reads:
```python
def update_player(db: Session, player_id: int, data: PlayerUpdate) -> Player:
    player = get_player(db, player_id)  # raises KeyError if not found

    if data.is_sub is not None:
        player.is_sub = data.is_sub

    for alias_str in data.remove_aliases:
        if alias_str == player.canonical_name:
            raise ValueError("Cannot remove the canonical name alias")
        alias = db.query(PlayerAlias).filter(
            PlayerAlias.player_id == player_id,
            PlayerAlias.alias == alias_str,
        ).first()
        if alias:
            db.delete(alias)

    existing = {a.alias for a in player.aliases}
    for alias_str in data.add_aliases:
        if alias_str not in existing:
            db.add(PlayerAlias(player_id=player_id, alias=alias_str))

    try:
        db.flush()
    except IntegrityError:
        raise ValueError("One or more aliases already belong to another player")

    db.refresh(player)
    return player
```

- [ ] **Step 4: Run test to verify it passes**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_players.py -v
```

Expected: all player tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/app/services/players.py backend/tests/integration/test_players.py
git commit -m "fix: remove canonical_name from PlayerUpdate — player names are immutable"
```

---

### Task 2: Add DELETE /players/{player_id}

**Files:**
- Modify: `backend/app/services/players.py`
- Modify: `backend/app/routers/players.py`
- Modify: `backend/tests/integration/test_players.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/integration/test_players.py`:
```python
def test_delete_player_no_games(client: TestClient):
    created = client.post("/players", json={"canonical_name": "ToDelete", "is_sub": False, "aliases": []}).json()
    response = client.delete(f"/players/{created['id']}")
    assert response.status_code == 204
    # confirm gone
    assert client.get(f"/players/{created['id']}").status_code == 404


def test_delete_player_not_found(client: TestClient):
    response = client.delete("/players/99999")
    assert response.status_code == 404


def test_delete_player_with_games_rejected(client: TestClient):
    # Create two players and ingest a game that references them
    p1 = client.post("/players", json={"canonical_name": "Del A", "is_sub": False, "aliases": ["DelA"]}).json()
    p2 = client.post("/players", json={"canonical_name": "Del B", "is_sub": False, "aliases": ["DelB"]}).json()
    p3 = client.post("/players", json={"canonical_name": "Del C", "is_sub": False, "aliases": ["DelC"]}).json()
    p4 = client.post("/players", json={"canonical_name": "Del D", "is_sub": False, "aliases": ["DelD"]}).json()
    csv = "01-01-2025,1,DelA,DelB,21,DelC,DelD,9\n"
    client.post("/ingest/scores", json={"files": [csv]})
    response = client.delete(f"/players/{p1['id']}")
    assert response.status_code == 409
    assert "games" in response.json()["detail"].lower()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_players.py::test_delete_player_no_games backend/tests/integration/test_players.py::test_delete_player_not_found backend/tests/integration/test_players.py::test_delete_player_with_games_rejected -v
```

Expected: FAIL — endpoint does not exist yet.

- [ ] **Step 3: Add `delete_player` to the service**

Add to `backend/app/services/players.py` (add `GamePlayer` to the import line at the top first):
```python
from ..models import Player, PlayerAlias, GamePlayer
```

Then add the function:
```python
def delete_player(db: Session, player_id: int) -> None:
    player = get_player(db, player_id)  # raises KeyError if not found
    has_games = db.query(GamePlayer).filter(GamePlayer.player_id == player_id).first()
    if has_games:
        raise ValueError(f"Player {player_id} has games and cannot be deleted")
    db.delete(player)
    db.flush()
```

- [ ] **Step 4: Add the DELETE endpoint to the router**

In `backend/app/routers/players.py`, add after the `update_player` route:
```python
from fastapi import APIRouter, Depends, HTTPException, Response

@router.delete("/{player_id}", status_code=204)
def delete_player(player_id: int, db: Session = Depends(get_db)):
    try:
        player_service.delete_player(db, player_id)
        db.commit()
        return Response(status_code=204)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
```

Note: the `Response` import needs to be added to the existing `from fastapi import` line.

- [ ] **Step 5: Run tests to verify they pass**

```bash
DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/test_players.py -v
```

Expected: all player tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/players.py backend/app/routers/players.py backend/tests/integration/test_players.py
git commit -m "feat: DELETE /players/:id — blocked when player has games"
```

---

### Task 3: Regenerate OpenAPI types

**Files:**
- Modify: `openapi.json` (regenerated, not committed)
- Modify: `frontend/src/types/api.gen.ts` (regenerated, committed)

- [ ] **Step 1: Export updated OpenAPI spec**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton
python backend/export_openapi.py
```

Expected: `Written to .../openapi.json`

- [ ] **Step 2: Regenerate frontend types**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend
npm run generate-types
```

Expected: `frontend/src/types/api.gen.ts` updated — `PlayerUpdate` no longer has `canonical_name`.

- [ ] **Step 3: Type-check frontend**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/api.gen.ts
git commit -m "chore: regenerate types — PlayerUpdate canonical_name removed"
```

---

### Task 4: Frontend — deletePlayer API + delete button with confirmation

**Files:**
- Modify: `frontend/src/api/players.ts`
- Modify: `frontend/src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Add `deletePlayer` to the API module**

In `frontend/src/api/players.ts`, add after `createPlayer`:
```typescript
export const deletePlayer = (id: number) =>
  fetch(`/players/${id}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok) return res.json().then((b) => { throw new Error(b.detail ?? `HTTP ${res.status}`) })
  })
```

Note: `deletePlayer` uses raw `fetch` (not `apiFetch`) because a 204 response has no body and `apiFetch` calls `res.json()` which would fail.

- [ ] **Step 2: Add delete button + confirmation dialog to PlayerDetailPage**

Read `frontend/src/pages/PlayerDetailPage.tsx` first, then add:
- Import `useNavigate` from `react-router-dom`
- Import `deletePlayer` from `../api/players`
- Import `Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter` from `@/components/ui/dialog`
- Add state: `const [deleteOpen, setDeleteOpen] = useState(false)`
- Add state: `const [deleting, setDeleting] = useState(false)`
- Add state: `const [deleteError, setDeleteError] = useState<string | null>(null)`
- Add `const navigate = useNavigate()`

Add the delete handler:
```typescript
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
```

In the JSX, add a "Delete player" button next to the player name heading (use `variant="destructive"` and `size="sm"`):
```tsx
<div className="mb-1 flex items-center gap-3">
  <h1 className="text-2xl font-bold">{player.canonical_name}</h1>
  <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
    Delete
  </Button>
</div>
```

Add the confirmation dialog at the bottom of the return (before the closing `</div>`):
```tsx
<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/players.ts frontend/src/pages/PlayerDetailPage.tsx
git commit -m "feat: delete player button with confirmation on player detail page"
```

---

### Task 5: Frontend — edit player dialog (is_sub + aliases, no canonical name)

**Files:**
- Modify: `frontend/src/api/players.ts`
- Modify: `frontend/src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Add `updatePlayer` to the API module**

In `frontend/src/api/players.ts`, add:
```typescript
import type { Player, PlayerCreate, PlayerPartnership, PlayerStats } from '../types'

// PlayerUpdate shape: is_sub, add_aliases, remove_aliases (no canonical_name)
interface PlayerPatch {
  is_sub?: boolean
  add_aliases?: string[]
  remove_aliases?: string[]
}

export const updatePlayer = (id: number, data: PlayerPatch) =>
  apiFetch<Player>(`/players/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
```

- [ ] **Step 2: Add edit dialog to PlayerDetailPage**

Read `frontend/src/pages/PlayerDetailPage.tsx` (which now has the delete dialog from Task 4), then add an edit dialog.

Add state:
```typescript
const [editOpen, setEditOpen] = useState(false)
const [editIsSub, setEditIsSub] = useState(false)
const [aliasesToAdd, setAliasesToAdd] = useState('')
const [aliasesToRemove, setAliasesToRemove] = useState<string[]>([])
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)
```

Add an `openEdit` handler that pre-fills from the current player:
```typescript
const openEdit = () => {
  setEditIsSub(player.is_sub)
  setAliasesToAdd('')
  setAliasesToRemove([])
  setSaveError(null)
  setEditOpen(true)
}
```

Add the save handler:
```typescript
const handleSave = () => {
  setSaving(true)
  setSaveError(null)
  const newAliases = aliasesToAdd.split(',').map((s) => s.trim()).filter(Boolean)
  updatePlayer(playerId, {
    is_sub: editIsSub,
    add_aliases: newAliases,
    remove_aliases: aliasesToRemove,
  })
    .then((updated) => {
      setPlayer(updated)
      setEditOpen(false)
    })
    .catch((e: Error) => setSaveError(e.message))
    .finally(() => setSaving(false))
}
```

Add an "Edit" button next to the Delete button:
```tsx
<Button variant="outline" size="sm" onClick={openEdit}>Edit</Button>
```

Add the edit dialog (before the closing `</div>`, after the delete dialog):
```tsx
<Dialog open={editOpen} onOpenChange={setEditOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit {player.canonical_name}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4 py-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={editIsSub}
          onChange={(e) => setEditIsSub(e.target.checked)}
        />
        Sub player
      </label>
      <div className="space-y-1">
        <p className="text-sm font-medium">Current aliases</p>
        <div className="flex flex-wrap gap-1">
          {player.aliases.map((a) => (
            <span
              key={a.id}
              onClick={() =>
                setAliasesToRemove((prev) =>
                  prev.includes(a.alias)
                    ? prev.filter((x) => x !== a.alias)
                    : [...prev, a.alias]
                )
              }
              className={`cursor-pointer rounded px-2 py-0.5 text-xs border ${
                aliasesToRemove.includes(a.alias)
                  ? 'border-destructive text-destructive line-through'
                  : 'border-border text-muted-foreground hover:border-destructive hover:text-destructive'
              }`}
            >
              {a.alias}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Click an alias to mark it for removal.</p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Add aliases</label>
        <Input
          placeholder="Comma-separated (e.g. Nik, Niks)"
          value={aliasesToAdd}
          onChange={(e) => setAliasesToAdd(e.target.value)}
        />
      </div>
      {saveError && <p className="text-sm text-destructive">{saveError}</p>}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run all frontend tests**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/frontend
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/players.ts frontend/src/pages/PlayerDetailPage.tsx
git commit -m "feat: edit player dialog — toggle sub status and manage aliases"
```

---

## Self-Review

**Spec coverage:**
- ✅ Delete player — Task 2 adds `DELETE /players/:id`
- ✅ Block delete if games exist — Task 2 service checks `GamePlayer` records, returns 409
- ✅ Update is_sub — Task 1 keeps `is_sub` in `PlayerUpdate`; Task 5 frontend wires it up
- ✅ Update aliases (add/remove) — already in service; Task 5 exposes in UI
- ✅ Never update canonical name — Task 1 removes field from schema and service

**Placeholder scan:** None found.

**Type consistency:**
- `PlayerPatch` in Task 5 matches `PlayerUpdate` schema after Task 1 (`is_sub`, `add_aliases`, `remove_aliases`)
- `deletePlayer` returns `void` (no body); `updatePlayer` returns `Player` — consistent with usage in Task 4/5
- `player.aliases` is `AliasResponse[]` with `{id, alias}` — used correctly in Task 5 alias list
