from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, select, distinct
from ..models import Game, GamePlayer
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


def _build_scope(
    db: Session,
    player_ids: list[int] | None,
    season_id: int | None,
) -> tuple[set[int] | None, dict[tuple[int, int], bool], dict[int, int], int]:
    """Shared setup: valid game IDs, pair counts for both team types, player game counts, total games."""
    valid_game_ids = valid_game_id_set(db, player_ids, season_id)
    player_counts = _get_player_game_counts(db, valid_game_ids)
    total_games = total_games_in_scope(db, valid_game_ids)
    return valid_game_ids, player_counts, total_games


def _get_anomalies(
    db: Session,
    same_team: bool,
    prob_given_same_game: float,
    overplayed: bool,
    limit: int | None,
    player_ids: list[int] | None,
    season_id: int | None,
) -> list[dict[str, Any]]:
    """Top-N significant pairs globally, filtered to one direction."""
    valid_game_ids, player_counts, total_games = _build_scope(db, player_ids, season_id)
    actual_counts = _pair_counts(db, same_team, valid_game_ids)

    results: list[dict[str, Any]] = []
    for a, b in _get_all_player_pairs(player_counts):
        if not overplayed and (
            player_counts.get(a, 0) < MIN_GAMES_THRESHOLD or player_counts.get(b, 0) < MIN_GAMES_THRESHOLD
        ):
            continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts[a], player_counts[b], total_games, prob_given_same_game)
        deviation = actual - expected

        if not _is_significant(deviation, actual, overplayed):
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results if limit is None else results[:limit]


def _get_player_anomalies(
    db: Session,
    same_team: bool,
    prob_given_same_game: float,
    player_id: int,
    player_ids: list[int] | None,
    season_id: int | None,
) -> list[dict[str, Any]]:
    """All significant pairs involving player_id, both directions, sorted by deviation desc."""
    valid_game_ids, player_counts, total_games = _build_scope(db, player_ids, season_id)
    actual_counts = _pair_counts(db, same_team, valid_game_ids)

    results: list[dict[str, Any]] = []
    for a, b in _get_all_player_pairs(player_counts):
        if player_id not in (a, b):
            continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts[a], player_counts[b], total_games, prob_given_same_game)
        deviation = actual - expected

        enough_games = (
            player_counts.get(a, 0) >= MIN_GAMES_THRESHOLD
            and player_counts.get(b, 0) >= MIN_GAMES_THRESHOLD
        )
        is_over = _is_significant(deviation, actual, overplayed=True)
        is_under = enough_games and _is_significant(deviation, actual, overplayed=False)

        if not (is_over or is_under):
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=True)
    return results


def get_partnership_anomalies(
    db: Session,
    overplayed: bool,
    limit: int | None = 10,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    return _get_anomalies(db, same_team=True, prob_given_same_game=P_PARTNER,
                          overplayed=overplayed, limit=limit,
                          player_ids=player_ids, season_id=season_id)


def get_head_to_head_anomalies(
    db: Session,
    overplayed: bool,
    limit: int | None = 10,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    return _get_anomalies(db, same_team=False, prob_given_same_game=P_OPPONENT,
                          overplayed=overplayed, limit=limit,
                          player_ids=player_ids, season_id=season_id)


def get_partnership_anomalies_for_player(
    db: Session,
    player_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    return _get_player_anomalies(db, same_team=True, prob_given_same_game=P_PARTNER,
                                 player_id=player_id,
                                 player_ids=player_ids, season_id=season_id)


def get_head_to_head_anomalies_for_player(
    db: Session,
    player_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    return _get_player_anomalies(db, same_team=False, prob_given_same_game=P_OPPONENT,
                                 player_id=player_id,
                                 player_ids=player_ids, season_id=season_id)


def _deviation_sq_sum(
    db: Session,
    same_team: bool,
    prob: float,
    game_ids: set[int],
) -> float:
    """Sum of (actual − expected)² over all player pairs for the given game IDs."""
    actual_counts = _pair_counts(db, same_team, game_ids)
    player_counts = _get_player_game_counts(db, game_ids)
    total = len(game_ids)
    if total == 0:
        return 0.0
    total_sq = 0.0
    for a, b in _get_all_player_pairs(player_counts):
        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts[a], player_counts[b], total, prob)
        total_sq += (actual - expected) ** 2
    return round(total_sq, 4)


def get_imbalance_trend(
    db: Session,
    sessions: int = 10,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    """Cumulative fixture imbalance score for each of the last N sessions.

    For each session (a distinct played_on date), computes the partnership and
    head-to-head Σdeviation² using all games up to and including that session.
    Returns the last `sessions` points in chronological order.
    """
    base_ids = valid_game_id_set(db, player_ids, season_id)

    # Enumerate distinct played_on dates in scope, chronologically.
    dates_q = db.execute(
        select(distinct(Game.played_on))
        .where(Game.id.in_(base_ids) if base_ids is not None else True)
        .order_by(Game.played_on)
    )
    all_dates = [row[0] for row in dates_q.all()]

    # Take the last N dates.
    tail_dates = all_dates[-sessions:] if len(all_dates) > sessions else all_dates

    # Build a lookup of date → game IDs for all games in scope.
    if base_ids is not None:
        games_q = db.execute(
            select(Game.id, Game.played_on).where(Game.id.in_(base_ids))
        )
    else:
        games_q = db.execute(select(Game.id, Game.played_on))
    date_to_ids: dict = {}
    for gid, gdate in games_q.all():
        date_to_ids.setdefault(gdate, set()).add(gid)

    # For each tail date, compute the cumulative game IDs (all sessions up to that date).
    results = []
    start_date = tail_dates[0] if tail_dates else None
    cumulative: set[int] = set()
    # First accumulate all games before the tail window.
    for d in all_dates:
        if d < start_date:
            cumulative |= date_to_ids.get(d, set())

    for session_num, d in enumerate(tail_dates, start=len(all_dates) - len(tail_dates) + 1):
        cumulative |= date_to_ids.get(d, set())
        results.append({
            "session": session_num,
            "played_on": d.isoformat(),
            "partnership_score": _deviation_sq_sum(db, True, P_PARTNER, cumulative),
            "head_to_head_score": _deviation_sq_sum(db, False, P_OPPONENT, cumulative),
        })

    return results
