# Graph-minton Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React frontend that lets users browse player stats, explore the partnership network as an interactive graph, review anomalies, and upload new score CSVs.

**Architecture:** Vite + React + TypeScript SPA with React Router. A thin typed API client layer wraps all backend calls. Pages are composed from small focused components; no state management library — React `useState`/`useEffect` is sufficient for this app's scale.

**Tech Stack:** Vite 5, React 18, TypeScript 5, React Router v6, Tailwind CSS 3, react-force-graph-2d (network graph), Vitest + React Testing Library (component tests)

---

## File Structure

```
frontend/
  index.html
  vite.config.ts         # dev proxy → localhost:8000
  tailwind.config.ts
  tsconfig.json
  src/
    main.tsx             # ReactDOM.createRoot + <App/>
    App.tsx              # Router + layout shell
    api/
      client.ts          # base fetch helper (base URL + error handling)
      players.ts         # getPlayers, getPlayer, getPlayerStats, getPlayerPartnerships
      games.ts           # getGames
      stats.ts           # getLeaderboard, getAllPartnerships, getHeadToHead
      anomalies.ts       # getAnomalies (partnership + h2h, over + under)
      ingest.ts          # postScores
    types/
      index.ts           # all shared TS types matching backend response shapes
    components/
      Nav.tsx            # top nav bar with links
      StatCard.tsx       # small labelled metric tile
      LeaderboardTable.tsx
      PartnershipTable.tsx
      GameCard.tsx
      AnomalyTable.tsx
      GraphCanvas.tsx    # react-force-graph-2d wrapper
      UploadForm.tsx     # CSV file input + submit
    pages/
      LeaderboardPage.tsx
      PlayersPage.tsx
      PlayerDetailPage.tsx
      GamesPage.tsx
      GraphPage.tsx
      AnomaliesPage.tsx
      UploadPage.tsx
```

---

## Tasks

### Task 1: Project scaffold

**Files:**
- Create: `frontend/` (all config files + entry points)

- [ ] **Step 1: Scaffold Vite project**

```bash
cd /Users/nikhil.patel/Documents/personal/VibeCodedGraphminton
npm create vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom react-force-graph-2d
npm install -D tailwindcss @tailwindcss/vite vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Configure Tailwind**

Replace `frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/players': 'http://localhost:8000',
      '/games': 'http://localhost:8000',
      '/stats': 'http://localhost:8000',
      '/anomalies': 'http://localhost:8000',
      '/ingest': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

Replace `frontend/src/index.css` with:
```css
@import "tailwindcss";
```

- [ ] **Step 4: Create test setup file**

Create `frontend/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Wire up router in `main.tsx`**

Replace `frontend/src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 6: Create placeholder `App.tsx`**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<div>Leaderboard coming soon</div>} />
          <Route path="/players" element={<div>Players coming soon</div>} />
          <Route path="/players/:id" element={<div>Player detail coming soon</div>} />
          <Route path="/games" element={<div>Games coming soon</div>} />
          <Route path="/graph" element={<div>Graph coming soon</div>} />
          <Route path="/anomalies" element={<div>Anomalies coming soon</div>} />
          <Route path="/upload" element={<div>Upload coming soon</div>} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 7: Create `Nav.tsx`**

Create `frontend/src/components/Nav.tsx`:
```tsx
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/players', label: 'Players' },
  { to: '/games', label: 'Games' },
  { to: '/graph', label: 'Graph' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/upload', label: 'Upload' },
]

export default function Nav() {
  return (
    <nav className="border-b border-gray-800 bg-gray-900 px-4">
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
                  : 'text-gray-400 hover:text-gray-100'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite server starts on http://localhost:5173, nav bar renders with placeholder content for each route.

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite + React + TypeScript frontend with Tailwind and routing"
```

---

