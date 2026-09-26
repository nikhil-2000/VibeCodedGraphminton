"""Unit tests for the shared stats primitives."""
from app.services._common import normalize_pair, win_record, winner_from_perspective


class _FakeGame:
    def __init__(self, a: int, b: int):
        self.team_a_score = a
        self.team_b_score = b


def test_win_record_computes_losses_and_rate():
    record = win_record(10, 7)
    assert record == {"games_played": 10, "wins": 7, "losses": 3, "win_rate": 0.7}


def test_win_record_omits_avg_points_when_not_supplied():
    assert "avg_points" not in win_record(4, 2)


def test_win_record_includes_avg_points_when_supplied():
    assert win_record(4, 2, 18.456)["avg_points"] == 18.46


def test_win_record_handles_no_games_without_dividing_by_zero():
    record = win_record(0, 0)
    assert record["win_rate"] == 0.0
    assert record["losses"] == 0


def test_win_record_treats_null_aggregates_as_zero():
    """SQL SUM/COUNT over no rows come back as None."""
    assert win_record(None, None) == {"games_played": 0, "wins": 0, "losses": 0, "win_rate": 0.0}


def test_win_record_rounds_rate_to_four_places():
    assert win_record(3, 1)["win_rate"] == 0.3333


def test_winner_from_perspective_team_a():
    assert winner_from_perspective(_FakeGame(21, 9), "A") is True
    assert winner_from_perspective(_FakeGame(9, 21), "A") is False


def test_winner_from_perspective_team_b():
    assert winner_from_perspective(_FakeGame(9, 21), "B") is True
    assert winner_from_perspective(_FakeGame(21, 9), "B") is False


def test_normalize_pair_is_order_independent():
    assert normalize_pair(9, 2) == normalize_pair(2, 9)
