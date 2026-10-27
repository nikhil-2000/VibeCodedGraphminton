from math import comb
import pytest
from app.services.fixture_difficulty import classify_game, expected_by_rank


@pytest.mark.parametrize("own,opp,expected", [
    (3, 11, "favourable"),
    (5, 5, "even"),
    (5, 6, "even"),      # diff of exactly the threshold is still even
    (5, 7, "favourable"),
    (6, 5, "even"),
    (7, 5, "underdog"),
    (11, 3, "underdog"),
])
def test_classify_game_default_threshold(own, opp, expected):
    assert classify_game(own, opp, threshold=1) == expected


def test_classify_game_respects_threshold():
    assert classify_game(5, 7, threshold=2) == "even"
    assert classify_game(5, 8, threshold=2) == "favourable"
    assert classify_game(5, 7, threshold=0) == "favourable"


def test_expected_by_rank_counts_every_game_a_rank_appears_in():
    n = 8
    expected = expected_by_rank(n, threshold=1)
    # a rank sits in C(n-1, 3) four-player subsets, each with 3 possible splits
    games_per_rank = comb(n - 1, 3) * 3
    for summary in expected.values():
        assert summary["games_played"] == games_per_rank
        assert summary["favourable"] + summary["even"] + summary["underdog"] == games_per_rank


def test_expected_by_rank_is_mirrored_between_best_and_worst():
    n = 10
    expected = expected_by_rank(n, threshold=1)
    for rank in range(1, n + 1):
        mirror = expected[n + 1 - rank]
        assert expected[rank]["net_difficulty"] == pytest.approx(-mirror["net_difficulty"], abs=1e-4)
        assert expected[rank]["favourable_pct"] == pytest.approx(mirror["underdog"] / mirror["games_played"], abs=1e-4)


def test_expected_by_rank_best_player_is_favoured_and_worst_is_not():
    expected = expected_by_rank(12, threshold=1)
    assert expected[1]["favourable_pct"] == pytest.approx(0.77, abs=0.01)
    assert expected[12]["favourable_pct"] == pytest.approx(0.10, abs=0.01)
    assert expected[1]["net_difficulty"] > 0 > expected[12]["net_difficulty"]


def test_expected_by_rank_with_too_few_players_has_no_ratios():
    expected = expected_by_rank(3, threshold=1)
    assert all(s["games_played"] == 0 and s["net_difficulty"] is None for s in expected.values())
