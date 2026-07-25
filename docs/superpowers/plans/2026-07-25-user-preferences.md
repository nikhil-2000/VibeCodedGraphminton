# User Preferences & Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users identify themselves once on first visit; store their player filter preset and season selection server-side so it persists across visits.

**Architecture:** A UUID stored in `localStorage` identifies the user. It is sent as `X-User-ID` on every request. The backend stores prefs in a new `user_preferences` table. On boot the frontend fetches prefs and hydrates both filter contexts; on first visit it shows an identity modal. All existing endpoints are unchanged — they still accept `player_ids[]` and `season_id` query params, which the frontend continues to send as before.

**Tech Stack:** FastAPI + SQLAlchemy (Python 3.11), PostgreSQL, React 19 + TypeScript + Vite, shadcn/ui.

## Global Constraints

- Branch: `worktree-user-preferences` (already checked out in worktree)
- Backend test command: `DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python -m pytest backend/tests/integration/ -v`
- Frontend type-check: `cd frontend && npm run type-check`
- All API calls go via `/api` prefix (Vite proxy strips it); never add bare paths
- Static FastAPI routes must come before dynamic `/{id}` routes
- Use `npm run type-check` not `npx tsc --noEmit`
- Fix type errors properly; never use `# type: ignore`

---

## File Map

**Backend — new files:**
- `backend/app/routers/preferences.py` — GET/POST/PATCH `/preferences`
- `backend/tests/integration/test_preferences.py` — integration tests

**Backend — modified files:**
- `backend/app/models.py` — add `UserPreferences` model
- `backend/app/schemas.py` — add `UserPreferencesResponse`, `UserPreferencesCreate`, `UserPreferencesUpdate`
- `backend/app/main.py` — register preferences router + expose `X-User-ID` in CORS allowed headers

**Frontend — new files:**
- `frontend/src/api/preferences.ts` — `getPreferences`, `createPreferences`, `updatePreferences`
- `frontend/src/components/IdentityModal.tsx` — first-visit player selection modal
- `frontend/src/context/UserContext.tsx` — stores `userId` UUID, exposes it to the app

**Frontend — modified files:**
- `frontend/src/api/client.ts` — attach `X-User-ID` header on every request
- `frontend/src/context/PlayerFilterContext.tsx` — add `initFromPrefs(prefs)` method
- `frontend/src/context/SeasonFilterContext.tsx` — add `initFromPrefs(prefs)` method
- `frontend/src/main.tsx` — wrap tree with `UserProvider`; add boot logic + `IdentityModal`

---

## Task 1: Backend — `UserPreferences` model + migration

**Files:**
- Modify: `backend/app/models.py`

**Interfaces:**
- Produces: `UserPreferences` SQLAlchemy model with fields `id: str` (UUID), `player_id: int`, `season_id: int | None`, `preset: str`, `custom_player_ids: list[int]`

- [ ] **Step 1: Add the model to `models.py`**

  Open `backend/app/models.py` and append after the `GamePlayer` class:

  ```python
  from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint, ARRAY, Integer
  # (add ARRAY and Integer to the existing import line)

  class UserPreferences(Base):
      __tablename__ = "user_preferences"

      id: Mapped[str] = mapped_column(String(36), primary_key=True)  # UUID
      player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
      season_id: Mapped[Optional[int]] = mapped_column(ForeignKey("seasons.id"), nullable=True)
      preset: Mapped[str] = mapped_column(String(20), nullable=False, default="regulars")
      custom_player_ids: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, default=list)
  ```

  Update the existing import at the top of `models.py` to include `ARRAY` and `Integer`:
  ```python
  from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint, ARRAY, Integer
  ```

