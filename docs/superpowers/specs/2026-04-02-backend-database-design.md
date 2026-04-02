# Graph-minton Backend & Database Design

**Date:** 2026-04-02
**Scope:** Roadmap items 1–4 (ingestion, stats queries, visualisation, anomaly detection)
**Out of scope:** Upload flow (item 5), auth (item 6)

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Python — FastAPI |
| Database | PostgreSQL |
| Local dev | Docker Compose (one command: `docker compose up`) |

All three services run in Docker containers. The `data/` folder mounts into the backend container so ingestion scripts can read CSVs directly. Because everything is containerised, transitioning to hosted later is primarily a config change (point Postgres at a managed provider such as Railway, Supabase, or Neon) with no code changes required.

---

## Project Layout

```
VibeCodedGraphminton/
  data/
    aliases/       ← reference only: existing .txt files used to manually populate players via API
    scores/        ← WeekXX.csv match files (bulk loaded via /ingest/scores)
  backend/
    app/
      main.py
      ingest.py    ← CSV parsing + name resolution
      models.py    ← SQLAlchemy models
      routers/     ← API route handlers (players, stats, anomalies, games)
    Dockerfile
  frontend/        ← React app
  docker-compose.yml
```

---

## Database Schema

### `players`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| canonical_name | TEXT UNIQUE | The display name |
| is_sub | BOOLEAN DEFAULT FALSE | True for non-squad guest players |

### `player_aliases`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| player_id | FK → players | |
| alias | TEXT UNIQUE | Includes the canonical name itself |

The canonical name is always inserted as an alias entry on player creation, so all name lookups during score ingestion go through a single path.

### `games`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| played_on | DATE | |
| week_number | INT | Derived from the filename (e.g. Week07 → 7) |
| game_number | INT | Game number within that session |
| team_a_score | INT | |
| team_b_score | INT | |

`(week_number, game_number)` is a unique constraint — re-running ingestion is idempotent.

### `game_players`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| game_id | FK → games | |
| player_id | FK → players | |
| team | CHAR(1) | `'A'` or `'B'` |

All stats (win rates, partnership records, head-to-head, graph edges) are derived from this table via SQL queries. No separate pairs/partnerships table is needed — partnership queries use a self-join on `game_id + team`.

### Subs vs Regular Players

- **Regular players**: `is_sub = false`. Created via `POST /players` before ingesting scores.
- **Subs**: `is_sub = true`. Also created via `POST /players`, with their own canonical name and any aliases that cover different spellings across score sheets.
- **Promotion**: `PATCH /players/{id}` with `{ is_sub: false }` to promote a sub to a regular player. Game history is preserved.
- Both regular players and subs share the `player_aliases` table — there is no separate storage for sub aliases.

---

## API

### Ingestion

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ingest/scores` | Bulk load all `WeekXX.csv` files into `games` + `game_players` |

Players must be created via the Players API before ingesting scores. Score ingestion resolves raw names against `player_aliases`. Any unresolvable name causes the **entire file to be rejected** — a list of all errors is returned so the user can fix them in one pass.

### Players

| Method | Endpoint | Description |
|---|---|---|
| GET | `/players` | List all players. Supports `?is_sub=true/false` |
| POST | `/players` | Create a player: `{ canonical_name, is_sub, aliases[] }` |
| GET | `/players/{id}` | Get player with their aliases |
| PATCH | `/players/{id}` | Update canonical name, is_sub, or aliases |
| GET | `/players/{id}/stats` | Games played, wins, losses, win rate, avg points per game |

A duplicate alias across two different players returns a 400 error.

### Stats

| Method | Endpoint | Description |
|---|---|---|
| GET | `/stats/leaderboard` | All players ranked. `?sort_by=win_rate` (default) or `?sort_by=avg_points` |
| GET | `/stats/partnerships` | All pairs with games together, wins, win rate (feeds graph visualisation) |
| GET | `/stats/partnerships/{id}` | All partnerships for one player |
| GET | `/stats/partnerships/{id_a}/{id_b}` | Detailed stats for a specific pair as partners |
| GET | `/stats/head-to-head/{id_a}/{id_b}` | Record when these two are on opposing teams |
| GET | `/stats/matchup/{id_a},{id_b}/vs/{id_c},{id_d}` | Record when pair A faced pair B |

### Anomalies

Each endpoint returns a ranked list sorted by deviation from expected frequency. Supports `?limit=` to cap results.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/anomalies/partnerships/overplayed` | Pairs who partner more than statistically expected |
| GET | `/anomalies/partnerships/underplayed` | Pairs who rarely partner despite both being active |
| GET | `/anomalies/head-to-head/overplayed` | Pairs who face each other more than expected |
| GET | `/anomalies/head-to-head/underplayed` | Pairs who rarely face each other despite both being active |

**Note on underplayed:** Both players must exceed a minimum game threshold to appear — players with very few games are excluded to avoid misleading results.

### Games

| Method | Endpoint | Description |
|---|---|---|
| GET | `/games` | List games. Filters: `?week=` `?player_id=` `?team={id_a},{id_b}` `?vs={id_a},{id_b}` |
| GET | `/games/{id}` | Single game detail with all four players and scores |

---

## Ingestion Rules

### Score ingestion order
Players must exist in the DB before running `/ingest/scores`. Score ingestion looks up every name in `player_aliases` to resolve to a `player_id`.

### Game validation (checked before any DB writes)
| Rule | Check |
|---|---|
| Winning score ≥ 21 | `max(team_a_score, team_b_score) >= 21` |
| Winner at least 2 points clear | `abs(team_a_score - team_b_score) >= 2` |
| No duplicate players in a game | All 4 player names must be distinct |

If any row in a file fails validation, or any name is unresolvable, the **entire file is rejected**. The response lists every error found across all rows.

### Idempotency
Score ingestion uses `(week_number, game_number)` as a unique key — re-running the same file produces no duplicates.

---

## Testing

### Unit tests (no DB)
- Game validation rules
- CSV row parsing (correct columns, malformed rows)
- Alias resolution logic (raw name → player ID)

### Integration tests (real Postgres via Docker Compose test override)
- Player creation: happy path, duplicate alias rejection
- Score ingestion: valid file loads correctly; invalid file fully rejected with correct error list
- Stats queries return expected values against a known seed dataset

No DB mocking — SQL correctness is validated directly against Postgres.
