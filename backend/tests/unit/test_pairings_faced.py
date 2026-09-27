"""Unit tests for pair-key normalisation shared across the stats services."""
from app.services._common import normalize_pair


def test_normalize_pair_lower_first():
    assert normalize_pair(5, 3) == (3, 5)


def test_normalize_pair_already_sorted():
    assert normalize_pair(2, 7) == (2, 7)


def test_normalize_pair_equal():
    assert normalize_pair(4, 4) == (4, 4)
