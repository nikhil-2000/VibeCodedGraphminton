from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, case, select
from sqlalchemy.sql import Select
from ..models import Player, Game, GamePlayer


def _valid_game_ids(player_ids: list[int] | None, season_id: int | None = None) -> "Select[tuple[int]] | None":
    """Returns a Select subquery of game IDs filtered by player_ids and/or season_id.
    Returns None when no filters apply (all games counted)."""
    if not player_ids and season_id is None:
        return None
    base = select(Game.id)
    if season_id is not None:
        base = base.where(Game.season_id == season_id)
    if player_ids:
        excluded = select(GamePlayer.game_id).where(GamePlayer.player_id.notin_(player_ids))
        base = base.where(~Game.id.in_(excluded))
    return base


def get_player_stats(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    valid_ids = _valid_game_ids(player_ids, season_id)
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    q = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    result = q.one()

    games_played = result.games_played or 0
    wins = int(result.wins or 0)
    return {
        "player_id": player_id,
        "games_played": games_played,
        "wins": wins,
        "losses": games_played - wins,
        "win_rate": round(wins / games_played, 4) if games_played else 0.0,
        "avg_points": round(float(result.avg_points or 0), 2),
    }


def get_leaderboard(db: Session, sort_by: str = "win_rate", player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = _valid_game_ids(player_ids, season_id)
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )
    q = (
        db.query(
            Player.id,
            Player.canonical_name,
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(GamePlayer, Player.id == GamePlayer.player_id)
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(Player.id, Player.canonical_name)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    entries: list[dict[str, Any]] = []
    for row in rows:
        games = row.games_played or 0
        wins = int(row.wins or 0)
        entries.append({
            "player_id": row.id,
            "canonical_name": row.canonical_name,
            "games_played": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
            "avg_points": round(float(row.avg_points or 0), 2),
        })

    sort_key = "avg_points" if sort_by == "avg_points" else "win_rate"
    return sorted(entries, key=lambda e: e[sort_key], reverse=True)


def get_all_partnerships(db: Session, player_id: int | None = None, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = _valid_game_ids(player_ids, season_id)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    won_case = case(
        ((gp1.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp1.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (gp1.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    query = (
        db.query(
            gp1.player_id.label("player_a_id"),
            gp2.player_id.label("player_b_id"),
            func.count().label("games_together"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .join(Game, gp1.game_id == Game.id)
        .group_by(gp1.player_id, gp2.player_id)
    )

    if player_id is not None:
        query = query.filter((gp1.player_id == player_id) | (gp2.player_id == player_id))
    if valid_ids is not None:
        query = query.filter(Game.id.in_(valid_ids))

    rows = query.all()
    results: list[dict[str, Any]] = []
    for row in rows:
        games = row.games_together or 0
        wins = int(row.wins or 0)
        results.append({
            "player_a_id": row.player_a_id,
            "player_b_id": row.player_b_id,
            "games_together": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
            "avg_points": round(float(row.avg_points or 0), 2),
        })
    return results


def get_partnership_for_player(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    if not db.get(Player, player_id):
        raise KeyError(f"Player {player_id} not found")
    rows = get_all_partnerships(db, player_id, player_ids, season_id)
    result: list[dict[str, Any]] = []
    for r in rows:
        entry: dict[str, Any] = {
            "partner_id": r["player_b_id"] if r["player_a_id"] == player_id else r["player_a_id"],
        }
        entry.update({k: v for k, v in r.items() if k not in ("player_a_id", "player_b_id")})
        result.append(entry)
    return result


def get_specific_partnership(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    lo, hi = min(player_a_id, player_b_id), max(player_a_id, player_b_id)
    for r in get_all_partnerships(db, player_ids=player_ids, season_id=season_id):
        if r["player_a_id"] == lo and r["player_b_id"] == hi:
            return r
    return {"player_a_id": lo, "player_b_id": hi, "games_together": 0, "wins": 0, "losses": 0, "win_rate": 0.0}


def get_head_to_head(db: Session, player_a_id: int, player_b_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(player_ids, season_id)
    gp_a = aliased(GamePlayer)
    gp_b = aliased(GamePlayer)

    q = (
        db.query(Game, gp_a.team.label("team_a"))
        .join(gp_a, (gp_a.game_id == Game.id) & (gp_a.player_id == player_a_id))
        .join(gp_b, (gp_b.game_id == Game.id) & (gp_b.player_id == player_b_id) & (gp_b.team != gp_a.team))
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    a_wins = b_wins = 0
    for game, team_a in rows:
        if team_a == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
        "games_played": a_wins + b_wins,
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
    }


def get_head_to_head_all(db: Session, player_id: int, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_ids = _valid_game_ids(player_ids, season_id)
    gp_me = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)

    won_case = case(
        ((gp_me.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp_me.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (gp_me.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    q = (
        db.query(
            gp_opp.player_id.label("opponent_id"),
            func.count().label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(gp_opp, (gp_opp.game_id == gp_me.game_id) & (gp_opp.team != gp_me.team))
        .join(Game, gp_me.game_id == Game.id)
        .filter(gp_me.player_id == player_id)
        .group_by(gp_opp.player_id)
    )
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))

    results = []
    for row in q.all():
        games = row.games_played or 0
        wins = int(row.wins or 0)
        results.append({
            "opponent_id": row.opponent_id,
            "games_played": games,
            "wins": wins,
            "losses": games - wins,
            "avg_points": round(float(row.avg_points or 0), 2),
        })
    results.sort(key=lambda r: (r["wins"] / r["games_played"] if r["games_played"] else 0), reverse=True)
    return results


def get_matchup(db: Session, pair_a: tuple[int, int], pair_b: tuple[int, int], player_ids: list[int] | None = None, season_id: int | None = None) -> dict[str, Any]:
    valid_ids = _valid_game_ids(player_ids, season_id)
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
    if valid_ids is not None:
        q = q.filter(Game.id.in_(valid_ids))
    rows = q.all()

    a_wins = b_wins = 0
    for game, pair_a_team in rows:
        if pair_a_team == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "pair_a": list(pair_a),
        "pair_b": list(pair_b),
        "games_played": a_wins + b_wins,
        "pair_a_wins": a_wins,
        "pair_b_wins": b_wins,
    }


def get_matchup_quality(db: Session, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    from collections import defaultdict
    valid_ids = _valid_game_ids(player_ids, season_id)

    # Step 1: compute win rate + avg points per player across filtered games
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    pts_case = case((GamePlayer.team == "A", Game.team_a_score), else_=Game.team_b_score)
    wr_q = (
        db.query(
            GamePlayer.player_id,
            func.count(GamePlayer.id).label("gp"),
            func.sum(won_case).label("wins"),
            func.avg(pts_case).label("avg_pts"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(GamePlayer.player_id)
    )
    if valid_ids is not None:
        wr_q = wr_q.filter(Game.id.in_(valid_ids))
    win_rates: dict[int, float] = {}
    avg_points_map: dict[int, float] = {}
    for r in wr_q.all():
        gp = r.gp or 0
        win_rates[r.player_id] = round(int(r.wins or 0) / gp, 4) if gp else 0.0
        avg_points_map[r.player_id] = round(float(r.avg_pts or 0), 2)

    # Build percentile map: rank by avg_points, normalise to [0, 1]
    sorted_by_pts = sorted(avg_points_map.keys(), key=avg_points_map.__getitem__, reverse=True)
    n_players = len(sorted_by_pts)
    percentile: dict[int, float] = {
        pid: 1.0 - (i / (n_players - 1)) if n_players > 1 else 1.0
        for i, pid in enumerate(sorted_by_pts)
    }

    # Step 2: per (player, game) fetch partner + both opponents
    # Join: me → partner (same team, different player) + opp (other team)
    # Produces 2 rows per (player, game): one per opponent, partner is same both rows
    gp_me = aliased(GamePlayer)
    gp_partner = aliased(GamePlayer)
    gp_opp = aliased(GamePlayer)
    my_pts = case((gp_me.team == "A", Game.team_a_score), else_=Game.team_b_score)
    opp_pts = case((gp_me.team == "A", Game.team_b_score), else_=Game.team_a_score)

    detail_rows = (
        db.query(
            gp_me.player_id.label("player_id"),
            gp_me.game_id.label("game_id"),
            my_pts.label("my_pts"),
            opp_pts.label("opp_pts"),
            gp_partner.player_id.label("partner_id"),
            gp_opp.player_id.label("opp_id"),
        )
        .join(gp_partner, (gp_partner.game_id == gp_me.game_id) & (gp_partner.team == gp_me.team) & (gp_partner.player_id != gp_me.player_id))
        .join(gp_opp, (gp_opp.game_id == gp_me.game_id) & (gp_opp.team != gp_me.team))
        .join(Game, gp_me.game_id == Game.id)
    )
    if valid_ids is not None:
        detail_rows = detail_rows.filter(Game.id.in_(valid_ids))

    # Group by (player, game): collect partner_id (same each row) + opp_ids (2 different ones)
    player_games: dict[int, dict[int, dict]] = defaultdict(dict)
    for r in detail_rows.all():
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
    from itertools import combinations
    from ..services.anomalies import get_partnership_anomalies, get_head_to_head_anomalies

    valid_ids = _valid_game_ids(player_ids, season_id)

    pts_case = case((GamePlayer.team == "A", Game.team_a_score), else_=Game.team_b_score)
    wr_q = (
        db.query(GamePlayer.player_id, func.avg(pts_case).label("avg_pts"))
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(GamePlayer.player_id)
    )
    if valid_ids is not None:
        wr_q = wr_q.filter(Game.id.in_(valid_ids))

    avg_points_map: dict[int, float] = {r.player_id: float(r.avg_pts or 0) for r in wr_q.all()}
    sorted_by_pts = sorted(avg_points_map.keys(), key=avg_points_map.__getitem__, reverse=True)
    n_players = len(sorted_by_pts)
    percentile: dict[int, float] = {
        pid: 1.0 - (i / (n_players - 1)) if n_players > 1 else 1.0
        for i, pid in enumerate(sorted_by_pts)
    }

    partnership_anomalies = get_partnership_anomalies(db, overplayed=False, limit=None, player_ids=player_ids, season_id=season_id)
    h2h_anomalies = get_head_to_head_anomalies(db, overplayed=False, limit=None, player_ids=player_ids, season_id=season_id)
    overplayed_partnership_anomalies = get_partnership_anomalies(db, overplayed=True, limit=None, player_ids=player_ids, season_id=season_id)
    overplayed_h2h_anomalies = get_head_to_head_anomalies(db, overplayed=True, limit=None, player_ids=player_ids, season_id=season_id)

    def pair_key(a: int, b: int) -> tuple[int, int]:
        return (min(a, b), max(a, b))

    partner_debt: dict[tuple[int, int], float] = {
        pair_key(r["player_a_id"], r["player_b_id"]): abs(r["deviation"])
        for r in partnership_anomalies
    }
    h2h_debt: dict[tuple[int, int], float] = {
        pair_key(r["player_a_id"], r["player_b_id"]): abs(r["deviation"])
        for r in h2h_anomalies
    }
    partner_overplay: dict[tuple[int, int], float] = {
        pair_key(r["player_a_id"], r["player_b_id"]): abs(r["deviation"])
        for r in overplayed_partnership_anomalies
    }
    h2h_overplay: dict[tuple[int, int], float] = {
        pair_key(r["player_a_id"], r["player_b_id"]): abs(r["deviation"])
        for r in overplayed_h2h_anomalies
    }

    mq = get_matchup_quality(db, player_ids, season_id)
    pattern_map: dict[int, dict] = {r["player_id"]: r for r in mq}

    FAIRNESS_WEIGHT = 2.0
    FAIRNESS_THRESHOLD = 0.05

    active_players = sorted(avg_points_map.keys())
    player_names: dict[int, str] = {
        p.id: p.canonical_name
        for p in db.query(Player).filter(Player.id.in_(active_players)).all()
    }

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

            underplay_debt = (
                partner_debt.get(pair_key(a1, a2), 0.0)
                + partner_debt.get(pair_key(b1, b2), 0.0)
                + h2h_debt.get(pair_key(a1, b1), 0.0)
                + h2h_debt.get(pair_key(a1, b2), 0.0)
                + h2h_debt.get(pair_key(a2, b1), 0.0)
                + h2h_debt.get(pair_key(a2, b2), 0.0)
            )
            overplay_penalty = (
                partner_overplay.get(pair_key(a1, a2), 0.0)
                + partner_overplay.get(pair_key(b1, b2), 0.0)
                + h2h_overplay.get(pair_key(a1, b1), 0.0)
                + h2h_overplay.get(pair_key(a1, b2), 0.0)
                + h2h_overplay.get(pair_key(a2, b1), 0.0)
                + h2h_overplay.get(pair_key(a2, b2), 0.0)
            )

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
            if total_score == 0:
                continue

            fixes: list[str] = []
            for x, y in [(a1, a2), (b1, b2)]:
                if pair_key(x, y) in partner_debt:
                    fixes.append(f"{player_names.get(x, str(x))} & {player_names.get(y, str(y))} (partnership)")
            for x, y in [(a1, b1), (a1, b2), (a2, b1), (a2, b2)]:
                if pair_key(x, y) in h2h_debt:
                    fixes.append(f"{player_names.get(x, str(x))} vs {player_names.get(y, str(y))} (h2h)")

            scored.append({
                "team_a": [player_names.get(a1, str(a1)), player_names.get(a2, str(a2))],
                "team_b": [player_names.get(b1, str(b1)), player_names.get(b2, str(b2))],
                "score": round(total_score, 4),
                "fixes": fixes,
                "_partnerships": {pair_key(a1, a2), pair_key(b1, b2)},
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
