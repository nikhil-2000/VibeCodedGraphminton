from collections import defaultdict
from itertools import combinations
from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy.engine import Row
from sqlalchemy import func
from ..models import Player, Game, GamePlayer
from ._common import (
    normalize_pair,
    points_against_case,
    points_for_case,
    valid_game_ids,
    win_record,
    winner_from_perspective,
    won_case,
)


def _percentile_by_avg_points(avg_points_map: dict[int, float]) -> dict[int, float]:
    """Rank players by average points and normalise to [0, 1], best = 1.0."""
    ranked = sorted(avg_points_map.keys(), key=avg_points_map.__getitem__, reverse=True)
    n = len(ranked)
    return {pid: 1.0 - (i / (n - 1)) if n > 1 else 1.0 for i, pid in enumerate(ranked)}


def _avg_points_by_player(db: Session, valid_ids) -> dict[int, float]:
    q = (
        db.query(GamePlayer.player_id, func.avg(points_for_case()).label("avg_pts"))
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(GamePlayer.player_id)
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q
    return {r.player_id: float(r.avg_pts or 0) for r in q.all()}


def get_player_stats(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    valid_ids = valid_game_ids(player_ids, season_id)
    q = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case()).label("wins"),
            func.avg(points_for_case()).label("avg_points"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q
    result = q.one()

    return {
        "player_id": player_id,
        **win_record(result.games_played, result.wins, result.avg_points or 0),
    }


def get_leaderboard(db: Session, sort_by: str = "win_rate", player_ids: list[int] | None = None, season_id: int | None = None, game_ids: list[int] | None = None) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    q = (
        db.query(
            Player.id,
            Player.canonical_name,
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case()).label("wins"),
            func.avg(points_for_case()).label("avg_points"),
        )
        .join(GamePlayer, Player.id == GamePlayer.player_id)
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(Player.id, Player.canonical_name)
    )
    if game_ids is not None:
        q = q.filter(Game.id.in_(game_ids))
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q

    entries = [
        {
            "player_id": row.id,
            "canonical_name": row.canonical_name,
            **win_record(row.games_played, row.wins, row.avg_points or 0),
        }
        for row in q.all()
    ]
    return _sorted_by(entries, sort_by)


def _sorted_by(entries: list[dict[str, Any]], sort_by: str) -> list[dict[str, Any]]:
    key = "avg_points" if sort_by == "avg_points" else "win_rate"
    return sorted(entries, key=lambda e: e[key], reverse=True)


def _partnership_query(db: Session, *name_columns):
    """Self-join GamePlayer to itself on same game + same team, each pair once."""
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)
    columns = [
        gp1.player_id.label("player_a_id"),
        gp2.player_id.label("player_b_id"),
        func.count().label("games_together"),
        func.sum(won_case(gp1)).label("wins"),
        func.avg(points_for_case(gp1)).label("avg_points"),
    ]
    query = (
        db.query(*columns, *name_columns)
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .join(Game, gp1.game_id == Game.id)
    )
    return query, gp1, gp2


