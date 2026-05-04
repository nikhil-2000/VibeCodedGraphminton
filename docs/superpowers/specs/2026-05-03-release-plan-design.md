# Release Plan — Multi-Sport League Platform

## Overview

Graphminton is being rebuilt from scratch as a multi-sport racquet league platform. The goal is to turn casual racquet sessions into a competitive league experience, with tiered access for players, admins, and commissioners.

This document covers the product design for Release 1 and Release 2.

---

## Architecture

- **Backend:** Python / FastAPI
- **Database:** PostgreSQL — shared schema, `league_id` on every data table
- **Frontend:** React + Tailwind, mobile-first responsive web app (installable as PWA)
- **Auth:** Self-registration, league invite links, roles scoped per league membership
- **Sport config:** Defined in code (`sports/badminton.py`, `sports/squash.py`, etc.) — leagues reference a `sport_slug` string. Adding a sport requires a code change, not a DB migration. Each config declares: `supported_team_sizes`, `score_unit`, `target_score`, `win_by`, `score_cap`, `standings_metric`.
- **Routes:** `/leagues/:id/...` — middleware validates caller belongs to that league

### Key Tables

| Table | Scope | Notes |
|---|---|---|
| `users` | Global | Email, password, display name |
| `leagues` | — | Name, sport_slug, team_size (1 or 2 — validated against sport config on creation) |
| `league_memberships` | Per league | user_id + league_id + role |
| `players` | Per league | Linked to a user |
| `sessions` | Per league | A single day/evening of games |
| `games` | Per session | Players + scores (2 or 4 players depending on league team_size) |

### Sport Config Reference

| | Badminton | Squash | Table Tennis | Tennis |
|---|---|---|---|---|
| `supported_team_sizes` | [1, 2] | [1] | [1, 2] | [1, 2] |
| `score_unit` | points | points | points | sets |
| `target_score` | 21 | 11 | 11 | 2 |
| `win_by` | 2 | 2 | 2 | 1 |
| `score_cap` | 30 | — | — | — |
| `standings_metric` | avg_points | avg_points | avg_points | win_rate |

`team_size` is chosen per league at creation and must be one of the sport's `supported_team_sizes`.

### User Roles (Subscription Tiers)

Roles are subscription tiers — not permissions granted by other users. A user's capabilities are determined by what they pay for.

| Tier | Cost | Capabilities |
|---|---|---|
| Player | Free | Join leagues via invite, view standings, game history, own profile (read-only) |
| Player Pro | Cheap | Everything Player + advanced filtering, head-to-head compare, player insights |
| Admin | Mid | Manage a single league — score entry, player management, league overview reports, everything Player Pro sees for all players. Multiple admins per league allowed. |
| Commissioner | Higher | *(R2)* Manage multiple leagues. Everything Admin sees across all their leagues. |

---

## Infrastructure & Deployment

### Hosting

| Layer | Service | Notes |
|---|---|---|
| Database | Railway (PostgreSQL) | Managed, no ops overhead. Co-located with backend. |
| Backend | Railway (FastAPI) | Auto-deploys from git. Preview environments per PR. |
| Frontend | Vercel (React PWA) | Auto-deploys from git. Preview URLs per PR. |
| Auth | Built in FastAPI | Email/password only. JWT tokens, passlib for hashing, python-jose for tokens. |

### CI/CD Pipeline (GitHub Actions)

- **PR opened** → deploy preview environment for both frontend and backend. Each PR gets a live URL for click-through testing before merge.
- **Merge to main** → deploy to production automatically.

### Testing Strategy

- **Backend:** Integration tests against a real test database. Test API endpoints directly — no mocking the DB. Mocks hide the bugs that matter most.
- **Frontend:** Playwright tests for critical flows only (login, score entry, standings). Skip unit tests on components unless logic is complex.
- **Type safety as first line of defence:** TypeScript on the frontend + Pydantic on the backend catches whole categories of bugs before tests run.
- **Manual testing via PR previews:** Every PR gets a live environment — click through changes before merging.

---

## Release 1 — "Get It On The Board"

**Goal:** Admin can run the league. Players can see where they stand.

### Auth

- Users self-register with email and password
- A user's capabilities are determined by their subscription tier
- Admin creates a league and shares an invite link
- Any Player or Player Pro can join a league via invite link
- Multiple Admin-tier users can manage the same league

### Score Entry

- Admin opens a score entry form on desktop or mobile
- Creates a session (date)
- For each game: selects 4 players from dropdowns, enters scores for each pair
- New players can be added inline during entry (no separate flow required)
- Sessions are submitted as a batch

### Standings

- Ranked by average points per game (primary)
- Win rate shown as secondary metric
- Scoped to the league; configurable minimum games threshold to appear

### Game History

- List of all games, filterable by date
- Shows players and scores per game

### Player Profile

- Overall record (W/L/avg points)
- Games played with each partner — W/L breakdown
- Games played against each opponent — W/L breakdown

### Out of Scope for R1

- Player Pro and Commissioner tiers
- Player insights (rivals, bogeys, form, freebies)
- Head-to-head compare
- Pairs analysis
- Advanced game browser filtering
- Opponent strength weighting
- Player merge tool (duplicate handling)
- Second sport

---

## Release 2 — "Make It Interesting"

**Goal:** Give players a reason to open the app every week, not just check their rank.

### Player Pro Tier

Gate the following features behind Player Pro:

- **Player insights** — rivals (who beats you most), bogeys (who you struggle against), freebies (easy wins), form (recent trend)
- **Head-to-head compare** — pick any two players, see full breakdown
- **Advanced game browser** — filter by date range, player, partner, outcome

### Pairs Analysis

- Best and worst performing partnerships across the league
- Underrepresented pairings (players who rarely play together)
- Available to all players

### Commissioner Tier

- Manage multiple leagues from one account
- Top-level view across all their leagues
- Invite other Admin-tier users to their leagues

### Standings Improvement

- Opponent strength weighting — win against stronger players counts more

### Second Sport

- Add a second sport config file (e.g. `sports/squash.py`)
- Validates the sport-agnostic data model works in practice

### Player Merge Tool

- Admin can merge two player entries into one (handles duplicate registrations)
