# Anomalies Page — Player Focus Drill-Down

## Goal

Let a user focus on a single player on the Anomalies page to see only that player's partnership and head-to-head anomaly rows, sorted by deviation. Same table format, same over/underplayed toggle.

---

## Backend

### New service functions

Add two functions to `backend/app/services/anomalies.py`:

```
get_partnership_anomalies_for_player(db, player_id, overplayed, limit, player_ids, season_id)
get_head_to_head_anomalies_for_player(db, player_id, overplayed, limit, player_ids, season_id)
```

Each wraps the existing logic but adds a WHERE filter so only rows where `player_id` appears as one of the two players are returned. The `player_ids` pool filter and `season_id` filter continue to apply as-is.

### New endpoints

Add four routes to `backend/app/routers/anomalies.py` — must be declared **before** the existing static routes to avoid route conflicts:

```
GET /anomalies/partnerships/overplayed/{player_id}
GET /anomalies/partnerships/underplayed/{player_id}
GET /anomalies/head-to-head/overplayed/{player_id}
GET /anomalies/head-to-head/underplayed/{player_id}
```

Same query params as existing routes (`limit`, `player_ids`, `season_id`). Same `list[AnomalyEntry]` response shape.

> **Route ordering:** static segments (`overplayed`, `underplayed`) must come before dynamic `{player_id}` routes. The existing routes are already static, so the new player-scoped routes should be added **after** them — FastAPI matches static first, so `/overplayed` won't conflict with `/{player_id}` as long as no player_id value equals "overplayed" or "underplayed" (they're integers, so this is fine).

---

## Frontend

### `api/anomalies.ts`

Add two new fetch functions:

```
getPartnershipAnomaliesForPlayer(playerId, type, limit, playerIds, seasonId)
getHeadToHeadAnomaliesForPlayer(playerId, type, limit, playerIds, seasonId)
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