def get_all_partnerships(db: Session, player_id: int | None = None, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    query, gp1, gp2 = _partnership_query(db)
    query = query.group_by(gp1.player_id, gp2.player_id)

    if player_id is not None:
        query = query.filter((gp1.player_id == player_id) | (gp2.player_id == player_id))
    query = query.filter(Game.id.in_(valid_ids)) if valid_ids is not None else query

    return [
        {
            "player_a_id": row.player_a_id,
            "player_b_id": row.player_b_id,
            **_partnership_record(row),
        }
        for row in query.all()
    ]


def _partnership_record(row) -> dict[str, Any]:
    """A partnership's win record, keyed on games_together rather than games_played."""
    record = win_record(row.games_together, row.wins, row.avg_points or 0)
    record["games_together"] = record.pop("games_played")
    return record


def get_pairings_leaderboard(db: Session, sort_by: str = "win_rate", player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    pa = aliased(Player)
    pb = aliased(Player)
    query, gp1, gp2 = _partnership_query(
        db,
        pa.canonical_name.label("player_a_name"),
        pb.canonical_name.label("player_b_name"),
    )
    query = (
        query
        .join(pa, gp1.player_id == pa.id)
        .join(pb, gp2.player_id == pb.id)
        .group_by(gp1.player_id, pa.canonical_name, gp2.player_id, pb.canonical_name)
    )
    query = query.filter(Game.id.in_(valid_ids)) if valid_ids is not None else query

    entries = [
        {
            "player_a_id": row.player_a_id,
            "player_a_name": row.player_a_name,
            "player_b_id": row.player_b_id,
            "player_b_name": row.player_b_name,
            **_partnership_record(row),
        }
        for row in query.all()
    ]
    return _sorted_by(entries, sort_by)


def get_partnership_for_player(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    result: list[dict[str, Any]] = []
    for r in get_all_partnerships(db, player_id, player_ids, season_id):
        entry: dict[str, Any] = {
            "partner_id": r["player_b_id"] if r["player_a_id"] == player_id else r["player_a_id"],
        }
        entry.update({k: v for k, v in r.items() if k not in ("player_a_id", "player_b_id")})
        result.append(entry)
    return result


def get_specific_partnership(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    lo, hi = normalize_pair(player_a_id, player_b_id)
    valid_ids = valid_game_ids(player_ids, season_id)
    query, gp1, gp2 = _partnership_query(db)
    query = query.filter(gp1.player_id == lo, gp2.player_id == hi).group_by(gp1.player_id, gp2.player_id)
    query = query.filter(Game.id.in_(valid_ids)) if valid_ids is not None else query
    row = query.one_or_none()
    if row is None:
        return {"player_a_id": lo, "player_b_id": hi, "games_together": 0, "wins": 0, "losses": 0, "win_rate": 0.0}
    return {"player_a_id": lo, "player_b_id": hi, **_partnership_record(row)}


def _win_split(rows: list[Row[tuple[Game, str]]]) -> tuple[int, int]:
    """Count wins for each side given (game, team-of-first-side) rows."""
    first_wins = second_wins = 0
    for game, team in rows:
        if winner_from_perspective(game, team):
            first_wins += 1
        else:
            second_wins += 1
    return first_wins, second_wins


def get_head_to_head(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    valid_ids = valid_game_ids(player_ids, season_id)
    gp_a = aliased(GamePlayer)
    gp_b = aliased(GamePlayer)

    q = (
        db.query(Game, gp_a.team.label("team_a"))
        .join(gp_a, (gp_a.game_id == Game.id) & (gp_a.player_id == player_a_id))
        .join(gp_b, (gp_b.game_id == Game.id) & (gp_b.player_id == player_b_id) & (gp_b.team != gp_a.team))
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q
    rows = q.all()

    a_wins, b_wins = _win_split(rows)
    return {
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
        "games_played": a_wins + b_wins,
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
    }


def get_head_to_head_all(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    gp_me = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)

    q = (
        db.query(
            gp_opp.player_id.label("opponent_id"),
            func.count().label("games_played"),
            func.sum(won_case(gp_me)).label("wins"),
            func.avg(points_for_case(gp_me)).label("avg_points"),
        )
        .join(gp_opp, (gp_opp.game_id == gp_me.game_id) & (gp_opp.team != gp_me.team))
        .join(Game, gp_me.game_id == Game.id)
        .filter(gp_me.player_id == player_id)
        .group_by(gp_opp.player_id)
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q

    results = []
    for row in q.all():
        record = win_record(row.games_played, row.wins, row.avg_points or 0)
        record.pop("win_rate")
        results.append({"opponent_id": row.opponent_id, **record})
    results.sort(key=lambda r: (r["wins"] / r["games_played"] if r["games_played"] else 0), reverse=True)
    return results


def get_pairings_faced(
    db: Session,
    player_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    gp_me = aliased(GamePlayer)
    gp_opp1 = aliased(GamePlayer)
    gp_opp2 = aliased(GamePlayer)
    p1 = aliased(Player)
    p2 = aliased(Player)

    q = (
        db.query(
            gp_opp1.player_id.label("opp1_id"),
            p1.canonical_name.label("opp1_name"),
            gp_opp2.player_id.label("opp2_id"),
            p2.canonical_name.label("opp2_name"),
            func.count().label("games_faced"),
            func.sum(won_case(gp_me)).label("wins"),
        )
        .join(gp_opp1, (gp_opp1.game_id == gp_me.game_id) & (gp_opp1.team != gp_me.team))
        .join(
            gp_opp2,
            (gp_opp2.game_id == gp_me.game_id)
            & (gp_opp2.team == gp_opp1.team)
            & (gp_opp2.player_id > gp_opp1.player_id),
        )
        .join(Game, gp_me.game_id == Game.id)
        .join(p1, p1.id == gp_opp1.player_id)
        .join(p2, p2.id == gp_opp2.player_id)
        .filter(gp_me.player_id == player_id)
        .group_by(gp_opp1.player_id, p1.canonical_name, gp_opp2.player_id, p2.canonical_name)
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q

    results = []
    for row in q.all():
        a_id, b_id = normalize_pair(row.opp1_id, row.opp2_id)
        a_name = row.opp1_name if row.opp1_id == a_id else row.opp2_name
        b_name = row.opp2_name if row.opp2_id == b_id else row.opp1_name
        record = win_record(row.games_faced, row.wins)
        record["games_faced"] = record.pop("games_played")
        results.append({
            "pair_player_a_id": a_id,
            "pair_player_a_name": a_name,
            "pair_player_b_id": b_id,
            "pair_player_b_name": b_name,
            **record,
        })

    results.sort(key=lambda r: r["games_faced"], reverse=True)
    return results


def get_vs_pairings_leaderboard(
    db: Session,
    pair_player_ids: list[int],
    sort_by: str = "games_faced",
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    """Rank all players by how many games they played against pairs composed entirely of pair_player_ids."""
    if not pair_player_ids:
        return []

    valid_ids = valid_game_ids(player_ids, season_id)
    gp_me = aliased(GamePlayer)
    gp_opp1 = aliased(GamePlayer)
    gp_opp2 = aliased(GamePlayer)

    q = (
        db.query(
            gp_me.player_id.label("player_id"),
            Player.canonical_name,
            func.count().label("games_faced"),
            func.sum(won_case(gp_me)).label("wins"),
        )
        .join(Player, Player.id == gp_me.player_id)
        .join(gp_opp1, (gp_opp1.game_id == gp_me.game_id) & (gp_opp1.team != gp_me.team))
        .join(
            gp_opp2,
            (gp_opp2.game_id == gp_me.game_id)
            & (gp_opp2.team == gp_opp1.team)
            & (gp_opp2.player_id > gp_opp1.player_id),
        )
        .join(Game, gp_me.game_id == Game.id)
        .filter(
            gp_opp1.player_id.in_(pair_player_ids),
            gp_opp2.player_id.in_(pair_player_ids),
        )
        .group_by(gp_me.player_id, Player.canonical_name)
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q

    results = []
    for row in q.all():
        record = win_record(row.games_faced, row.wins)
        record["games_faced"] = record.pop("games_played")
        results.append({
            "player_id": row.player_id,
            "canonical_name": row.canonical_name,
            **record,
        })

    sort_key = "win_rate" if sort_by == "win_rate" else "games_faced"
    results.sort(key=lambda r: r[sort_key], reverse=True)
    return results


def get_matchup(db: Session, pair_a: tuple[int, int], pair_b: tuple[int, int], player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    valid_ids = valid_game_ids(player_ids, season_id)
    gp_a1 = aliased(GamePlayer)
    gp_a2 = aliased(GamePlayer)
    gp_b1 = aliased(GamePlayer)
    gp_b2 = aliased(GamePlayer)

    q = (
        db.query(Game, gp_a1.team.label("pair_a_team"))
        .join(gp_a1, (gp_a1.game_id == Game.id) & (gp_a1.player_id == pair_a[0]))
        .join(gp_a2, (gp_a2.game_id == Game.id) & (gp_a2.player_id == pair_a[1]) & (gp_a2.team == gp_a1.team))
        .join(gp_b1, (gp_b1.game_id == Game.id) & (gp_b1.player_id == pair_b[0]) & (gp_b1.team != gp_a1.team))
        .join(gp_b2, (gp_b2.game_id == Game.id) & (gp_b2.player_id == pair_b[1]) & (gp_b2.team == gp_b1.team))
    )
    q = q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q
    rows = q.all()

    a_wins, b_wins = _win_split(rows)
    return {
        "pair_a": list(pair_a),
        "pair_b": list(pair_b),
        "games_played": a_wins + b_wins,
        "pair_a_wins": a_wins,
        "pair_b_wins": b_wins,
    }


def get_matchup_quality(db: Session, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = valid_game_ids(player_ids, season_id)

    # Step 1: compute win rate + avg points per player across filtered games
    wr_q = (
        db.query(
            GamePlayer.player_id,
            func.count(GamePlayer.id).label("gp"),
            func.sum(won_case()).label("wins"),
            func.avg(points_for_case()).label("avg_pts"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(GamePlayer.player_id)
    )
    wr_q = wr_q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else wr_q
    win_rates: dict[int, float] = {}
    avg_points_map: dict[int, float] = {}
    for r in wr_q.all():
        gp = r.gp or 0
        win_rates[r.player_id] = round(int(r.wins or 0) / gp, 4) if gp else 0.0
        avg_points_map[r.player_id] = round(float(r.avg_pts or 0), 2)

    percentile = _percentile_by_avg_points(avg_points_map)

    # Step 2: per (player, game) fetch partner + both opponents
    # Join: me → partner (same team, different player) + opp (other team)
    # Produces 2 rows per (player, game): one per opponent, partner is same both rows
    gp_me = aliased(GamePlayer)
    gp_partner = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)

    detail_q = (
        db.query(
            gp_me.player_id.label("player_id"),
            gp_me.game_id.label("game_id"),
            points_for_case(gp_me).label("my_pts"),
            points_against_case(gp_me).label("opp_pts"),
            gp_partner.player_id.label("partner_id"),
            gp_opp.player_id.label("opp_id"),
        )
        .join(gp_partner, (gp_partner.game_id == gp_me.game_id) & (gp_partner.team == gp_me.team) & (gp_partner.player_id != gp_me.player_id))
        .join(gp_opp, (gp_opp.game_id == gp_me.game_id) & (gp_opp.team != gp_me.team))
        .join(Game, gp_me.game_id == Game.id)
    )
    detail_q = detail_q.filter(Game.id.in_(valid_ids)) if valid_ids is not None else detail_q

    # Group by (player, game): collect partner_id (same each row) + opp_ids (2 different ones)
    player_games: dict[int, dict[int, dict]] = defaultdict(dict)
    for r in detail_q.all():
        if r.game_id not in player_games[r.player_id]:
            player_games[r.player_id][r.game_id] = {
                "my_pts": int(r.my_pts),
                "opp_pts": int(r.opp_pts),
                "partner_id": r.partner_id,
                "opp_ids": [],
            }
        player_games[r.player_id][r.game_id]["opp_ids"].append(r.opp_id)

    player_name = {p.id: p.canonical_name for p in db.query(Player).all()}

    results = []
    for player_id, games_dict in player_games.items():
        total_diff = 0.0
        total_imbalance = 0.0
        total_partner_advantage = 0.0
        total_partner_quality = 0.0
        total_opponent_quality = 0.0
        blowout_wins = blowout_losses = 0
        for g in games_dict.values():
            diff = g["my_pts"] - g["opp_pts"]
            total_diff += diff
            my_team_wr = (win_rates.get(player_id, 0.0) + win_rates.get(g["partner_id"], 0.0)) / 2
            opp_team_wr = sum(win_rates.get(oid, 0.0) for oid in g["opp_ids"]) / len(g["opp_ids"]) if g["opp_ids"] else 0.0
            total_imbalance += my_team_wr - opp_team_wr
            partner_pct = percentile.get(g["partner_id"], 0.5)
            opp_pct = sum(percentile.get(oid, 0.5) for oid in g["opp_ids"]) / len(g["opp_ids"]) if g["opp_ids"] else 0.5
            total_partner_quality += partner_pct
            total_opponent_quality += opp_pct
            total_partner_advantage += partner_pct - opp_pct
            gap = abs(diff)
            if gap > 6:
                if diff > 0:
                    blowout_wins += 1
                else:
                    blowout_losses += 1
        n = len(games_dict)
        blowout_total = blowout_wins + blowout_losses
        results.append({
            "player_id": player_id,
            "canonical_name": player_name.get(player_id, f"#{player_id}"),
            "games_played": n,
            "avg_point_diff": round(total_diff / n, 2) if n else 0.0,
            "avg_team_skill_imbalance": round(total_imbalance / n, 4) if n else 0.0,
            "partner_quality": round(total_partner_quality / n, 4) if n else 0.0,
            "opponent_quality": round(total_opponent_quality / n, 4) if n else 0.0,
            "partner_advantage": round(total_partner_advantage / n, 4) if n else 0.0,
            "blowout_win_pct": round(blowout_wins / blowout_total, 4) if blowout_total else None,
            "blowout_games": blowout_total,
        })

    return sorted(results, key=lambda r: r["avg_team_skill_imbalance"], reverse=True)


def get_suggested_games(
    db: Session,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
    top_n: int = 5,
    focus_player_id: int | None = None,
) -> list[dict[str, Any]]:
    from ..services.anomalies import get_partnership_anomalies, get_head_to_head_anomalies

    valid_ids = valid_game_ids(player_ids, season_id)
    avg_points_map = _avg_points_by_player(db, valid_ids)
    percentile = _percentile_by_avg_points(avg_points_map)

    def debt_map(anomalies: list[dict[str, Any]]) -> dict[tuple[int, int], float]:
        return {
            normalize_pair(r["player_a_id"], r["player_b_id"]): abs(r["deviation"])
            for r in anomalies
        }

    def anomalies(fn, overplayed: bool) -> dict[tuple[int, int], float]:
        return debt_map(fn(db, overplayed=overplayed, limit=None, player_ids=player_ids, season_id=season_id))

    partner_debt = anomalies(get_partnership_anomalies, overplayed=False)
    h2h_debt = anomalies(get_head_to_head_anomalies, overplayed=False)
    partner_overplay = anomalies(get_partnership_anomalies, overplayed=True)
    h2h_overplay = anomalies(get_head_to_head_anomalies, overplayed=True)

    mq = get_matchup_quality(db, player_ids, season_id)
    pattern_map: dict[int, dict] = {r["player_id"]: r for r in mq}

    FAIRNESS_WEIGHT = 2.0
    FAIRNESS_THRESHOLD = 0.05

    active_players = sorted(avg_points_map.keys())
    player_names: dict[int, str] = {
        p.id: p.canonical_name
        for p in db.query(Player).filter(Player.id.in_(active_players)).all()
    }

    def name(pid: int) -> str:
        return player_names.get(pid, str(pid))

    scored: list[dict[str, Any]] = []

    if focus_player_id is not None:
        others = [p for p in active_players if p != focus_player_id]
        combos = ((focus_player_id, *rest) for rest in combinations(others, 3))
    else:
        combos = combinations(active_players, 4)  # type: ignore[assignment]

    for combo in combos:
        p1, p2, p3, p4 = combo
        splits = [
            ((p1, p2), (p3, p4)),
            ((p1, p3), (p2, p4)),
            ((p1, p4), (p2, p3)),
        ]
        for team_a_ids, team_b_ids in splits:
            a1, a2 = team_a_ids
            b1, b2 = team_b_ids
            partner_pairs = [(a1, a2), (b1, b2)]
            cross_pairs = [(a1, b1), (a1, b2), (a2, b1), (a2, b2)]

            def total(partner_source, h2h_source) -> float:
                return (
                    sum(partner_source.get(normalize_pair(x, y), 0.0) for x, y in partner_pairs)
                    + sum(h2h_source.get(normalize_pair(x, y), 0.0) for x, y in cross_pairs)
                )

            underplay_debt = total(partner_debt, h2h_debt)
            overplay_penalty = total(partner_overplay, h2h_overplay)

            team_a_avg_pct = (percentile.get(a1, 0.5) + percentile.get(a2, 0.5)) / 2
            team_b_avg_pct = (percentile.get(b1, 0.5) + percentile.get(b2, 0.5)) / 2

            fairness_correction = 0.0
            for pid in combo:
                pm = pattern_map.get(pid)
                if not pm:
                    continue
                pa = pm["partner_advantage"]
                imb = pm["avg_team_skill_imbalance"]
                on_team_a = pid in (a1, a2)
                partner_id = (a2 if pid == a1 else a1) if on_team_a else (b2 if pid == b1 else b1)
                partner_pct = percentile.get(partner_id, 0.5)
                opp_avg = team_b_avg_pct if on_team_a else team_a_avg_pct
                my_team_avg = team_a_avg_pct if on_team_a else team_b_avg_pct

                if abs(pa) > FAIRNESS_THRESHOLD:
                    if (pa > 0 and partner_pct < opp_avg) or (pa < 0 and partner_pct > opp_avg):
                        fairness_correction += abs(pa) * FAIRNESS_WEIGHT
                if abs(imb) > FAIRNESS_THRESHOLD:
                    if (imb > 0 and my_team_avg < opp_avg) or (imb < 0 and my_team_avg > opp_avg):
                        fairness_correction += abs(imb) * FAIRNESS_WEIGHT

            total_score = underplay_debt + fairness_correction - overplay_penalty
            if total_score <= 0:
                continue

            fixes: list[str] = [
                f"{name(x)} & {name(y)} (partnership)"
                for x, y in partner_pairs
                if normalize_pair(x, y) in partner_debt
            ] + [
                f"{name(x)} vs {name(y)} (h2h)"
                for x, y in cross_pairs
                if normalize_pair(x, y) in h2h_debt
            ]

            scored.append({
                "team_a": [name(a1), name(a2)],
                "team_b": [name(b1), name(b2)],
                "score": round(total_score, 4),
                "fixes": fixes,
                "_partnerships": {normalize_pair(a1, a2), normalize_pair(b1, b2)},
            })

    scored.sort(key=lambda r: r["score"], reverse=True)

    # Greedy dedup: avoid repeating the same partnership across suggestions
    used_partnerships: set[tuple[int, int]] = set()
    result: list[dict[str, Any]] = []
    for game in scored:
        game_partnerships: set[tuple[int, int]] = game.pop("_partnerships")
        if game_partnerships & used_partnerships:
            continue
        used_partnerships |= game_partnerships
        result.append(game)
        if len(result) == top_n:
            break

    return result


def get_player_upset_stats(
    db: Session,
    player_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> dict[str, Any]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")

    valid_ids = valid_game_ids(player_ids, season_id)

    # Build a map of each player's career avg_points (scoped to active filters)
    avg_map = _avg_points_by_player(db, valid_ids)

    # Subquery: all game IDs this player participated in (filtered)
    my_games_sq = db.query(GamePlayer.game_id).filter(GamePlayer.player_id == player_id).join(Game, GamePlayer.game_id == Game.id)
    if valid_ids is not None:
        my_games_sq = my_games_sq.filter(Game.id.in_(valid_ids))

    # Fetch all (game_id, team, player_id, score_a, score_b) rows for those games
    gp_q = (
        db.query(GamePlayer.game_id, GamePlayer.player_id, GamePlayer.team,
                 Game.team_a_score, Game.team_b_score)
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.game_id.in_(my_games_sq))
    )
    if valid_ids is not None:
        gp_q = gp_q.filter(Game.id.in_(valid_ids))

    rows = gp_q.all()
    if not rows:
        return {"player_id": player_id, "upset_wins": 0, "upset_losses": 0, "underdog_games": 0}

    # Group rows by game_id
    games_data: dict[int, dict] = defaultdict(lambda: {"A": [], "B": [], "score_a": 0, "score_b": 0})
    my_team: dict[int, str] = {}
    for row in rows:
        g = games_data[row.game_id]
        g[row.team].append(avg_map.get(row.player_id, 0.0))
        g["score_a"] = row.team_a_score
        g["score_b"] = row.team_b_score
        if row.player_id == player_id:
            my_team[row.game_id] = row.team

    upset_wins = upset_losses = 0
    for gid, g in games_data.items():
        team = my_team.get(gid)
        if team is None:
            continue
        exp_a = sum(g["A"]) / len(g["A"]) if g["A"] else 0.0
        exp_b = sum(g["B"]) / len(g["B"]) if g["B"] else 0.0
        expected_winner = "A" if exp_a >= exp_b else "B"
        if team == expected_winner:
            continue  # player was favoured — not an underdog game
        actual_winner = "A" if g["score_a"] > g["score_b"] else "B"
        if actual_winner == team:
            upset_wins += 1
        else:
            upset_losses += 1

    return {
        "player_id": player_id,
        "upset_wins": upset_wins,
        "upset_losses": upset_losses,
        "underdog_games": upset_wins + upset_losses,
    }
