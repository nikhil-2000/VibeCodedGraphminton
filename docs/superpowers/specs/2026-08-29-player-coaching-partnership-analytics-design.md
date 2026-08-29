# Player Coaching: Partnership & Rivalry Labels

**Date:** 2026-08-29  
**Status:** Approved for implementation

---

## Context

The player detail page already shows a partnership table (win rate with each partner) and a head-to-head table (win rate against each opponent). Players have no way to quickly interpret whether those numbers are good or bad relative to their own baseline. This feature adds insight labels — coloured badges — to both tables so a player can immediately see who their best partners are, who they underperform with, who their bogey players are, and who their punching bags are.

---

## Design

### Classification logic

Labels are derived by comparing a pair's win rate against the viewing player's own overall `win_rate`. The threshold is ±10 percentage points.

**Partnership labels (`chemistry_label`):**

| Label | Condition |
|---|---|
| `Untested` | `games_together < 3` |
| `Strong Duo` | `pair_win_rate ≥ player_win_rate + 0.10` |
| `Underperforming` | `pair_win_rate ≤ player_win_rate − 0.10` |
| `Reliable` | within ±10% of baseline, ≥ 3 games |

**Head-to-head labels (`rivalry_label`):**

| Label | Condition |
|---|---|
| `Untested` | `games_played < 3` |
| `Bogey Player` | `h2h_win_rate ≤ player_win_rate − 0.10` |
| `Punching Bag` | `h2h_win_rate ≥ player_win_rate + 0.10` |
| `Evenly Matched` | within ±10% of baseline, ≥ 3 games |

The player's own `win_rate` is already computed by `get_player_stats` — it must be fetched before labelling and passed into the classification helper.

---

## Implementation

### Backend

**`backend/app/services/stats.py`**

Add a pure helper function `_classify_chemistry(pair_win_rate, player_win_rate, games, threshold=0.10)` returning a label string. Call it inside `get_partnership_for_player` and `get_head_to_head_all` after building each row dict.

`get_partnership_for_player` already calls `get_player_stats` indirectly — it needs the player's `win_rate` passed in or fetched at the top of the function.

`get_head_to_head_all` similarly needs the player's overall `win_rate` fetched once at the top and passed to the classifier per row.

**`backend/app/schemas.py`**

- Add `chemistry_label: str` to `PlayerPartnershipResponse`
- Add `rivalry_label: str` to `HeadToHeadBulkEntry`

No new endpoints or DB migrations required.

### Frontend

**`frontend/src/types/`** — add `chemistry_label: string` to `PlayerPartnership` and `rivalry_label: string` to `HeadToHeadRecord`.

**`frontend/src/components/PartnershipTable.tsx`** — add a `Chemistry` column after the existing columns; render a `<Badge>` (or small pill) with colour coding:
- `Strong Duo` → green
- `Underperforming` → red/orange
- `Reliable` → muted/neutral
- `Untested` → grey

**`frontend/src/pages/PlayerDetailPage.tsx`** — add a `Rivalry` column to the inline H2H table (lines ~262–295) with the same badge pattern:
- `Bogey Player` → red
- `Punching Bag` → green
- `Evenly Matched` → muted
- `Untested` → grey

The badge component can be a small reusable inline component or use the existing shadcn `Badge` with variant overrides.

---

## Verification

1. Run backend + frontend (`docker compose up` / `npm run dev`)
2. Navigate to any player detail page with ≥ 5 partnerships
3. Confirm partnerships table shows a label column — check that a well-performing partner shows `Strong Duo` and a rarely-played one shows `Untested`
4. Confirm H2H table shows a rivalry label column — check `Bogey Player` appears for an opponent against whom the player's win rate is notably lower than their baseline
5. Run `npm run type-check` — no TypeScript errors
6. Run backend tests: `pytest backend/tests/`
