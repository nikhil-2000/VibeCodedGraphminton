def test_models_import():
    from app.models import Player, PlayerAlias, Game, GamePlayer
    assert Player.__tablename__ == "players"
    assert PlayerAlias.__tablename__ == "player_aliases"
    assert Game.__tablename__ == "games"
    assert GamePlayer.__tablename__ == "game_players"


def test_create_player(client):
    response = client.post("/players", json={
        "canonical_name": "Nikhil P",
        "is_sub": False,
        "aliases": ["Nik", "Nikhil", "Niks"],
    })
    assert response.status_code == 201
    data = response.json()
    assert data["canonical_name"] == "Nikhil P"
    assert data["is_sub"] is False
    alias_values = [a["alias"] for a in data["aliases"]]
    assert "Nikhil P" in alias_values  # canonical auto-added
    assert "Nik" in alias_values


def test_create_player_duplicate_alias_rejected(client):
    client.post("/players", json={"canonical_name": "Player A", "is_sub": False, "aliases": ["Ace"]})
    response = client.post("/players", json={"canonical_name": "Player B", "is_sub": False, "aliases": ["Ace"]})
    assert response.status_code == 400
    assert "alias" in response.json()["detail"].lower()


def test_create_sub_player(client):
    response = client.post("/players", json={
        "canonical_name": "Dave",
        "is_sub": True,
        "aliases": ["Dave", "David K"],
    })
    assert response.status_code == 201
    assert response.json()["is_sub"] is True


def test_create_player_duplicate_canonical_name_rejected(client):
    client.post("/players", json={"canonical_name": "Alice", "is_sub": False, "aliases": []})
    response = client.post("/players", json={"canonical_name": "Alice", "is_sub": False, "aliases": []})
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]
