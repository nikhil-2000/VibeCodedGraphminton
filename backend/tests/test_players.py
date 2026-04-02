def test_models_import():
    from app.models import Player, PlayerAlias, Game, GamePlayer
    assert Player.__tablename__ == "players"
    assert PlayerAlias.__tablename__ == "player_aliases"
    assert Game.__tablename__ == "games"
    assert GamePlayer.__tablename__ == "game_players"
