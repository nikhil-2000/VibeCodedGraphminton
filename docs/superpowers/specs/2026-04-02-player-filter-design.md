# Player Filter Design

## Goal

Add a global player filter that controls which games are included in all stats. A game is only counted if all 4 of its participants are in the selected player set. Persisted in React context with a default of "Regulars only" (all non-sub players).

## Architecture

A `PlayerFilterContext` wraps the entire app. It loads all players once on mount, defaults to the "Regulars only" preset, and exposes the current selection to all pages. Every stats page reads from context and passes the selection as `player_ids` query params to the backend. The backend has a single private helper that converts a player ID list into a subquery of valid game IDs — games where all 4 participants are in the set. All service functions receive this subquery and filter against it.

## Backend

### Shared helper — `services/stats.py`

```python
def _valid_game_ids(db: Session, player_ids: list[int] | None):
    if not player_ids:
        return None  # no filter — all games included
    excluded = (
        db.query(GamePlayer.game_id)
        .filter(GamePlayer.player_id.notin_(player_ids))
        .subquery()
    )
    return db.query(Game.id).filter(~Game.id.in_(excluded)).subquery()
```

All service functions gain `player_ids: list[int] | None = None`, call `_valid_game_ids` once, and apply the result as a filter. If `None`, no filter is applied.

### Affected service functions

- `get_player_stats`
- `get_leaderboard`
- `get_all_partnerships`
- `get_partnership_for_player`
- `get_specific_partnership`
- `get_head_to_head`
- `get_matchup`
- `get_anomalies`

### Affected endpoints

All stats endpoints gain `player_ids: list[int] = Query(default=[])`. An empty list passes `None` to the service (no filter).

- `GET /stats/leaderboard`
- `GET /stats/player/{player_id}`
- `GET /players/{player_id}/stats`
- `GET /stats/partnerships`
- `GET /stats/partnerships/{player_id}`
- `GET /stats/partnerships/{player_a_id}/{player_b_id}`
- `GET /stats/head-to-head/{player_a_id}/{player_b_id}`
- `GET /stats/matchup/{pair_a_ids}/vs/{pair_b_ids}`
- `GET /anomalies`

## Frontend

### `PlayerFilterContext` — `src/context/PlayerFilterContext.tsx`

- Loads all players from `/players` on mount
- Derives presets:
  - `"everyone"` — all player IDs
  - `"regulars"` — IDs where `is_sub === false`
- Default selection on load: `"regulars"` preset
- Exposes: `selectedIds: number[]`, `setSelectedIds`, `allPlayers: Player[]`, `activePreset: "everyone" | "regulars" | "custom"`
- `App.tsx` wraps the router in `<PlayerFilterProvider>`

### `PlayerFilterPopover` — `src/components/PlayerFilterPopover.tsx`

A button in `Nav.tsx` that opens a shadcn `Popover` containing:
- Two preset chips: "Everyone" and "Regulars only" — clicking sets the full selection
- A scrollable checklist of all players with checkboxes — toggling any player sets preset to `"custom"`
- Nav button label: preset name ("Everyone" / "Regulars only") or `"{n} players"` in custom mode

### API layer — `src/api/stats.ts`

All stat-fetching functions gain a `playerIds?: number[]` param. When non-empty, each ID is appended as `&player_ids=X`.

### Pages

`LeaderboardPage`, `PlayerDetailPage`, `GraphPage`, `AnomaliesPage` — all call `usePlayerFilter()` to get `selectedIds`, pass to API calls, and include in `useEffect` dependency arrays to re-fetch on filter change.

## Testing

**Backend:**
- `_valid_game_ids` returns `None` when called with empty list
- `_valid_game_ids` excludes games with any participant outside the set
- Leaderboard and player stats reflect the filter correctly (integration tests with known fixture data)

**Frontend:**
- Context initialises with regulars-only selection after players load
- Selecting "Everyone" preset updates `selectedIds` to all player IDs
- Toggling a player moves preset to `"custom"`
- Pages include `player_ids` params in API calls when filter is active