- [ ] **Step 2: Verify model is picked up by `Base.metadata.create_all`**

  `main.py` already imports `models` which registers all models. No extra wiring needed — `create_all` on startup creates the table automatically. Confirm by reading `backend/app/main.py` line 6.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/models.py
  git commit -m "feat(prefs): add UserPreferences model"
  ```

---

## Task 2: Backend — schemas for preferences

**Files:**
- Modify: `backend/app/schemas.py`

**Interfaces:**
- Consumes: `UserPreferences` model (Task 1)
- Produces:
  - `UserPreferencesResponse(id: str, player_id: int, season_id: int | None, preset: str, custom_player_ids: list[int])`
  - `UserPreferencesCreate(player_id: int, season_id: int | None, preset: str, custom_player_ids: list[int])`
  - `UserPreferencesUpdate(player_id: int | None, season_id: int | None, preset: str | None, custom_player_ids: list[int] | None)`

- [ ] **Step 1: Add schemas to `backend/app/schemas.py`**

  Append after the `# ── Ingest Games ───` section:

  ```python
  # ── User Preferences ───────────────────────────────────────────────────────

  class UserPreferencesResponse(BaseModel):
      id: str
      player_id: int
      season_id: Optional[int]
      preset: str
      custom_player_ids: list[int]
      model_config = {"from_attributes": True}


  class UserPreferencesCreate(BaseModel):
      player_id: int
      season_id: Optional[int] = None
      preset: str = "regulars"
      custom_player_ids: list[int] = []


  class UserPreferencesUpdate(BaseModel):
      player_id: Optional[int] = None
      season_id: Optional[int] = None
      preset: Optional[str] = None
      custom_player_ids: Optional[list[int]] = None
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add backend/app/schemas.py
  git commit -m "feat(prefs): add preferences schemas"
  ```

---

## Task 3: Backend — preferences router + tests

**Files:**
- Create: `backend/app/routers/preferences.py`
- Create: `backend/tests/integration/test_preferences.py`

**Interfaces:**
- Consumes: `UserPreferences` model (Task 1), `UserPreferencesResponse / Create / Update` schemas (Task 2), `get_db` from `database.py`
- Produces:
  - `GET /preferences` → `UserPreferencesResponse` (200) or 404
  - `POST /preferences` → `UserPreferencesResponse` (201)
  - `PATCH /preferences` → `UserPreferencesResponse` (200)
  - All three read UUID from `X-User-ID` request header

- [ ] **Step 1: Write the failing tests**

  Create `backend/tests/integration/test_preferences.py`:

  ```python
  import pytest
  from fastapi.testclient import TestClient


  USER_ID = "test-uuid-1234-5678-abcd-ef0123456789"


  def make_player(client: TestClient) -> int:
      r = client.post("/players", json={"canonical_name": "Test Player"})
      assert r.status_code == 200
      return r.json()["id"]


  def test_get_preferences_not_found(client: TestClient):
      r = client.get("/preferences", headers={"X-User-ID": USER_ID})
      assert r.status_code == 404


  def test_create_preferences(client: TestClient):
      player_id = make_player(client)
      r = client.post(
          "/preferences",
          json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
          headers={"X-User-ID": USER_ID},
      )
      assert r.status_code == 201
      data = r.json()
      assert data["id"] == USER_ID
      assert data["player_id"] == player_id
      assert data["preset"] == "regulars"
      assert data["custom_player_ids"] == []
      assert data["season_id"] is None


  def test_get_preferences_after_create(client: TestClient):
      player_id = make_player(client)
      client.post(
          "/preferences",
          json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
          headers={"X-User-ID": USER_ID},
      )
      r = client.get("/preferences", headers={"X-User-ID": USER_ID})
      assert r.status_code == 200
      assert r.json()["player_id"] == player_id


  def test_patch_preferences(client: TestClient):
      player_id = make_player(client)
      client.post(
          "/preferences",
          json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
          headers={"X-User-ID": USER_ID},
      )
      r = client.patch(
          "/preferences",
          json={"preset": "everyone"},
          headers={"X-User-ID": USER_ID},
      )
      assert r.status_code == 200
      assert r.json()["preset"] == "everyone"


  def test_patch_preferences_not_found(client: TestClient):
      r = client.patch(
          "/preferences",
          json={"preset": "everyone"},
          headers={"X-User-ID": USER_ID},
      )
      assert r.status_code == 404


  def test_create_preferences_missing_header(client: TestClient):
      player_id = make_player(client)
      r = client.post(
          "/preferences",
          json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
      )
      assert r.status_code == 422
  ```

