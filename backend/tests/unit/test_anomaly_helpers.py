"""Unit tests for the anomaly expectation model shared by partnerships and head-to-head."""
import pytest
from app.services.anomalies import (
    MIN_ABSOLUTE_DEVIATION,
    P_OPPONENT,
    P_PARTNER,
    _expected_frequency,
    _get_all_player_pairs,
    _is_significant,
)


def test_expected_frequency_zero_total_games():
    assert _expected_frequency(0, 0, 0, P_PARTNER) == 0.0


def test_expected_frequency_partner_vs_opponent_probability():
    """In a foursome you partner a given player once per three splits, oppose twice."""
    partner = _expected_frequency(10, 10, 10, P_PARTNER)
    opponent = _expected_frequency(10, 10, 10, P_OPPONENT)
    assert opponent == pytest.approx(partner * 2)


def test_expected_frequency_scales_with_shared_participation():
    """Two players in every game should be expected to pair more than occasional players."""
    always = _expected_frequency(20, 20, 20, P_PARTNER)
    sometimes = _expected_frequency(5, 5, 20, P_PARTNER)
    assert always > sometimes


def test_all_player_pairs_is_each_unordered_pair_once():
    pairs = _get_all_player_pairs({3: 1, 1: 1, 2: 1})
    assert pairs == [(1, 2), (1, 3), (2, 3)]


def test_all_player_pairs_single_player_has_no_pairs():
    assert _get_all_player_pairs({7: 4}) == []


@pytest.mark.parametrize("deviation,overplayed", [(5.0, False), (-5.0, True)])
def test_significance_requires_deviation_in_the_queried_direction(deviation, overplayed):
    assert _is_significant(deviation, actual=10, overplayed=overplayed) is False


def test_significance_rejects_deviation_below_absolute_floor():
    small = MIN_ABSOLUTE_DEVIATION / 2
    assert _is_significant(small, actual=10, overplayed=True) is False


def test_significance_rejects_deviation_small_relative_to_games_played():
    """A 2-game gap matters far less for a pair with 100 games than one with 4."""
    assert _is_significant(2.5, actual=100, overplayed=True) is False
    assert _is_significant(2.5, actual=4, overplayed=True) is True


def test_significance_accepts_large_underplay():
    assert _is_significant(-6.0, actual=2, overplayed=False) is True
