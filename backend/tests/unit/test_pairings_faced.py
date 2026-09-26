"""Unit tests for get_pairings_faced logic (pair-key normalisation)."""
from app.services.stats import _normalize_pair


def test_normalize_pair_lower_first():
    assert _normalize_pair(5, 3) == (3, 5)


def test_normalize_pair_already_sorted():
    assert _normalize_pair(2, 7) == (2, 7)


def test_normalize_pair_equal():
    assert _normalize_pair(4, 4) == (4, 4)