### Task 2: API client and types

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/players.ts`
- Create: `frontend/src/api/games.ts`
- Create: `frontend/src/api/stats.ts`
- Create: `frontend/src/api/anomalies.ts`
- Create: `frontend/src/api/ingest.ts`

- [ ] **Step 1: Write failing tests for the API client**

Create `frontend/src/api/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiFetch } from './client'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1 }), { status: 200 })
    )
    const result = await apiFetch<{ id: number }>('/players')
    expect(result).toEqual({ id: 1 })
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })
    )
    await expect(apiFetch('/players/999')).rejects.toThrow('Not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/api/client.test.ts
```

Expected: FAIL — `apiFetch` not found

- [ ] **Step 3: Create `src/api/client.ts`**

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return body as T
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/client.test.ts
```

Expected: 2 passed

- [ ] **Step 5: Define shared types**

Create `frontend/src/types/index.ts`:
```ts
export interface Player {
  id: number
  canonical_name: string
  is_sub: boolean
  aliases: string[]
}

export interface PlayerStats {
  player_id: number
  games_played: number
  wins: number
  losses: number
  win_rate: number
  avg_points: number
}

export interface LeaderboardEntry extends PlayerStats {
  canonical_name: string
}

export interface Partnership {
  player_a_id: number
  player_b_id: number
  games_together: number
  wins: number
  losses: number
  win_rate: number
}

export interface PlayerPartnership {
  partner_id: number
  games_together: number
  wins: number
  losses: number
  win_rate: number
}

export interface HeadToHead {
  player_a_id: number
  player_b_id: number
  games_played: number
  player_a_wins: number
  player_b_wins: number
}

export interface Game {
  id: number
  played_on: string
  session: number | null
  game_number: number
  team_a_score: number
  team_b_score: number
}

export interface GameDetail extends Game {
  team_a: { id: number; canonical_name: string }[]
  team_b: { id: number; canonical_name: string }[]
}

export interface AnomalyEntry {
  player_a_id: number
  player_b_id: number
  actual: number
  expected: number
  deviation: number
}

export interface IngestResult {
  ingested: number
  errors: string[]
}
```

- [ ] **Step 6: Create API modules**

Create `frontend/src/api/players.ts`:
```ts
import { apiFetch } from './client'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export const getPlayers = (isSub?: boolean) =>
  apiFetch<Player[]>(`/players${isSub !== undefined ? `?is_sub=${isSub}` : ''}`)

export const getPlayer = (id: number) =>
  apiFetch<Player>(`/players/${id}`)

export const getPlayerStats = (id: number) =>
  apiFetch<PlayerStats>(`/players/${id}/stats`)

export const getPlayerPartnerships = (id: number) =>
  apiFetch<PlayerPartnership[]>(`/stats/partnerships/${id}`)
```

Create `frontend/src/api/games.ts`:
```ts
import { apiFetch } from './client'
import type { Game, GameDetail } from '../types'

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
  return apiFetch<Game[]>(`/games${qs ? `?${qs}` : ''}`)
}

export const getGame = (id: number) =>
  apiFetch<GameDetail>(`/games/${id}`)
```

Create `frontend/src/api/stats.ts`:
```ts
import { apiFetch } from './client'
import type { LeaderboardEntry, Partnership } from '../types'

export const getLeaderboard = (sortBy: 'win_rate' | 'avg_points' = 'win_rate') =>
  apiFetch<LeaderboardEntry[]>(`/stats/leaderboard?sort_by=${sortBy}`)

export const getAllPartnerships = () =>
  apiFetch<Partnership[]>('/stats/partnerships')
```

Create `frontend/src/api/anomalies.ts`:
```ts
import { apiFetch } from './client'
import type { AnomalyEntry } from '../types'

export const getPartnershipAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) =>
  apiFetch<AnomalyEntry[]>(`/anomalies/partnerships/${type}?limit=${limit}`)

export const getHeadToHeadAnomalies = (type: 'overplayed' | 'underplayed', limit = 20) =>
  apiFetch<AnomalyEntry[]>(`/anomalies/head-to-head/${type}?limit=${limit}`)
```

Create `frontend/src/api/ingest.ts`:
```ts
import { apiFetch } from './client'
import type { IngestResult } from '../types'

export const postScores = (files: string[]) =>
  apiFetch<IngestResult>('/ingest/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: typed API client layer and shared types"
```

---

### Task 3: Leaderboard page

**Files:**
- Create: `frontend/src/components/LeaderboardTable.tsx`
- Create: `frontend/src/pages/LeaderboardPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/LeaderboardTable.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderboardTable from './LeaderboardTable'
import type { LeaderboardEntry } from '../types'

const entries: LeaderboardEntry[] = [
  { player_id: 1, canonical_name: 'Alice', games_played: 10, wins: 8, losses: 2, win_rate: 0.8, avg_points: 19.5 },
  { player_id: 2, canonical_name: 'Bob', games_played: 10, wins: 4, losses: 6, win_rate: 0.4, avg_points: 15.2 },
]

describe('LeaderboardTable', () => {
  it('renders player names', () => {
    render(<LeaderboardTable entries={entries} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders win rate as percentage', () => {
    render(<LeaderboardTable entries={entries} />)
    expect(screen.getByText('80.0%')).toBeInTheDocument()
  })

  it('renders rank numbers', () => {
    render(<LeaderboardTable entries={entries} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/LeaderboardTable.test.tsx
```

Expected: FAIL — component not found

- [ ] **Step 3: Create `LeaderboardTable.tsx`**

Create `frontend/src/components/LeaderboardTable.tsx`:
```tsx
import { Link } from 'react-router-dom'
import type { LeaderboardEntry } from '../types'

interface Props {
  entries: LeaderboardEntry[]
}

export default function LeaderboardTable({ entries }: Props) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-400">
          <th className="pb-2 pr-4">#</th>
          <th className="pb-2 pr-4">Player</th>
          <th className="pb-2 pr-4">GP</th>
          <th className="pb-2 pr-4">W</th>
          <th className="pb-2 pr-4">L</th>
          <th className="pb-2 pr-4">Win %</th>
          <th className="pb-2">Avg Pts</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={e.player_id} className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
            <td className="py-2 pr-4 font-medium">
              <Link to={`/players/${e.player_id}`} className="hover:text-yellow-400">
                {e.canonical_name}
              </Link>
            </td>
            <td className="py-2 pr-4 text-gray-300">{e.games_played}</td>
            <td className="py-2 pr-4 text-green-400">{e.wins}</td>
            <td className="py-2 pr-4 text-red-400">{e.losses}</td>
            <td className="py-2 pr-4">{(e.win_rate * 100).toFixed(1)}%</td>
            <td className="py-2">{e.avg_points.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/LeaderboardTable.test.tsx
```

Expected: 3 passed

- [ ] **Step 5: Create `LeaderboardPage.tsx`**

Create `frontend/src/pages/LeaderboardPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { getLeaderboard } from '../api/stats'
import LeaderboardTable from '../components/LeaderboardTable'
import type { LeaderboardEntry } from '../types'

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sortBy, setSortBy] = useState<'win_rate' | 'avg_points'>('win_rate')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getLeaderboard(sortBy)
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sortBy])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <div className="flex gap-2">
          {(['win_rate', 'avg_points'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                sortBy === s
                  ? 'bg-yellow-400 text-gray-950 font-medium'
                  : 'border border-gray-700 text-gray-400 hover:text-gray-100'
              }`}
            >
              {s === 'win_rate' ? 'Win Rate' : 'Avg Points'}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <LeaderboardTable entries={entries} />}
    </div>
  )
}
```

- [ ] **Step 6: Wire page into router**

In `frontend/src/App.tsx`, replace the leaderboard placeholder:
```tsx
import LeaderboardPage from './pages/LeaderboardPage'
// replace: <Route path="/leaderboard" element={<div>Leaderboard coming soon</div>} />
// with:
<Route path="/leaderboard" element={<LeaderboardPage />} />
```

- [ ] **Step 7: Verify in browser**

With backend running (`docker compose up -d`), open http://localhost:5173/leaderboard. Should show leaderboard table with sort toggle.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: leaderboard page with win rate / avg points sort"
```

