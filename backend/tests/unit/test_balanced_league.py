from itertools import combinations
from app.services.balanced_league import build_league, matchup_key, required_matchups, splits


def _all_matchups(players: list[int]) -> dict:
    """One game (id = running counter) for every matchup of every 4-subset."""
    available, gid = {}, 0
    for four in combinations(players, 4):
        for m in splits(four):
            gid += 1
            available[m] = [gid]
    return available


def test_matchup_key_ignores_team_and_player_order():
    assert matchup_key((2, 1), (4, 3)) == matchup_key((3, 4), (1, 2))


def test_four_players_have_three_matchups_and_five_have_fifteen():
    assert len(set(splits((1, 2, 3, 4)))) == 3
    assert len(required_matchups([1, 2, 3, 4], 5)) == 12  # C(4,3) 4-subsets x 3 splits


def test_full_coverage_takes_every_player():
    players = [1, 2, 3, 4, 5, 6]
    steps = build_league(_all_matchups(players), {p: 10 for p in players})
    assert [len(s["player_ids"]) for s in steps] == [4, 1, 1]
    assert all(s["coverage"] == 1.0 for s in steps)
    assert sum(len(s["game_ids"]) for s in steps) == 45  # 3 * C(6,4)


def test_stops_when_a_matchup_is_missing_under_strict_coverage():
    players = [1, 2, 3, 4, 5]
    available = _all_matchups(players)
    del available[splits((1, 2, 3, 5))[0]]
    steps = build_league(available, {p: 10 for p in players})
    assert len(steps) == 1


def test_relaxed_coverage_admits_the_player_with_a_gap():
    players = [1, 2, 3, 4, 5]
    available = _all_matchups(players)
    del available[splits((1, 2, 3, 5))[0]]
    steps = build_league(available, {p: 10 for p in players}, min_coverage=0.9)
    assert len(steps) == 2
    assert (steps[1]["covered"], steps[1]["required"]) == (11, 12)


def test_seed_prefers_the_most_active_players():
    players = [1, 2, 3, 4, 5, 6]
    played = {1: 50, 2: 40, 3: 30, 4: 20, 5: 5, 6: 1}
    steps = build_league(_all_matchups(players), played, max_players=4)
    assert sorted(steps[0]["player_ids"]) == [1, 2, 3, 4]


def test_picks_oldest_game_per_matchup_and_never_duplicates():
    m = splits((1, 2, 3, 4))
    available = {m[0]: [7, 9], m[1]: [8], m[2]: [10]}
    steps = build_league(available, {1: 1, 2: 1, 3: 1, 4: 1})
    assert steps[0]["game_ids"] == [7, 8, 10]


def test_no_four_players_with_games_returns_no_steps():
    assert build_league({}, {1: 1, 2: 1}) == []
