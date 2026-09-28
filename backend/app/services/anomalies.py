from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from ..models import GamePlayer
from ._common import normalize_pair, total_games_in_scope, valid_game_id_set


MIN_GAMES_THRESHOLD = 3
DEVIATION_RATIO_THRESHOLD = 0.20
MIN_ABSOLUTE_DEVIATION = 2.0

# In a 4-player game a given other player is your partner in 1 of the 3 possible
# splits and an opponent in the other 2.
P_PARTNER = 1 / 3
P_OPPONENT = 2 / 3


def _get_player_game_counts(db: Session, valid_game_ids: set[int] | None = None) -> dict[int, int]:
    q = db.query(GamePlayer.player_id, func.count().label("games")).group_by(GamePlayer.player_id)
    if valid_game_ids is not None:
        q = q.filter(GamePlayer.game_id.in_(valid_game_ids))
    rows = q.all()
    return {row.player_id: row.games for row in rows}


def _expected_frequency(games_a: int, games_b: int, total: int, prob_given_same_game: float) -> float:
    if total == 0:
        return 0.0
    return (games_a / total) * (games_b / total) * total * prob_given_same_game


def _get_all_player_pairs(player_counts: dict[int, int]) -> list[tuple[int, int]]:
    ids = sorted(player_counts.keys())
    return [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]


def _pair_counts(db: Session, same_team: bool, valid_game_ids: set[int] | None) -> dict[tuple[int, int], int]:
    """How many games each player pair actually shared, as partners or as opponents."""
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)
    team_predicate = (gp1.team == gp2.team) if same_team else (gp1.team != gp2.team)

    q = (
        db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & team_predicate & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
    )
    if valid_game_ids is not None:
        q = q.filter(gp1.game_id.in_(valid_game_ids))

    return {normalize_pair(r.a, r.b): int(r.n) for r in q.all()}


def _get_anomalies(
    db: Session,
    same_team: bool,
    prob_given_same_game: float,
    overplayed: bool | None,
    limit: int | None,
    player_ids: list[int] | None,
    season_id: int | None,
    focus_player_id: int | None,
) -> list[dict[str, Any]]:
    """Pairs that played together (or against each other) far more or less than chance.

    `same_team` picks partnerships vs head-to-head; everything downstream —
    the expectation model, the significance thresholds, sorting and limiting —
    is identical for both.

    `overplayed=None` returns all significant pairs (both directions), sorted by
    deviation descending. Used by the combined per-player endpoint.
    """
    valid_game_ids = valid_game_id_set(db, player_ids, season_id)
    actual_counts = _pair_counts(db, same_team, valid_game_ids)
    player_counts = _get_player_game_counts(db, valid_game_ids)
    total_games = total_games_in_scope(db, valid_game_ids)

    results: list[dict[str, Any]] = []
    for a, b in _get_all_player_pairs(player_counts):
        # Underplay is only meaningful once both players have enough games to judge.
        if overplayed is not True and (
            player_counts.get(a, 0) < MIN_GAMES_THRESHOLD or player_counts.get(b, 0) < MIN_GAMES_THRESHOLD
        ):
            continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts[a], player_counts[b], total_games, prob_given_same_game)
        deviation = actual - expected

        if overplayed is None:
            if not (_is_significant(deviation, actual, overplayed=True) or _is_significant(deviation, actual, overplayed=False)):
                continue
        else:
            if not _is_significant(deviation, actual, overplayed):
                continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=True if overplayed is not False else False)
    if focus_player_id is not None:
        results = [r for r in results if focus_player_id in (r["player_a_id"], r["player_b_id"])]
    return results if limit is None else results[:limit]


def _is_significant(deviation: float, actual: int, overplayed: bool) -> bool:
    """Filter out deviations too small, or too small relative to the pair's games, to matter."""
    if overplayed and deviation <= 0:
        return False
    if not overplayed and deviation >= 0:
        return False
    if abs(deviation) < MIN_ABSOLUTE_DEVIATION:
        return False
    if actual > 0 and abs(deviation) / actual < DEVIATION_RATIO_THRESHOLD:
        return False
    return True


def get_partnership_anomalies(db: Session, overplayed: bool, limit: int | None = 10, player_ids: list[int] | None = None, season_id: int | None = None, focus_player_id: int | None = None) -> list[dict[str, Any]]:
    return _get_anomalies(
        db,
        same_team=True,
        prob_given_same_game=P_PARTNER,
        overplayed=overplayed,
        limit=limit,
        player_ids=player_ids,
        season_id=season_id,
        focus_player_id=focus_player_id,
    )


def get_head_to_head_anomalies(db: Session, overplayed: bool, limit: int | None = 10, player_ids: list[int] | None = None, season_id: int | None = None, focus_player_id: int | None = None) -> list[dict[str, Any]]:
    return _get_anomalies(
        db,
        same_team=False,
        prob_given_same_game=P_OPPONENT,
        overplayed=overplayed,
        limit=limit,
        player_ids=player_ids,
        season_id=season_id,
        focus_player_id=focus_player_id,
    )


def get_player_anomalies(
    db: Session,
    player_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """All significant anomalies for a single player — both directions, both types — in two lists."""
    return {
        "partnerships": _get_anomalies(
            db, same_team=True, prob_given_same_game=P_PARTNER,
            overplayed=None, limit=None,
            player_ids=player_ids, season_id=season_id,
            focus_player_id=player_id,
        ),
        "head_to_head": _get_anomalies(
            db, same_team=False, prob_given_same_game=P_OPPONENT,
            overplayed=None, limit=None,
            player_ids=player_ids, season_id=season_id,
            focus_player_id=player_id,
        ),
    }