---

### Task 4: Players list and player detail

**Files:**
- Create: `frontend/src/components/StatCard.tsx`
- Create: `frontend/src/components/PartnershipTable.tsx`
- Create: `frontend/src/pages/PlayersPage.tsx`
- Create: `frontend/src/pages/PlayerDetailPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component tests**

Create `frontend/src/components/StatCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Win Rate" value="75.0%" />)
    expect(screen.getByText('Win Rate')).toBeInTheDocument()
    expect(screen.getByText('75.0%')).toBeInTheDocument()
  })
})
```

Create `frontend/src/components/PartnershipTable.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PartnershipTable from './PartnershipTable'
import type { PlayerPartnership } from '../types'

const partnerships: PlayerPartnership[] = [
  { partner_id: 2, games_together: 5, wins: 4, losses: 1, win_rate: 0.8 },
]

const playerNames: Record<number, string> = { 2: 'Bob' }

describe('PartnershipTable', () => {
  it('renders partner name as link', () => {
    render(
      <MemoryRouter>
        <PartnershipTable partnerships={partnerships} playerNames={playerNames} />
      </MemoryRouter>
    )
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders games together', () => {
    render(
      <MemoryRouter>
        <PartnershipTable partnerships={partnerships} playerNames={playerNames} />
      </MemoryRouter>
    )
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/StatCard.test.tsx src/components/PartnershipTable.test.tsx
```

Expected: FAIL — components not found

- [ ] **Step 3: Create `StatCard.tsx`**

Create `frontend/src/components/StatCard.tsx`:
```tsx
interface Props {
  label: string
  value: string | number
  sub?: string
}

export default function StatCard({ label, value, sub }: Props) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Create `PartnershipTable.tsx`**

Create `frontend/src/components/PartnershipTable.tsx`:
```tsx
import { Link } from 'react-router-dom'
import type { PlayerPartnership } from '../types'

interface Props {
  partnerships: PlayerPartnership[]
  playerNames: Record<number, string>
}

export default function PartnershipTable({ partnerships, playerNames }: Props) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-400">
          <th className="pb-2 pr-4">Partner</th>
          <th className="pb-2 pr-4">GP</th>
          <th className="pb-2 pr-4">W</th>
          <th className="pb-2 pr-4">L</th>
          <th className="pb-2">Win %</th>
        </tr>
      </thead>
      <tbody>
        {partnerships
          .sort((a, b) => b.games_together - a.games_together)
          .map((p) => (
            <tr key={p.partner_id} className="border-b border-gray-800 hover:bg-gray-800/50">
              <td className="py-2 pr-4 font-medium">
                <Link to={`/players/${p.partner_id}`} className="hover:text-yellow-400">
                  {playerNames[p.partner_id] ?? `Player ${p.partner_id}`}
                </Link>
              </td>
              <td className="py-2 pr-4 text-gray-300">{p.games_together}</td>
              <td className="py-2 pr-4 text-green-400">{p.wins}</td>
              <td className="py-2 pr-4 text-red-400">{p.losses}</td>
              <td className="py-2">{(p.win_rate * 100).toFixed(1)}%</td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/StatCard.test.tsx src/components/PartnershipTable.test.tsx
```

Expected: 3 passed

- [ ] **Step 6: Create `PlayersPage.tsx`**

Create `frontend/src/pages/PlayersPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getPlayers } from '../api/players'
import type { Player } from '../types'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [showSubs, setShowSubs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getPlayers(showSubs ? undefined : false)
      .then(setPlayers)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [showSubs])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Players</h1>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={showSubs}
            onChange={(e) => setShowSubs(e.target.checked)}
            className="accent-yellow-400"
          />
          Show subs
        </label>
      </div>
      {loading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {players.map((p) => (
          <Link
            key={p.id}
            to={`/players/${p.id}`}
            className="rounded-lg border border-gray-700 bg-gray-800 p-4 hover:border-yellow-400 hover:bg-gray-700 transition-colors"
          >
            <p className="font-medium">{p.canonical_name}</p>
            {p.is_sub && (
              <span className="mt-1 inline-block rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">
                sub
              </span>
            )}
            {p.aliases.length > 0 && (
              <p className="mt-1 text-xs text-gray-500">{p.aliases.join(', ')}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `PlayerDetailPage.tsx`**

Create `frontend/src/pages/PlayerDetailPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships } from '../api/players'
import { getPlayers } from '../api/players'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import type { Player, PlayerStats, PlayerPartnership } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getPlayer(playerId),
      getPlayerStats(playerId),
      getPlayerPartnerships(playerId),
      getPlayers(),
    ])
      .then(([p, s, partners, allPlayers]) => {
        setPlayer(p)
        setStats(s)
        setPartnerships(partners)
        setPlayerNames(Object.fromEntries(allPlayers.map((pl) => [pl.id, pl.canonical_name])))
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])

  if (error) return <p className="text-red-400">{error}</p>
  if (!player || !stats) return <p className="text-gray-400">Loading…</p>

  return (
    <div>
      <div className="mb-2 text-sm text-gray-500">
        <Link to="/players" className="hover:text-yellow-400">Players</Link> / {player.canonical_name}
      </div>
      <h1 className="mb-1 text-2xl font-bold">{player.canonical_name}</h1>
      {player.aliases.length > 0 && (
        <p className="mb-6 text-sm text-gray-500">Also known as: {player.aliases.join(', ')}</p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <StatCard label="Games" value={stats.games_played} />
        <StatCard label="Wins" value={stats.wins} />
        <StatCard label="Losses" value={stats.losses} />
        <StatCard label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} />
        <StatCard label="Avg Pts" value={stats.avg_points.toFixed(1)} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Partnerships</h2>
      {partnerships.length === 0
        ? <p className="text-gray-500">No partnerships yet.</p>
        : <PartnershipTable partnerships={partnerships} playerNames={playerNames} />
      }
    </div>
  )
}
```

- [ ] **Step 8: Wire pages into router**

In `frontend/src/App.tsx`, add imports and replace placeholders:
```tsx
import PlayersPage from './pages/PlayersPage'
import PlayerDetailPage from './pages/PlayerDetailPage'
// replace placeholders:
<Route path="/players" element={<PlayersPage />} />
<Route path="/players/:id" element={<PlayerDetailPage />} />
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/
git commit -m "feat: players list and player detail page with stats and partnerships"
```

---

### Task 5: Games browser

**Files:**
- Create: `frontend/src/components/GameCard.tsx`
- Create: `frontend/src/pages/GamesPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/GameCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameCard from './GameCard'
import type { Game } from '../types'

const game: Game = {
  id: 1,
  played_on: '2024-04-08',
  session: 1,
  game_number: 1,
  team_a_score: 21,
  team_b_score: 9,
}

describe('GameCard', () => {
  it('renders scores', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('renders date', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('2024-04-08')).toBeInTheDocument()
  })

  it('renders session number', () => {
    render(<GameCard game={game} />)
    expect(screen.getByText('Session 1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/GameCard.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create `GameCard.tsx`**

Create `frontend/src/components/GameCard.tsx`:
```tsx
import type { Game } from '../types'

interface Props {
  game: Game
}

export default function GameCard({ game }: Props) {
  const aWon = game.team_a_score > game.team_b_score
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
        <span>{game.played_on}</span>
        {game.session !== null && <span>Session {game.session}</span>}
        <span>Game #{game.game_number}</span>
      </div>
      <div className="flex items-center justify-center gap-6 text-lg font-bold">
        <span className={aWon ? 'text-green-400' : 'text-gray-400'}>{game.team_a_score}</span>
        <span className="text-gray-600">vs</span>
        <span className={!aWon ? 'text-green-400' : 'text-gray-400'}>{game.team_b_score}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/GameCard.test.tsx
```

Expected: 3 passed

- [ ] **Step 5: Create `GamesPage.tsx`**

Create `frontend/src/pages/GamesPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { getGames } from '../api/games'
import GameCard from '../components/GameCard'
import type { Game } from '../types'

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [week, setWeek] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    getGames({ week: week ? Number(week) : undefined })
      .then(setGames)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [week])

  // Group games by session
  const bySession = games.reduce<Record<string, Game[]>>((acc, g) => {
    const key = g.session !== null ? `Session ${g.session}` : g.played_on
    ;(acc[key] ??= []).push(g)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold">Games</h1>
        <input
          type="number"
          min={1}
          placeholder="Filter by session #"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm placeholder-gray-500 focus:border-yellow-400 focus:outline-none"
        />
        {week && (
          <button onClick={() => setWeek('')} className="text-sm text-gray-400 hover:text-gray-100">
            Clear
          </button>
        )}
      </div>
      {loading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {Object.entries(bySession).map(([sessionLabel, sessionGames]) => (
        <div key={sessionLabel} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            {sessionLabel} — {sessionGames[0].played_on}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {sessionGames.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Wire into router**

In `frontend/src/App.tsx`:
```tsx
import GamesPage from './pages/GamesPage'
// replace: <Route path="/games" element={<div>Games coming soon</div>} />
<Route path="/games" element={<GamesPage />} />
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: games browser with session grouping and filter"
```

---

### Task 6: Network graph

**Files:**
- Create: `frontend/src/components/GraphCanvas.tsx`
- Create: `frontend/src/pages/GraphPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/GraphCanvas.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GraphCanvas from './GraphCanvas'
import type { Partnership, Player } from '../types'

// react-force-graph-2d is a canvas-based library — mock it in tests
vi.mock('react-force-graph-2d', () => ({
  default: ({ graphData }: { graphData: { nodes: unknown[]; links: unknown[] } }) => (
    <div data-testid="graph-canvas">
      nodes:{graphData.nodes.length} links:{graphData.links.length}
    </div>
  ),
}))

const players: Player[] = [
  { id: 1, canonical_name: 'Alice', is_sub: false, aliases: [] },
  { id: 2, canonical_name: 'Bob', is_sub: false, aliases: [] },
]

const partnerships: Partnership[] = [
  { player_a_id: 1, player_b_id: 2, games_together: 5, wins: 4, losses: 1, win_rate: 0.8 },
]

describe('GraphCanvas', () => {
  it('renders a node per player', () => {
    render(<GraphCanvas players={players} partnerships={partnerships} />)
    expect(screen.getByText(/nodes:2/)).toBeInTheDocument()
  })

  it('renders a link per partnership', () => {
    render(<GraphCanvas players={players} partnerships={partnerships} />)
    expect(screen.getByText(/links:1/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/GraphCanvas.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create `GraphCanvas.tsx`**

Create `frontend/src/components/GraphCanvas.tsx`:
```tsx
import ForceGraph2D from 'react-force-graph-2d'
import type { Partnership, Player } from '../types'

interface Props {
  players: Player[]
  partnerships: Partnership[]
}

interface GraphNode {
  id: number
  name: string
  val: number
}

interface GraphLink {
  source: number
  target: number
  value: number
  win_rate: number
}

export default function GraphCanvas({ players, partnerships }: Props) {
  const nodes: GraphNode[] = players.map((p) => ({
    id: p.id,
    name: p.canonical_name,
    val: 1,
  }))

  const links: GraphLink[] = partnerships.map((p) => ({
    source: p.player_a_id,
    target: p.player_b_id,
    value: p.games_together,
    win_rate: p.win_rate,
  }))

  return (
    <ForceGraph2D
      graphData={{ nodes, links }}
      nodeLabel="name"
      nodeColor={() => '#facc15'}
      nodeRelSize={5}
      linkWidth={(link) => Math.max(1, (link as GraphLink).value / 3)}
      linkColor={(link) => {
        const wr = (link as GraphLink).win_rate
        return wr >= 0.6 ? '#4ade80' : wr >= 0.4 ? '#facc15' : '#f87171'
      }}
      linkDirectionalArrowLength={0}
      backgroundColor="#030712"
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/GraphCanvas.test.tsx
```

Expected: 2 passed

- [ ] **Step 5: Create `GraphPage.tsx`**

Create `frontend/src/pages/GraphPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { getPlayers } from '../api/players'
import { getAllPartnerships } from '../api/stats'
import GraphCanvas from '../components/GraphCanvas'
import type { Player, Partnership } from '../types'

export default function GraphPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [minGames, setMinGames] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getPlayers(), getAllPartnerships()])
      .then(([p, ps]) => {
        setPlayers(p)
        setPartnerships(ps)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = partnerships.filter((p) => p.games_together >= minGames)

  if (loading) return <p className="text-gray-400">Loading…</p>
  if (error) return <p className="text-red-400">{error}</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Partnership Network</h1>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          Min games together:
          <input
            type="number"
            min={1}
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-center focus:border-yellow-400 focus:outline-none"
          />
        </label>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Edge width = games together · Edge colour: green ≥60% win rate, yellow ≥40%, red &lt;40%
      </p>
      <div className="rounded-lg overflow-hidden border border-gray-700" style={{ height: 560 }}>
        <GraphCanvas players={players} partnerships={filtered} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Wire into router**

In `frontend/src/App.tsx`:
```tsx
import GraphPage from './pages/GraphPage'
// replace: <Route path="/graph" element={<div>Graph coming soon</div>} />
<Route path="/graph" element={<GraphPage />} />
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: partnership network graph with edge weight and win rate colour"
```

---

### Task 7: Anomalies page

**Files:**
- Create: `frontend/src/components/AnomalyTable.tsx`
- Create: `frontend/src/pages/AnomaliesPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/AnomalyTable.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnomalyTable from './AnomalyTable'
import type { AnomalyEntry } from '../types'

const entries: AnomalyEntry[] = [
  { player_a_id: 1, player_b_id: 2, actual: 8, expected: 2.67, deviation: 5.33 },
]

const playerNames: Record<number, string> = { 1: 'Alice', 2: 'Bob' }

describe('AnomalyTable', () => {
  it('renders player names', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders actual count', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders positive deviation in green', () => {
    render(<AnomalyTable entries={entries} playerNames={playerNames} />)
    const deviationCell = screen.getByText('+5.33')
    expect(deviationCell).toHaveClass('text-green-400')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/AnomalyTable.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create `AnomalyTable.tsx`**

Create `frontend/src/components/AnomalyTable.tsx`:
```tsx
import type { AnomalyEntry } from '../types'

interface Props {
  entries: AnomalyEntry[]
  playerNames: Record<number, string>
}

function name(id: number, names: Record<number, string>) {
  return names[id] ?? `#${id}`
}

export default function AnomalyTable({ entries, playerNames }: Props) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700 text-left text-gray-400">
          <th className="pb-2 pr-4">Player A</th>
          <th className="pb-2 pr-4">Player B</th>
          <th className="pb-2 pr-4">Actual</th>
          <th className="pb-2 pr-4">Expected</th>
          <th className="pb-2">Deviation</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={`${e.player_a_id}-${e.player_b_id}`} className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="py-2 pr-4 font-medium">{name(e.player_a_id, playerNames)}</td>
            <td className="py-2 pr-4 font-medium">{name(e.player_b_id, playerNames)}</td>
            <td className="py-2 pr-4 text-gray-300">{e.actual}</td>
            <td className="py-2 pr-4 text-gray-500">{e.expected}</td>
            <td className={`py-2 font-mono ${e.deviation > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {e.deviation > 0 ? '+' : ''}{e.deviation.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/AnomalyTable.test.tsx
```

Expected: 3 passed

- [ ] **Step 5: Create `AnomaliesPage.tsx`**

Create `frontend/src/pages/AnomaliesPage.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { getPartnershipAnomalies, getHeadToHeadAnomalies } from '../api/anomalies'
import { getPlayers } from '../api/players'
import AnomalyTable from '../components/AnomalyTable'
import type { AnomalyEntry } from '../types'

type Tab = 'partnerships' | 'head-to-head'
type Direction = 'overplayed' | 'underplayed'

export default function AnomaliesPage() {
  const [tab, setTab] = useState<Tab>('partnerships')
  const [direction, setDirection] = useState<Direction>('overplayed')
  const [entries, setEntries] = useState<AnomalyEntry[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPlayers().then((players) =>
      setPlayerNames(Object.fromEntries(players.map((p) => [p.id, p.canonical_name])))
    )
  }, [])

  useEffect(() => {
    setLoading(true)
    const fetch = tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies
    fetch(direction, 20)
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tab, direction])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Anomalies</h1>

      <div className="mb-4 flex gap-2">
        {(['partnerships', 'head-to-head'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm capitalize transition-colors ${
              tab === t
                ? 'bg-yellow-400 text-gray-950 font-medium'
                : 'border border-gray-700 text-gray-400 hover:text-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {(['overplayed', 'underplayed'] as Direction[]).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`rounded px-3 py-1.5 text-sm capitalize transition-colors ${
                direction === d
                  ? 'bg-gray-600 text-gray-100 font-medium'
                  : 'border border-gray-700 text-gray-400 hover:text-gray-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Deviation = actual − expected (based on random pairing probability).
        {direction === 'overplayed'
          ? ' Positive = more frequent than random chance.'
          : ' Negative = less frequent than random chance.'}
      </p>

      {loading && <p className="text-gray-400">Loading…</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && <AnomalyTable entries={entries} playerNames={playerNames} />}
    </div>
  )
}
```

- [ ] **Step 6: Wire into router**

In `frontend/src/App.tsx`:
```tsx
import AnomaliesPage from './pages/AnomaliesPage'
// replace: <Route path="/anomalies" element={<div>Anomalies coming soon</div>} />
<Route path="/anomalies" element={<AnomaliesPage />} />
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: anomaly detection page with partnerships and head-to-head tabs"
```

---

### Task 8: Upload flow

**Files:**
- Create: `frontend/src/components/UploadForm.tsx`
- Create: `frontend/src/pages/UploadPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write failing component test**

Create `frontend/src/components/UploadForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UploadForm from './UploadForm'

describe('UploadForm', () => {
  it('renders file input and submit button', () => {
    render(<UploadForm onSuccess={() => {}} />)
    expect(screen.getByLabelText(/csv files/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument()
  })

  it('disables submit when no files selected', () => {
    render(<UploadForm onSuccess={() => {}} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled()
  })

  it('calls onSuccess with result after upload', async () => {
    const onSuccess = vi.fn()
    render(<UploadForm onSuccess={onSuccess} />)

    const file = new File(['Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n08-04-2024,1,Alice,Bob,21,Cara,Dan,9'], 'Week01.csv', {
      type: 'text/csv',
    })
    const input = screen.getByLabelText(/csv files/i)
    fireEvent.change(input, { target: { files: [file] } })

    // mock the fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ingested: 1, errors: [] }), { status: 200 })
    ))

    fireEvent.click(screen.getByRole('button', { name: /upload/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ ingested: 1, errors: [] }))
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/UploadForm.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create `UploadForm.tsx`**

Create `frontend/src/components/UploadForm.tsx`:
```tsx
import { useState, useRef } from 'react'
import { postScores } from '../api/ingest'
import type { IngestResult } from '../types'

interface Props {
  onSuccess: (result: IngestResult) => void
}

export default function UploadForm({ onSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const contents = await Promise.all(files.map((f) => f.text()))
      const result = await postScores(contents)
      onSuccess(result)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="csv-files" className="mb-1.5 block text-sm font-medium text-gray-300">
          CSV Files
        </label>
        <input
          id="csv-files"
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 file:mr-3 file:rounded file:border-0 file:bg-gray-700 file:px-3 file:py-1 file:text-sm file:text-gray-300 hover:file:bg-gray-600"
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">{files.length} file(s) selected</p>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={files.length === 0 || loading}
        className="rounded bg-yellow-400 px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-40 hover:bg-yellow-300 transition-colors"
      >
        {loading ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/UploadForm.test.tsx
```

Expected: 3 passed

- [ ] **Step 5: Create `UploadPage.tsx`**

Create `frontend/src/pages/UploadPage.tsx`:
```tsx
import { useState } from 'react'
import UploadForm from '../components/UploadForm'
import type { IngestResult } from '../types'

export default function UploadPage() {
  const [result, setResult] = useState<IngestResult | null>(null)

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Upload Scores</h1>
      <p className="mb-6 text-sm text-gray-400">
        Upload one or more weekly score CSV files. Each file must contain games from a single date.
        All player names will be resolved against known aliases automatically.
      </p>

      <UploadForm
        onSuccess={(r) => setResult(r)}
      />

      {result && (
        <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800 p-4">
          <p className="font-medium text-green-400">Upload complete</p>
          <p className="mt-1 text-sm text-gray-300">{result.ingested} game(s) ingested.</p>
          {result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-yellow-400">Warnings / errors:</p>
              <ul className="mt-1 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-sm text-red-400">{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire into router**

In `frontend/src/App.tsx`:
```tsx
import UploadPage from './pages/UploadPage'
// replace: <Route path="/upload" element={<div>Upload coming soon</div>} />
<Route path="/upload" element={<UploadPage />} />
```

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: CSV upload page with per-file ingestion feedback"
```

---

## Out of Scope

- Auth / multi-user (roadmap item 6)
- Alias file management UI
- Mobile-specific layout polish
- Performance over time charts (e.g. win rate trend by session)