- [ ] **Step 2: Run tests — expect failure (router not yet registered)**

  ```bash
  DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test \
    /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python \
    -m pytest backend/tests/integration/test_preferences.py -v
  ```
  Expected: errors like `404 Not Found` or import errors.

- [ ] **Step 3: Create the router**

  Create `backend/app/routers/preferences.py`:

  ```python
  from fastapi import APIRouter, Depends, Header, HTTPException
  from sqlalchemy.orm import Session
  from typing import Optional

  from ..database import get_db
  from ..models import UserPreferences
  from ..schemas import UserPreferencesCreate, UserPreferencesResponse, UserPreferencesUpdate

  router = APIRouter(prefix="/preferences", tags=["preferences"])


  def _get_user_id(x_user_id: Optional[str] = Header(default=None)) -> str:
      if not x_user_id:
          raise HTTPException(status_code=422, detail="X-User-ID header required")
      return x_user_id


  @router.get("", response_model=UserPreferencesResponse)
  def get_preferences(user_id: str = Depends(_get_user_id), db: Session = Depends(get_db)):
      prefs = db.query(UserPreferences).filter(UserPreferences.id == user_id).first()
      if not prefs:
          raise HTTPException(status_code=404, detail="Preferences not found")
      return prefs


  @router.post("", response_model=UserPreferencesResponse, status_code=201)
  def create_preferences(
      body: UserPreferencesCreate,
      user_id: str = Depends(_get_user_id),
      db: Session = Depends(get_db),
  ):
      prefs = UserPreferences(
          id=user_id,
          player_id=body.player_id,
          season_id=body.season_id,
          preset=body.preset,
          custom_player_ids=body.custom_player_ids,
      )
      db.add(prefs)
      db.commit()
      db.refresh(prefs)
      return prefs


  @router.patch("", response_model=UserPreferencesResponse)
  def update_preferences(
      body: UserPreferencesUpdate,
      user_id: str = Depends(_get_user_id),
      db: Session = Depends(get_db),
  ):
      prefs = db.query(UserPreferences).filter(UserPreferences.id == user_id).first()
      if not prefs:
          raise HTTPException(status_code=404, detail="Preferences not found")
      for field, value in body.model_dump(exclude_unset=True).items():
          setattr(prefs, field, value)
      db.commit()
      db.refresh(prefs)
      return prefs
  ```

