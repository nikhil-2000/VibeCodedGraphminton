"""Pick a subset of real games that covers every matchup for as many players as possible.

A *matchup* is one 2v2 split of four players: {a,b} vs {c,d}. Four players have
exactly 3 of them, and playing all 3 means every pair partners once and every
pair is opposed. Adding a fifth player needs every split of every 4-subset that
includes them, and so on, so a fully balanced league over n players is 3*C(n,4)
games. Real data runs out of complete coverage quickly, hence `min_coverage`:
a player may join with only that fraction of their new matchups played.
"""
from collections import defaultdict
from itertools import combinations
from typing import Any
from sqlalchemy.orm import Session
from ..models import Game, GamePlayer
from ._common import normalize_pair, valid_game_ids
from .games import get_games

Pair = tuple[int, int]
Matchup = tuple[Pair, Pair]

# Seeding tries every 4-subset of this many most-active players (C(12,4) = 495).
SEED_POOL = 12


def matchup_key(team_a: tuple[int, int], team_b: tuple[int, int]) -> Matchup:
    """Canonical key so the same four players split the same way always match."""
    a, b = normalize_pair(*team_a), normalize_pair(*team_b)
    return (a, b) if a <= b else (b, a)


def splits(four: tuple[int, int, int, int]) -> list[Matchup]:
    """The 3 distinct 2v2 matchups of four players."""
    a, b, c, d = four
    return [matchup_key((a, b), (c, d)), matchup_key((a, c), (b, d)), matchup_key((a, d), (b, c))]


def required_matchups(existing: list[int], new: int) -> list[Matchup]:
    """Every matchup that involves `new` plus three already-selected players."""
    return [m for trio in combinations(sorted(existing), 3) for m in splits((*trio, new))]


def _coverage(required: list[Matchup], available: dict[Matchup, list[int]]) -> tuple[list[Matchup], float]:
    covered = [m for m in required if m in available]
    return covered, len(covered) / len(required) if required else 0.0


def build_league(
    available: dict[Matchup, list[int]],
    games_played: dict[int, int],
    min_coverage: float = 1.0,
    max_players: int | None = None,
) -> list[dict[str, Any]]:
    """Grow the player set greedily, returning one step per addition (the first adds four players).

    `available` maps each matchup to the game IDs that played it, oldest first;
    only the first of each is selected. A candidate joins when it covers at least
    `min_coverage` of its new matchups; the best-covered candidate goes first, with
    ties broken by games played. Steps never revisit earlier picks.
    """
    pool = sorted(games_played, key=lambda p: (-games_played[p], p))
    seed = _best_seed(pool[:SEED_POOL], available, games_played, min_coverage)
    if seed is None:
        return []
    players, covered, required, coverage = seed
    steps = [_step(players, covered, required, coverage, available)]
    selected = list(players)

    while max_players is None or len(selected) < max_players:
        best = None
        for cand in pool:
            if cand in selected:
                continue
            req = required_matchups(selected, cand)
            cov, ratio = _coverage(req, available)
            if ratio < min_coverage or not cov:
                continue
            if best is None or (ratio, games_played[cand]) > (best[3], games_played[best[0][0]]):
                best = ([cand], cov, req, ratio)
        if best is None:
            break
        selected.extend(best[0])
        steps.append(_step(*best, available))
    return steps


def _best_seed(pool: list[int], available: dict[Matchup, list[int]], games_played: dict[int, int], min_coverage: float):
    best = None
    for four in combinations(sorted(pool), 4):
        req = splits(four)
        cov, ratio = _coverage(req, available)
        if ratio < min_coverage or not cov:
            continue
        key = (ratio, sum(games_played[p] for p in four))
        if best is None or key > best[0]:
            best = (key, list(four), cov, req, ratio)
    return None if best is None else best[1:]


def _step(players: list[int], covered: list[Matchup], required: list[Matchup], coverage: float, available: dict[Matchup, list[int]]) -> dict[str, Any]:
    return {
        "player_ids": players,
        "game_ids": [available[m][0] for m in covered],
        "covered": len(covered),
        "required": len(required),
        "coverage": round(coverage, 4),
    }


def _load_matchups(db: Session, player_ids: list[int] | None, season_id: int | None) -> tuple[dict[Matchup, list[int]], dict[int, int]]:
    valid_ids = valid_game_ids(player_ids, season_id)
    q = (
        db.query(GamePlayer.game_id, GamePlayer.player_id, GamePlayer.team)
        .join(Game, Game.id == GamePlayer.game_id)
        .order_by(Game.played_on, Game.game_number, Game.id)
    )
    if valid_ids is not None:
        q = q.filter(GamePlayer.game_id.in_(valid_ids))

    # Dicts keep insertion order, so games come out oldest first.
    teams: dict[int, dict[str, list[int]]] = defaultdict(lambda: {"A": [], "B": []})
    for row in q.all():
        teams[row.game_id][row.team].append(row.player_id)

    available: dict[Matchup, list[int]] = defaultdict(list)
    games_played: dict[int, int] = defaultdict(int)
    for game_id, sides in teams.items():
        if len(sides["A"]) != 2 or len(sides["B"]) != 2:
            continue
        available[matchup_key((sides["A"][0], sides["A"][1]), (sides["B"][0], sides["B"][1]))].append(game_id)
        for pid in sides["A"] + sides["B"]:
            games_played[pid] += 1
    return available, games_played


def get_balanced_league(
    db: Session,
    min_coverage: float = 1.0,
    max_players: int | None = None,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> dict[str, Any]:
    available, games_played = _load_matchups(db, player_ids, season_id)
    steps = build_league(available, games_played, min_coverage, max_players)

    selected_ids = [gid for s in steps for gid in s["game_ids"]]
    by_id = {g["id"]: g for g in get_games(db, player_ids=player_ids, season_id=season_id)}
    return {
        "min_coverage": min_coverage,
        "player_ids": [p for s in steps for p in s["player_ids"]],
        "steps": steps,
        "games": [by_id[gid] for gid in selected_ids if gid in by_id],
    }
