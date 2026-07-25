import pytest
from fastapi.testclient import TestClient


USER_ID = "test-uuid-1234-5678-abcd-ef0123456789"


def make_player(client: TestClient) -> int:
    r = client.post("/players", json={"canonical_name": "Test Player"})
    assert r.status_code == 201
    return r.json()["id"]


def test_get_preferences_not_found(client: TestClient):
    r = client.get("/preferences", headers={"X-User-ID": USER_ID})
    assert r.status_code == 404


def test_create_preferences(client: TestClient):
    player_id = make_player(client)
    r = client.post(
        "/preferences",
        json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
        headers={"X-User-ID": USER_ID},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["id"] == USER_ID
    assert data["player_id"] == player_id
    assert data["preset"] == "regulars"
    assert data["custom_player_ids"] == []
    assert data["season_id"] is None


def test_get_preferences_after_create(client: TestClient):
    player_id = make_player(client)
    client.post(
        "/preferences",
        json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
        headers={"X-User-ID": USER_ID},
    )
    r = client.get("/preferences", headers={"X-User-ID": USER_ID})
    assert r.status_code == 200
    assert r.json()["player_id"] == player_id


def test_patch_preferences(client: TestClient):
    player_id = make_player(client)
    client.post(
        "/preferences",
        json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
        headers={"X-User-ID": USER_ID},
    )
    r = client.patch(
        "/preferences",
        json={"preset": "everyone"},
        headers={"X-User-ID": USER_ID},
    )
    assert r.status_code == 200
    assert r.json()["preset"] == "everyone"


def test_patch_preferences_not_found(client: TestClient):
    r = client.patch(
        "/preferences",
        json={"preset": "everyone"},
        headers={"X-User-ID": USER_ID},
    )
    assert r.status_code == 404


def test_create_preferences_missing_header(client: TestClient):
    player_id = make_player(client)
    r = client.post(
        "/preferences",
        json={"player_id": player_id, "preset": "regulars", "custom_player_ids": []},
    )
    assert r.status_code == 422
