# Player Head-to-Head Compare — Design Spec

## Goal

A dedicated compare page where you can see how two players stack up: their direct matchup history and a side-by-side breakdown of their overall stats.

## Entry Points

- **`/compare` selector page** — two dropdowns: Player A (all players), Player B (filtered to players who share at least one game with A). "Compare" button navigates to `/compare/:a/:b`.
- **Player detail page** — "Compare with..." button (alongside the existing Delete button) opens a player picker dialog. Selecting a player navigates to `/compare/:id/:selected`.
- **Nav** — "Compare" link added after "Pairs".

## URL Normalisation

IDs are normalised so the smaller ID is always `:a`. Both `/compare/3/7` and `/compare/7/3` resolve to the same canonical URL. The page redirects to the canonical form if needed.

## Page: `/compare/:a/:b`

### Header

Player A name and Player B name separated by "vs". Breadcrumb back to `/compare`.

### Section 1 — Head-to-Head

Shows only games where A and B appeared on **opposing teams**.

- **Win %** for each player, displayed side by side.
- **Avg score diff** centred, labelled "in favour of [name]". If equal: "even".
- **Win breakdown** in two columns (A's wins | B's wins). Each column shows close / normal / thrashing counts using the standard colour backgrounds (green / yellow / red). Thresholds match the game browser: ≤3 pts = close, 3–6 = normal, >6 = thrashing.
- **Empty state** if they have never played against each other: "No direct matchups yet."

### Section 2 — Overall Stats

Side-by-side comparison of each player's global stats (respects global player filter).

Layout: 3-column grid — A's value | stat label | B's value.

Colour coding: the leading value is bright white bold; the trailing value is dimmed slate. Applied independently per stat.

Stats (in order, with a divider before the win breakdown):

| Stat | Notes |
|------|-------|
| Win rate | % |
| Avg points | per game |
| Games played | total |
| Total wins | count |
| — divider — | |
| Close wins | ≤3 pt margin |
| Normal wins | 3–6 pt margin |
| Thrashings | >6 pt margin |

### Section 3 — Games

Filtered game browser showing only games where A and B appeared on opposing teams. Reuses the existing `GameCard` component. Respects global player filter.

## Backend

| Endpoint | Purpose |
|----------|---------|
| `GET /stats/h2h?player_a=&player_b=&player_ids=` | H2H summary: game count, win counts per player, avg score diff, breakdown by margin tier (close/normal/thrashing) per player |
| `GET /stats/compare?player_a=&player_b=&player_ids=` | Overall stats for both players in one response (avoids two round trips) |
| `GET /games?player_id=&vs=&player_ids=` | Already exists — used for the game list filtered to their matchups |

The existing `vs` filter on `/games` handles the game list. No new game endpoint needed.

## Global Filter

All new endpoints accept `player_ids` (comma-separated) consistent with the rest of the app.

## Frontend Files

| File | Change |
|------|--------|
| `frontend/src/pages/ComparePage.tsx` | New — selector page with two dropdowns |
| `frontend/src/pages/CompareDetailPage.tsx` | New — the `/compare/:a/:b` detail view |
| `frontend/src/components/H2HCard.tsx` | New — head-to-head summary section |
| `frontend/src/components/CompareStatsCard.tsx` | New — side-by-side overall stats grid |
| `frontend/src/api/stats.ts` | Add `getH2H` and `getCompareStats` |
| `frontend/src/pages/PlayerDetailPage.tsx` | Add "Compare with..." button + dialog |
| `frontend/src/components/Nav.tsx` | Add Compare link after Pairs |
| `frontend/src/App.tsx` | Add `/compare` and `/compare/:a/:b` routes |

## Backend Files

| File | Change |
|------|--------|
| `backend/app/services/stats.py` | Add `get_h2h` and `get_compare_stats` |
| `backend/app/routers/stats.py` | Add two new GET endpoints |
| `backend/app/schemas/stats.py` | Add `H2HResponse` and `CompareStatsResponse` schemas |
