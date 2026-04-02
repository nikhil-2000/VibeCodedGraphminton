from fastapi.testclient import TestClient


def _setup_players(client: TestClient):
    players = [
        {"canonical_name": "Bhavin", "is_sub": False, "aliases": []},
        {"canonical_name": "Chetan", "is_sub": False, "aliases": ["Chets", "Chet"]},
        {"canonical_name": "Chan", "is_sub": False, "aliases": []},
        {"canonical_name": "Jayesh", "is_sub": False, "aliases": ["Jay"]},
    ]
    for p in players:
        client.post("/players", json=p)


def test_ingest_scores_valid_file(client: TestClient):
    _setup_players(client)
    response = client.post("/ingest/scores", json={"files": [
        {
            "filename": "Week99.csv",
            "content": (
                "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
                "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
                "08-04-2024,2,Bhavin,Chan,16,Chets,Jayesh,21\n"
            ),
        }
    ]})
    assert response.status_code == 200
    data = response.json()
    assert data["games_loaded"] == 2
    assert data["errors"] == []


def test_ingest_scores_unknown_player_rejects_whole_file(client: TestClient):
    _setup_players(client)
    response = client.post("/ingest/scores", json={"files": [
        {
            "filename": "Week98.csv",
            "content": (
                "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
                "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
                "08-04-2024,2,Bhavin,UNKNOWN_PLAYER,16,Chets,Jayesh,21\n"
            ),
        }
    ]})
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("UNKNOWN_PLAYER" in e for e in errors)


def test_ingest_scores_invalid_score_rejects_whole_file(client: TestClient):
    _setup_players(client)
    response = client.post("/ingest/scores", json={"files": [
        {
            "filename": "Week97.csv",
            "content": (
                "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
                "08-04-2024,1,Bhavin,Chets,15,Chan,Jayesh,9\n"  # 15 < 21
            ),
        }
    ]})
    assert response.status_code == 422


def test_ingest_scores_idempotent(client: TestClient):
    _setup_players(client)
    payload = {"files": [
        {
            "filename": "Week96.csv",
            "content": (
                "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
                "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
            ),
        }
    ]}
    client.post("/ingest/scores", json=payload)
    response = client.post("/ingest/scores", json=payload)
    assert response.status_code == 200
    assert response.json()["games_loaded"] == 0  # already exists, skipped