- [ ] **Step 4: Register the router in `main.py`**

  In `backend/app/main.py`, add to the imports:
  ```python
  from .routers import players, ingest, stats, games, anomalies, seasons, preferences
  ```

  Add before the other `app.include_router` calls (so static `/preferences` routes don't conflict with any future `/{id}`):
  ```python
  app.include_router(preferences.router)
  ```

  Also expose `X-User-ID` in CORS. Change:
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=allowed_origins,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
  The `allow_headers=["*"]` already covers custom headers, so no change needed here.

- [ ] **Step 5: Run tests — expect pass**

  ```bash
  DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test \
    /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python \
    -m pytest backend/tests/integration/test_preferences.py -v
  ```
  Expected: 6 tests PASS.

- [ ] **Step 6: Run full test suite to check for regressions**

  ```bash
  DATABASE_URL=postgresql://graphminton:graphminton@localhost:5432/graphminton_test \
    /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton/backend/.venv/bin/python \
    -m pytest backend/tests/integration/ -v
  ```
  Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/app/routers/preferences.py backend/app/main.py backend/tests/integration/test_preferences.py
  git commit -m "feat(prefs): add /preferences CRUD endpoints"
  ```

---

## Task 4: Frontend — API module + `X-User-ID` middleware

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/api/preferences.ts`

**Interfaces:**
- Produces:
  - `apiFetch` now automatically attaches `X-User-ID: <uuid>` header (reads UUID from `localStorage` key `graphminton_user_id`)
  - `getPreferences(): Promise<UserPreferences>` — throws on non-200
  - `createPreferences(body: PreferencesCreate): Promise<UserPreferences>`
  - `updatePreferences(body: PreferencesUpdate): Promise<UserPreferences>`
  - Types: `UserPreferences { id: string; player_id: number; season_id: number | null; preset: string; custom_player_ids: number[] }`

- [ ] **Step 1: Update `client.ts` to attach the UUID header**

  Replace the contents of `frontend/src/api/client.ts` with:

  ```typescript
  const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

  function getUserId(): string {
    let id = localStorage.getItem('graphminton_user_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('graphminton_user_id', id)
    }
    return id
  }

  export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    headers.set('X-User-ID', getUserId())

    const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const { detail } = body as { detail?: string | string[] }
      const message = Array.isArray(detail)
        ? detail.join('\n')
        : detail ?? `HTTP ${res.status}`
      throw new Error(message)
    }
    return body as T
  }
  ```

- [ ] **Step 2: Create `frontend/src/api/preferences.ts`**

  ```typescript
  import { apiFetch } from './client'

  export interface UserPreferences {
    id: string
    player_id: number
    season_id: number | null
    preset: string
    custom_player_ids: number[]
  }

  export interface PreferencesCreate {
    player_id: number
    season_id?: number | null
    preset?: string
    custom_player_ids?: number[]
  }

  export interface PreferencesUpdate {
    player_id?: number
    season_id?: number | null
    preset?: string
    custom_player_ids?: number[]
  }

  export function getPreferences(): Promise<UserPreferences> {
    return apiFetch<UserPreferences>('/preferences')
  }

  export function createPreferences(body: PreferencesCreate): Promise<UserPreferences> {
    return apiFetch<UserPreferences>('/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  export function updatePreferences(body: PreferencesUpdate): Promise<UserPreferences> {
    return apiFetch<UserPreferences>('/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/api/client.ts frontend/src/api/preferences.ts
  git commit -m "feat(prefs): add preferences API module and X-User-ID middleware"
  ```

---

## Task 5: Frontend — `initFromPrefs` on filter contexts

**Files:**
- Modify: `frontend/src/context/PlayerFilterContext.tsx`
- Modify: `frontend/src/context/SeasonFilterContext.tsx`

**Interfaces:**
- Consumes: `UserPreferences` type from `frontend/src/api/preferences.ts` (Task 4)
- Produces:
  - `PlayerFilterContext` gains `initFromPrefs(prefs: UserPreferences): void`
  - `SeasonFilterContext` gains `initFromPrefs(prefs: UserPreferences): void`

- [ ] **Step 1: Update `PlayerFilterContext.tsx`**

  The context needs to expose `initFromPrefs` which sets both the preset and the raw IDs. When preset is `'everyone'` or `'regulars'`, the IDs are derived from `allPlayers`. When preset is `'custom'`, use `custom_player_ids` from prefs. Because `allPlayers` may not yet be loaded when `initFromPrefs` is called, store the prefs and apply them once players load.

  Replace the full file:

  ```typescript
  import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
  import { getPlayers } from '../api/players'
  import type { UserPreferences } from '../api/preferences'
  import type { Player } from '../types'

  type Preset = 'everyone' | 'regulars' | 'custom'

  interface PlayerFilterContextValue {
    allPlayers: Player[]
    selectedIds: number[]
    setSelectedIds: (ids: number[]) => void
    activePreset: Preset
    setPreset: (preset: 'everyone' | 'regulars') => void
    reloadPlayers: () => void
    initFromPrefs: (prefs: UserPreferences) => void
  }

  const PlayerFilterContext = createContext<PlayerFilterContextValue | null>(null)

  function regularIds(players: Player[]): number[] {
    return players.filter((p) => !p.is_sub).map((p) => p.id)
  }

  function idsForPreset(preset: string, players: Player[], customIds: number[]): number[] {
    if (preset === 'everyone') return players.map((p) => p.id)
    if (preset === 'regulars') return regularIds(players)
    return customIds
  }

  export function PlayerFilterProvider({ children }: { children: ReactNode }) {
    const [allPlayers, setAllPlayers] = useState<Player[]>([])
    const [selectedIds, setSelectedIdsRaw] = useState<number[]>([])
    const [activePreset, setActivePreset] = useState<Preset>('regulars')
    const pendingPrefs = useRef<UserPreferences | null>(null)

    const applyPrefs = (players: Player[], prefs: UserPreferences) => {
      const preset = prefs.preset as Preset
      setActivePreset(preset)
      setSelectedIdsRaw(idsForPreset(preset, players, prefs.custom_player_ids))
    }

    const reloadPlayers = () => {
      getPlayers().then((players) => {
        setAllPlayers(players)
        if (pendingPrefs.current) {
          applyPrefs(players, pendingPrefs.current)
          pendingPrefs.current = null
        } else {
          setSelectedIdsRaw(regularIds(players))
        }
      })
    }

    useEffect(() => { reloadPlayers() }, [])

    const setSelectedIds = (ids: number[]) => {
      setSelectedIdsRaw(ids)
      const allIds = allPlayers.map((p) => p.id)
      const regIds = regularIds(allPlayers)
      const sorted = [...ids].sort((a, b) => a - b)
      const isAll = sorted.join() === [...allIds].sort((a, b) => a - b).join()
      const isRegulars = sorted.join() === [...regIds].sort((a, b) => a - b).join()
      setActivePreset(isAll ? 'everyone' : isRegulars ? 'regulars' : 'custom')
    }

    const setPreset = (preset: 'everyone' | 'regulars') => {
      const ids = preset === 'everyone'
        ? allPlayers.map((p) => p.id)
        : regularIds(allPlayers)
      setSelectedIdsRaw(ids)
      setActivePreset(preset)
    }

    const initFromPrefs = (prefs: UserPreferences) => {
      if (allPlayers.length > 0) {
        applyPrefs(allPlayers, prefs)
      } else {
        pendingPrefs.current = prefs
      }
    }

    return (
      <PlayerFilterContext.Provider value={{ allPlayers, selectedIds, setSelectedIds, activePreset, setPreset, reloadPlayers, initFromPrefs }}>
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

- [ ] **Step 2: Update `SeasonFilterContext.tsx`**

  Replace the full file:

  ```typescript
  import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
  import { getSeasons } from '../api/seasons'
  import type { UserPreferences } from '../api/preferences'
  import type { Season } from '../types'

  interface SeasonFilterContextValue {
    seasons: Season[]
    selectedSeasonId: number | null
    setSelectedSeasonId: (id: number | null) => void
    initFromPrefs: (prefs: UserPreferences) => void
  }

  const SeasonFilterContext = createContext<SeasonFilterContextValue | null>(null)

  export function SeasonFilterProvider({ children }: { children: ReactNode }) {
    const [seasons, setSeasons] = useState<Season[]>([])
    const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)

    useEffect(() => {
      getSeasons().then((data) => {
        setSeasons(data)
        if (data.length > 0) {
          setSelectedSeasonId(data[data.length - 1].id)
        }
      })
    }, [])

    const initFromPrefs = (prefs: UserPreferences) => {
      setSelectedSeasonId(prefs.season_id)
    }

    return (
      <SeasonFilterContext.Provider value={{ seasons, selectedSeasonId, setSelectedSeasonId, initFromPrefs }}>
        {children}
      </SeasonFilterContext.Provider>
    )
  }

  export function useSeasonFilter() {
    const ctx = useContext(SeasonFilterContext)
    if (!ctx) throw new Error('useSeasonFilter must be used inside SeasonFilterProvider')
    return ctx
  }
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/context/PlayerFilterContext.tsx frontend/src/context/SeasonFilterContext.tsx
  git commit -m "feat(prefs): add initFromPrefs to filter contexts"
  ```

---

## Task 6: Frontend — `IdentityModal` component

**Files:**
- Create: `frontend/src/components/IdentityModal.tsx`

**Interfaces:**
- Consumes: `usePlayerFilter` from `PlayerFilterContext` (for `allPlayers`), `createPreferences` from `preferences.ts` (Task 4), `UserPreferences` type
- Produces: `<IdentityModal onComplete={(prefs: UserPreferences) => void} />` — modal shown on first visit; calls `onComplete` with created prefs

- [ ] **Step 1: Create `IdentityModal.tsx`**

  ```typescript
  import { useState } from 'react'
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
  import { Button } from './ui/button'
  import { createPreferences } from '../api/preferences'
  import type { UserPreferences } from '../api/preferences'
  import { usePlayerFilter } from '../context/PlayerFilterContext'

  interface Props {
    onComplete: (prefs: UserPreferences) => void
  }

  export function IdentityModal({ onComplete }: Props) {
    const { allPlayers } = usePlayerFilter()
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
    const [loading, setLoading] = useState(false)

    const handleConfirm = async () => {
      if (!selectedPlayerId) return
      setLoading(true)
      try {
        const prefs = await createPreferences({
          player_id: Number(selectedPlayerId),
          preset: 'regulars',
          season_id: null,
          custom_player_ids: [],
        })
        onComplete(prefs)
      } finally {
        setLoading(false)
      }
    }

    return (
      <Dialog open>
        <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Who are you?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Select your name so the app can remember your preferences.
          </p>
          <Select onValueChange={setSelectedPlayerId} value={selectedPlayerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a player..." />
            </SelectTrigger>
            <SelectContent>
              {allPlayers.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.canonical_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleConfirm} disabled={!selectedPlayerId || loading}>
            {loading ? 'Saving...' : 'Continue'}
          </Button>
        </DialogContent>
      </Dialog>
    )
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/IdentityModal.tsx
  git commit -m "feat(prefs): add IdentityModal component"
  ```

---

## Task 7: Frontend — boot logic + persist prefs on filter change

**Files:**
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `getPreferences`, `updatePreferences` (Task 4), `IdentityModal` (Task 6), `initFromPrefs` on both contexts (Task 5)
- Produces: full boot flow — UUID minted, prefs fetched, contexts hydrated, modal shown on 404. Filter changes persisted to backend.

- [ ] **Step 1: Rewrite `main.tsx`**

  The boot logic needs to live somewhere that has access to both filter contexts. Because `main.tsx` wraps them, we need a child `AppWithPrefs` component to consume them.

  Replace the full `frontend/src/main.tsx`:

  ```typescript
  import { StrictMode, useState, useEffect, useRef } from 'react'
  import { createRoot } from 'react-dom/client'
  import { BrowserRouter } from 'react-router-dom'
  import './index.css'
  import App from './App.tsx'
  import { SeasonFilterProvider, useSeasonFilter } from './context/SeasonFilterContext.tsx'
  import { PlayerFilterProvider, usePlayerFilter } from './context/PlayerFilterContext.tsx'
  import { getPreferences, updatePreferences } from './api/preferences.ts'
  import type { UserPreferences } from './api/preferences.ts'
  import { IdentityModal } from './components/IdentityModal.tsx'

  function AppWithPrefs() {
    const [showModal, setShowModal] = useState(false)
    const [prefsLoaded, setPrefsLoaded] = useState(false)
    const { initFromPrefs: initPlayer, selectedIds, activePreset, allPlayers } = usePlayerFilter()
    const { initFromPrefs: initSeason, selectedSeasonId, seasons } = useSeasonFilter()

    // Track previous values to detect changes (skip on first load)
    const prevPreset = useRef<string | null>(null)
    const prevCustomIds = useRef<number[] | null>(null)
    const prevSeasonId = useRef<number | null | undefined>(undefined)

    useEffect(() => {
      getPreferences()
        .then((prefs) => {
          initPlayer(prefs)
          initSeason(prefs)
          setPrefsLoaded(true)
        })
        .catch((err: Error) => {
          if (err.message.includes('404') || err.message === 'Preferences not found') {
            setShowModal(true)
          }
          setPrefsLoaded(true)
        })
    }, [])

    // Persist preset/custom_player_ids changes
    useEffect(() => {
      if (!prefsLoaded) return
      if (prevPreset.current === null) {
        prevPreset.current = activePreset
        prevCustomIds.current = selectedIds
        return
      }
      const customIds = activePreset === 'custom' ? selectedIds : []
      if (prevPreset.current === activePreset && prevCustomIds.current?.join() === customIds.join()) return
      prevPreset.current = activePreset
      prevCustomIds.current = customIds
      updatePreferences({ preset: activePreset, custom_player_ids: customIds })
    }, [activePreset, selectedIds, prefsLoaded])

    // Persist season changes
    useEffect(() => {
      if (!prefsLoaded) return
      if (prevSeasonId.current === undefined) {
        prevSeasonId.current = selectedSeasonId
        return
      }
      if (prevSeasonId.current === selectedSeasonId) return
      prevSeasonId.current = selectedSeasonId
      updatePreferences({ season_id: selectedSeasonId })
    }, [selectedSeasonId, prefsLoaded])

    const handleIdentityComplete = (prefs: UserPreferences) => {
      // Set season_id to last season after identity is set
      const lastSeasonId = seasons.length > 0 ? seasons[seasons.length - 1].id : null
      const prefsWithSeason = { ...prefs, season_id: lastSeasonId }
      if (lastSeasonId !== null) {
        updatePreferences({ season_id: lastSeasonId })
      }
      initPlayer(prefsWithSeason)
      initSeason(prefsWithSeason)
      setShowModal(false)
    }

    return (
      <>
        {showModal && allPlayers.length > 0 && (
          <IdentityModal onComplete={handleIdentityComplete} />
        )}
        <App />
      </>
    )
  }

  const rootEl = document.getElementById('root')
  if (!rootEl) throw new Error('Root element not found')

  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <SeasonFilterProvider>
          <PlayerFilterProvider>
            <AppWithPrefs />
          </PlayerFilterProvider>
        </SeasonFilterProvider>
      </BrowserRouter>
    </StrictMode>,
  )
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 3: Smoke test in browser**

  ```bash
  cd frontend && npm run dev
  ```

  Verify:
  1. First load (or after clearing `localStorage`) → identity modal appears
  2. Select a player, click Continue → modal closes, app loads
  3. Change season → reload page → season is restored
  4. Change player filter to Everyone → reload → Everyone preset restored
  5. Open new tab (same browser) → no modal

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/main.tsx
  git commit -m "feat(prefs): boot flow — identity modal + persist filter changes"
  ```

---

## Verification Checklist

- [ ] `GET /preferences` returns 404 for unknown UUID
- [ ] First visit shows identity modal with all players listed
- [ ] Selecting a player + Continue dismisses modal
- [ ] Season defaults to the latest season after identity selection
- [ ] Changing season, reloading → season restored
- [ ] Changing preset to Everyone, reloading → Everyone preset restored
- [ ] Custom player selection, reloading → exact same players selected
- [ ] New tab (same `localStorage`) → no modal, prefs immediately restored
- [ ] Incognito / cleared `localStorage` → modal appears again
- [ ] All existing backend integration tests pass
- [ ] Frontend type-check passes with zero errors
