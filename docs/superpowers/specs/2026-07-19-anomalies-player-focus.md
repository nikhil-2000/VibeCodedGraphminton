# Anomalies Page — Player Focus Drill-Down

## Goal

Let a user focus on a single player on the Anomalies page to see only that player's partnership and head-to-head anomaly rows, sorted by deviation. Same table format, same over/underplayed toggle.

---

## Backend

### Service changes

Extend the existing `get_partnership_anomalies` and `get_head_to_head_anomalies` functions in `backend/app/services/anomalies.py` with two new optional params:

- `focus_player_id: int | None = None` — when set, filters the computed results to rows where `player_a_id == focus_player_id or player_b_id == focus_player_id`
- `limit: int | None = 10` — `None` means no cap (used when a player is focused)

No new service functions needed — existing logic is fully reused.

### New endpoints

Add four routes to `backend/app/routers/anomalies.py`:

```
GET /anomalies/partnerships/overplayed/{player_id}
GET /anomalies/partnerships/underplayed/{player_id}
GET /anomalies/head-to-head/overplayed/{player_id}
GET /anomalies/head-to-head/underplayed/{player_id}
```

These call the existing service functions with `focus_player_id=player_id` and `limit=None`. Query params: `player_ids`, `season_id` (no `limit`). Response: `list[AnomalyEntry]`.

> **Route ordering:** new `/{player_id}` routes must be declared **after** the existing static `/overplayed` and `/underplayed` routes. FastAPI matches static segments first; since `player_id` is an integer, there is no conflict.

---

## Frontend

### `api/anomalies.ts`

Add two new fetch functions (no `limit` param):

```
getPartnershipAnomaliesForPlayer(playerId, type, playerIds, seasonId)
getHeadToHeadAnomaliesForPlayer(playerId, type, playerIds, seasonId)
```

Calls the new `/{type}/{player_id}` endpoints.

### `AnomaliesPage.tsx`

**State:** add `focusedPlayerId: number | null` (default `null`).

**Player dropdown:** add a `<Select>` next to the direction buttons. Options: "All players" (value `null`) + one entry per player from the existing `playerNames` map, sorted alphabetically. Selecting a player sets `focusedPlayerId`.

**Fetch logic:** when `focusedPlayerId` is set, call the player-scoped endpoints; otherwise call the existing global endpoints. The `selectedIds` context filter and `selectedSeasonId` continue to be passed through in both cases.

```ts
const fetch = focusedPlayerId
  ? (tab === 'partnerships' ? getPartnershipAnomaliesForPlayer : getHeadToHeadAnomaliesForPlayer).bind(null, focusedPlayerId)
  : (tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies)
```

`useEffect` dep array gains `focusedPlayerId`.

**`AnomalyTable`**: no changes needed.

---

## What does NOT change

- `AnomalyTable` component — same columns, same format
- `AnomalyEntry` type
- Existing anomaly endpoints
- `PlayerFilterContext` behaviour

---

## Out of scope

- Clicking a player name in the table to set focus (can be added later)
- Clearing focus when the global player filter changes
