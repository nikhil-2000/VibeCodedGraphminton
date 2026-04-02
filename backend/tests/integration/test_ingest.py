import os
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient


def _create_week_csv(content: str, week: int, data_dir: str) -> str:
    path = os.path.join(data_dir, f"Week{week:02d}.csv")
    with open(path, "w") as f:
        f.write(content)
    return path


def _setup_players(client: TestClient):
    players = [
        {"canonical_name": "Bhavin", "is_sub": False, "aliases": []},
        {"canonical_name": "Chetan", "is_sub": False, "aliases": ["Chets", "Chet"]},
        {"canonical_name": "Chan", "is_sub": False, "aliases": []},
        {"canonical_name": "Jayesh", "is_sub": False, "aliases": ["Jay"]},
    ]
    for p in players:
        client.post("/players", json=p)


def test_ingest_scores_valid_file(client: TestClient, monkeypatch, tmp_path):
    _setup_players(client)
    _create_week_csv(
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
        "08-04-2024,2,Bhavin,Chan,16,Chets,Jayesh,21\n",
        week=99, data_dir=str(tmp_path),
    )
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    response = client.post("/ingest/scores", json={"filenames": ["Week99.csv"]})
    assert response.status_code == 200
    data = response.json()
    assert data["games_loaded"] == 2
    assert data["errors"] == []


def test_ingest_scores_unknown_player_rejects_whole_file(client: TestClient, monkeypatch, tmp_path):
    _setup_players(client)
    _create_week_csv(
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
        "08-04-2024,2,Bhavin,UNKNOWN_PLAYER,16,Chets,Jayesh,21\n",
        week=98, data_dir=str(tmp_path),
    )
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    response = client.post("/ingest/scores", json={"filenames": ["Week98.csv"]})
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("UNKNOWN_PLAYER" in e for e in errors)


def test_ingest_scores_invalid_score_rejects_whole_file(client: TestClient, monkeypatch, tmp_path):
    _setup_players(client)
    _create_week_csv(
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,15,Chan,Jayesh,9\n",  # 15 < 21
        week=97, data_dir=str(tmp_path),
    )
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    response = client.post("/ingest/scores", json={"filenames": ["Week97.csv"]})
    assert response.status_code == 422


def test_ingest_scores_idempotent(client: TestClient, monkeypatch, tmp_path):
    _setup_players(client)
    _create_week_csv(
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n",
        week=96, data_dir=str(tmp_path),
    )
    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    client.post("/ingest/scores", json={"filenames": ["Week96.csv"]})
    response = client.post("/ingest/scores", json={"filenames": ["Week96.csv"]})
    assert response.status_code == 200
    assert response.json()["games_loaded"] == 0  # already exists, skipped
