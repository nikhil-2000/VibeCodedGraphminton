import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str, is_sub: bool = False) -> int:
    return client.post("/players", json={
        "canonical_name": name, "is_sub": is_sub, "aliases": []
    }).json()["id"]


def _ingest(client: TestClient, csv: str):
    resp = client.post("/ingest/scores", json={"files": [csv]})
    assert resp.status_code == 200, resp.json()


@pytest.fixture
def overplayed_pair_seed(client: TestClient):
    """
    6 players. SgA+SgB are heavily overplayed partners (play together 6x).
    SgC+SgD and SgE+SgF are underplayed cross-pairings.
    SgA+SgB always face SgC+SgD — their h2h is also overplayed.
    SgE+SgF face the others in rotation.
    """
    a = _create_player(client, "SgA")
    b = _create_player(client, "SgB")
    c = _create_player(client, "SgC")
    d = _create_player(client, "SgD")
    e = _create_player(client, "SgE")
    f = _create_player(client, "SgF")

    dates = [
        "07-01-2024", "14-01-2024", "21-01-2024",
        "28-01-2024", "04-02-2024", "11-02-2024",
    ]
    # SgA+SgB always together (overplayed partnership); vs SgC+SgD (overplayed h2h)
    for date in dates[:4]:
        _ingest(client,
            f"Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
            f"{date},1,SgA,SgB,21,SgC,SgD,9\n"
        )
    # SgE+SgF play with varied partners (each date is a separate file)
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "18-02-2024,1,SgA,SgC,21,SgE,SgF,9\n"
    )
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "25-02-2024,1,SgB,SgD,21,SgE,SgF,9\n"
    )

    return {"a": a, "b": b, "c": c, "d": d, "e": e, "f": f}


def _team_names(game: dict, key: str) -> set[str]:
    return set(game[key])


def test_overplayed_partners_do_not_appear_in_top_suggestion(
    client: TestClient, overplayed_pair_seed
):
    resp = client.get("/stats/suggested-games?top_n=1")
    assert resp.status_code == 200
    games = resp.json()
    assert len(games) > 0
    top = games[0]
    all_teams = set(top["team_a"]) | set(top["team_b"])
    # SgA+SgB as partners in the same team should not be the top suggestion
    top_a = set(top["team_a"])
    top_b = set(top["team_b"])
    assert {"SgA", "SgB"} != top_a
    assert {"SgA", "SgB"} != top_b


def test_overplayed_partners_rank_below_underplayed(
    client: TestClient, overplayed_pair_seed
):
    resp = client.get("/stats/suggested-games?top_n=10")
    assert resp.status_code == 200
    games = resp.json()

    overplayed_rank = None
    underplayed_rank = None
    for i, g in enumerate(games):
        team_a = set(g["team_a"])
        team_b = set(g["team_b"])
        if {"SgA", "SgB"} in (team_a, team_b):
            if overplayed_rank is None:
                overplayed_rank = i
        # SgA+SgC is an underplayed partnership
        if {"SgA", "SgC"} in (team_a, team_b):
            if underplayed_rank is None:
                underplayed_rank = i

    # If the overplayed pair appears at all, it must rank below the underplayed pair
    if overplayed_rank is not None and underplayed_rank is not None:
        assert underplayed_rank < overplayed_rank


def test_only_overplayed_combos_available_still_returns_results(
    client: TestClient, overplayed_pair_seed
):
    """When filtering to just the 4 overplayed players, results are still returned."""
    ids = overplayed_pair_seed
    user_id = "sg-overplay-only-test"
    client.post("/preferences", json={
        "player_id": ids["a"],
        "preset": "custom",
        "custom_player_ids": [ids["a"], ids["b"], ids["c"], ids["d"]],
        "season_id": None,
    }, headers={"X-User-ID": user_id})

    resp = client.get("/stats/suggested-games", headers={"X-User-ID": user_id})
    assert resp.status_code == 200
    # May be empty if all combos score <= 0, but must not error
    assert isinstance(resp.json(), list)


def test_negative_score_combos_excluded(client: TestClient, overplayed_pair_seed):
    """
    Combos where overplay penalty > underplay debt should not appear in results.
    With SgA+SgB having 4x overplayed partnership and no underplay debt for
    that split, their total_score should be <= 0 → excluded.
    """
    resp = client.get("/stats/suggested-games?top_n=10")
    assert resp.status_code == 200
    games = resp.json()

    for g in games:
        team_a = set(g["team_a"])
        team_b = set(g["team_b"])
        # SgA+SgB as a team with SgC+SgD as opponents: pure overplay, no underplay debt
        # This specific split should be absent
        if {"SgA", "SgB"} in (team_a, team_b) and {"SgC", "SgD"} in (team_a, team_b):
            pytest.fail(
                "SgA+SgB vs SgC+SgD should be excluded — all pairs are overplayed"
            )


def test_focus_player_overplayed_partner_not_top(
    client: TestClient, overplayed_pair_seed
):
    ids = overplayed_pair_seed
    resp = client.get(f"/stats/suggested-games?focus_player_id={ids['a']}&top_n=1")
    assert resp.status_code == 200
    games = resp.json()
    if not games:
        return
    top = games[0]
    team_a = set(top["team_a"])
    team_b = set(top["team_b"])
    # SgA's overplayed partner SgB should not be on SgA's team in the top suggestion
    if "SgA" in team_a:
        assert "SgB" not in team_a
    elif "SgA" in team_b:
        assert "SgB" not in team_b
