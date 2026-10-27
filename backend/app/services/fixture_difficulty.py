"""How easy or hard each player's games were, judged purely against a hand-made ranking.

Nothing here reads a score. The caller supplies an ordered list of player IDs
(best first) and every game is classified from each player's perspective by
comparing the summed ranks of the two teams.
"""
from collections import defaultdict
from itertools import combinations
from typing import Any, Literal
from sqlalchemy.orm import Session
from ..models import GamePlayer
from ._common import valid_game_ids

Outcome = Literal["favourable", "even", "underdog"]
OUTCOMES: tuple[Outcome, ...] = ("favourable", "even", "underdog")


def classify_game(own_sum: int, opp_sum: int, threshold: int) -> Outcome:
    """Classify a game for one side from the summed ranks of both teams.

    A lower rank sum is the stronger team, so the side is favourable when its
    opponents' sum exceeds its own by more than `threshold`.
    """
    diff = opp_sum - own_sum
    if diff > threshold:
        return "favourable"
    if diff < -threshold:
        return "underdog"
    return "even"


def _empty_counts() -> dict[Outcome, int]:
    return {"favourable": 0, "even": 0, "underdog": 0}


def _tally_game(counts: dict[int, dict[Outcome, int]], team_a: tuple[int, int], team_b: tuple[int, int], threshold: int) -> None:
    """Add one game's outcome to the counts of all four ranks involved."""
    sum_a, sum_b = sum(team_a), sum(team_b)
    for team, own, opp in ((team_a, sum_a, sum_b), (team_b, sum_b, sum_a)):
        outcome = classify_game(own, opp, threshold)
        for rank in team:
            counts[rank][outcome] += 1


def _summarise(counts: dict[Outcome, int]) -> dict[str, Any]:
    games = sum(counts.values())
    return {
        "games_played": games,
        **counts,
        "net_difficulty": round((counts["favourable"] - counts["underdog"]) / games, 4) if games else None,
        "favourable_pct": round(counts["favourable"] / games, 4) if games else None,
    }


def expected_by_rank(n: int, threshold: int) -> dict[int, dict[str, Any]]:
    """What a perfectly random draw gives each rank, by exact enumeration.

    Every 2v2 split of every 4-subset of ranks 1..n is classified, so the result
    is the baseline a player at that rank would see if every game were equally
    likely. Fewer than four players means no games and all-None ratios.
    """
    counts: dict[int, dict[Outcome, int]] = {rank: _empty_counts() for rank in range(1, n + 1)}
    for a, b, c, d in combinations(range(1, n + 1), 4):
        for team_a, team_b in (((a, b), (c, d)), ((a, c), (b, d)), ((a, d), (b, c))):
            _tally_game(counts, team_a, team_b, threshold)
    return {rank: _summarise(c) for rank, c in counts.items()}


def get_fixture_difficulty(
    db: Session,
    ranking: list[int],
    even_threshold: int = 1,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    rank_of = {pid: i + 1 for i, pid in enumerate(ranking)}
    valid_ids = valid_game_ids(player_ids, season_id)

    q = db.query(GamePlayer.game_id, GamePlayer.player_id, GamePlayer.team)
    if valid_ids is not None:
        q = q.filter(GamePlayer.game_id.in_(valid_ids))

    games: dict[int, dict[str, list[int]]] = defaultdict(lambda: {"A": [], "B": []})
    unranked_games: set[int] = set()
    for row in q.all():
        if row.player_id in rank_of:
            games[row.game_id][row.team].append(rank_of[row.player_id])
        else:
            unranked_games.add(row.game_id)

    counts: dict[int, dict[Outcome, int]] = {rank: _empty_counts() for rank in range(1, len(ranking) + 1)}
    for game_id, teams in games.items():
        if game_id in unranked_games or len(teams["A"]) != 2 or len(teams["B"]) != 2:
            continue
        _tally_game(counts, (teams["A"][0], teams["A"][1]), (teams["B"][0], teams["B"][1]), even_threshold)

    expected = expected_by_rank(len(ranking), even_threshold)
    entries = []
    for pid in ranking:
        rank = rank_of[pid]
        actual = _summarise(counts[rank])
        exp = expected[rank]
        net, exp_net = actual["net_difficulty"], exp["net_difficulty"]
        entries.append({
            "player_id": pid,
            "rank": rank,
            **actual,
            "expected_net": exp_net,
            "expected_favourable_pct": exp["favourable_pct"],
            "vs_expected": round(net - exp_net, 4) if net is not None and exp_net is not None else None,
        })

    # Players with no games sink to the bottom; the sort is stable so rank order holds within each group.
    return sorted(entries, key=lambda e: e["games_played"] == 0)
