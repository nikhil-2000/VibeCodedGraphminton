from fastapi.testclient import TestClient


def test_create_player(client: TestClient):
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


def test_create_player_duplicate_alias_rejected(client: TestClient):
    client.post("/players", json={"canonical_name": "Player A", "is_sub": False, "aliases": ["Ace"]})
    response = client.post("/players", json={"canonical_name": "Player B", "is_sub": False, "aliases": ["Ace"]})
    assert response.status_code == 400
    assert "alias" in response.json()["detail"].lower()


def test_create_sub_player(client: TestClient):
    response = client.post("/players", json={
        "canonical_name": "Dave",
        "is_sub": True,
        "aliases": ["Dave", "David K"],
    })
    assert response.status_code == 201
    assert response.json()["is_sub"] is True


def test_create_player_duplicate_canonical_name_rejected(client: TestClient):
    client.post("/players", json={"canonical_name": "Alice", "is_sub": False, "aliases": []})
    response = client.post("/players", json={"canonical_name": "Alice", "is_sub": False, "aliases": []})
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_list_players(client: TestClient):
    client.post("/players", json={"canonical_name": "Bhavin", "is_sub": False, "aliases": []})
    client.post("/players", json={"canonical_name": "Chan", "is_sub": True, "aliases": []})
    response = client.get("/players")
    assert response.status_code == 200
    names = [p["canonical_name"] for p in response.json()]
    assert "Bhavin" in names
    assert "Chan" in names


def test_list_players_filter_by_is_sub(client: TestClient):
    client.post("/players", json={"canonical_name": "Regular", "is_sub": False, "aliases": []})
    client.post("/players", json={"canonical_name": "Sub", "is_sub": True, "aliases": []})
    response = client.get("/players?is_sub=true")
    assert response.status_code == 200
    assert all(p["is_sub"] for p in response.json())


def test_get_player_by_id(client: TestClient):
    created = client.post("/players", json={"canonical_name": "Jayesh", "is_sub": False, "aliases": ["Jay"]}).json()
    response = client.get(f"/players/{created['id']}")
    assert response.status_code == 200
    assert response.json()["canonical_name"] == "Jayesh"


def test_get_player_not_found(client: TestClient):
    response = client.get("/players/99999")
    assert response.status_code == 404


def test_patch_player_promote_sub(client: TestClient):
    created = client.post("/players", json={"canonical_name": "TempSub", "is_sub": True, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"is_sub": False})
    assert response.status_code == 200
    assert response.json()["is_sub"] is False


def test_patch_player_add_aliases(client: TestClient):
    created = client.post("/players", json={"canonical_name": "Rajesh", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"add_aliases": ["Raj", "RJ"]})
    assert response.status_code == 200
    aliases = [a["alias"] for a in response.json()["aliases"]]
    assert "Raj" in aliases
    assert "RJ" in aliases


def test_patch_player_remove_aliases(client: TestClient):
    created = client.post("/players", json={"canonical_name": "Nalin", "is_sub": False, "aliases": ["Nal"]}).json()
    response = client.patch(f"/players/{created['id']}", json={"remove_aliases": ["Nal"]})
    assert response.status_code == 200
    aliases = [a["alias"] for a in response.json()["aliases"]]
    assert "Nal" not in aliases


def test_patch_cannot_remove_canonical_alias(client: TestClient):
    created = client.post("/players", json={"canonical_name": "CM", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"remove_aliases": ["CM"]})
    assert response.status_code == 400


def test_patch_cannot_change_canonical_name(client: TestClient):
    created = client.post("/players", json={"canonical_name": "Original", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"canonical_name": "Changed"})
    # canonical_name is not a recognised field — should be ignored, name stays the same
    assert response.status_code == 200
    assert response.json()["canonical_name"] == "Original"


def test_delete_player_no_games(client: TestClient):
    created = client.post("/players", json={"canonical_name": "ToDelete", "is_sub": False, "aliases": []}).json()
    response = client.delete(f"/players/{created['id']}")
    assert response.status_code == 204
    # confirm gone
    assert client.get(f"/players/{created['id']}").status_code == 404


def test_delete_player_not_found(client: TestClient):
    response = client.delete("/players/99999")
    assert response.status_code == 404


def test_delete_player_with_games_rejected(client: TestClient):
    # Create two players and ingest a game that references them
    p1 = client.post("/players", json={"canonical_name": "Del A", "is_sub": False, "aliases": ["DelA"]}).json()
    p2 = client.post("/players", json={"canonical_name": "Del B", "is_sub": False, "aliases": ["DelB"]}).json()
    p3 = client.post("/players", json={"canonical_name": "Del C", "is_sub": False, "aliases": ["DelC"]}).json()
    p4 = client.post("/players", json={"canonical_name": "Del D", "is_sub": False, "aliases": ["DelD"]}).json()
    csv = "01-01-2025,1,DelA,DelB,21,DelC,DelD,9\n"
    ingest_resp = client.post("/ingest/scores", json={"files": [csv]})
    assert ingest_resp.status_code == 200, ingest_resp.json()
    response = client.delete(f"/players/{p1['id']}")
    assert response.status_code == 409
    assert "games" in response.json()["detail"].lower()
