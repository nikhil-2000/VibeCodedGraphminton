# Release Plan — Multi-Sport League Platform

## Overview

Graphminton is being rebuilt from scratch as a multi-sport racquet league platform. The goal is to turn casual racquet sessions into a competitive league experience, with tiered access for players, admins, and commissioners.

This document covers the product design for Release 1 and Release 2.

---

## Architecture

- **Backend:** Python / FastAPI
- **Database:** PostgreSQL — shared schema, `league_id` on every data table, sport config stored as a JSONB column
- **Frontend:** React + Tailwind, mobile-first responsive web app (installable as PWA)
- **Auth:** Self-registration, league invite links, roles scoped per league membership
- **Routes:** `/leagues/:id/...` — middleware validates caller belongs to that league

### Key Tables

| Table | Scope | Notes |
|---|---|---|
| `users` | Global | Email, password, display name |
| `leagues` | — | Name, sport config (JSONB) |
| `league_memberships` | Per league | user_id + league_id + role |
| `players` | Per league | Linked to a user |
| `sessions` | Per league | A single day/evening of games |
| `games` | Per session | 4 players + scores |

### User Roles

| Role | Description |
|---|---|
| Player | View standings, game history, own profile |
| Admin | Everything Player sees + score entry, player management |
| Player Pro | *(R2)* Advanced insights and filtering |
| Commissioner | *(R2)* Manage multiple leagues |

---

## Release 1 — "Get It On The Board"

**Goal:** Admin can run the league. Players can see where they stand.

### Auth

- Players self-register (email + password)
- Admin generates a league invite link and shares it
- Player clicks invite, registers or logs in, joins the league as Player role
- Admin manually promotes users to Admin if needed

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
- Invite admins to leagues they manage
- Top-level view across all their leagues

### Standings Improvement

- Opponent strength weighting — win against stronger players counts more

### Second Sport

- Configure a second sport (e.g. squash or tennis) using the sport config JSONB field
- Validates the sport-agnostic data model works in practice

### Player Merge Tool

- Admin can merge two player entries into one (handles duplicate registrations)
