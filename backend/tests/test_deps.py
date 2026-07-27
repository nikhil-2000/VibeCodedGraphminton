import pytest
from unittest.mock import MagicMock
from app.deps import get_filter_context
from app.models import UserPreferences, Player


def test_no_user_id_returns_no_filter():
    db = MagicMock()
    player_ids, season_id = get_filter_context(x_user_id=None, db=db)
    assert player_ids is None
    assert season_id is None
    db.query.assert_not_called()


def test_missing_prefs_returns_no_filter():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    player_ids, season_id = get_filter_context(x_user_id="user-abc", db=db)
    assert player_ids is None
    assert season_id is None


def test_everyone_preset_returns_none_player_ids():
    prefs = MagicMock(preset="everyone", custom_player_ids=[], season_id=None)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = prefs
    player_ids, season_id = get_filter_context(x_user_id="user-abc", db=db)
    assert player_ids is None
    assert season_id is None


def test_regulars_preset_queries_non_sub_players():
    prefs = MagicMock(preset="regulars", custom_player_ids=[], season_id=5)
    db = MagicMock()
    prefs_query = MagicMock()
    prefs_query.filter.return_value.first.return_value = prefs
    regular_players = [MagicMock(id=1), MagicMock(id=2), MagicMock(id=3)]
    regular_query = MagicMock()
    regular_query.filter.return_value.all.return_value = regular_players
    db.query.side_effect = [prefs_query, regular_query]

    player_ids, season_id = get_filter_context(x_user_id="user-abc", db=db)
    assert set(player_ids) == {1, 2, 3}
    assert season_id == 5


def test_custom_preset_returns_custom_ids():
    prefs = MagicMock(preset="custom", custom_player_ids=[7, 8, 9], season_id=2)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = prefs
    player_ids, season_id = get_filter_context(x_user_id="user-abc", db=db)
    assert player_ids == [7, 8, 9]
    assert season_id == 2
