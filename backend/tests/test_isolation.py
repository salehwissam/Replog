from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise
from app.seeds.exercises import seed_exercises
from tests.helpers import create_logged_user, delete, patch, post, put


@pytest.fixture
def scenario(client: TestClient, make_client, db: Session) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    seed_exercises(db)
    supino = db.scalar(select(Exercise.id).where(Exercise.name == "Supino reto com barra"))
    create_logged_user(client, "ana@exemplo.com")
    custom = post(
        client, "/api/exercises", {"name": "Exercício da Ana", "muscle_group": "peito"}
    ).json()
    split = put(
        client,
        "/api/splits/A",
        {"name": "Treino da Ana", "exercises": [{"exercise_id": custom["id"]}]},
    ).json()
    session = post(client, "/api/workouts", {"split_id": split["id"], "notes": "segredo"}).json()
    s = post(
        client,
        f"/api/workouts/{session['id']}/sets",
        {"exercise_id": supino, "reps": 10, "weight_kg": 100},
    ).json()

    bruno = make_client()
    create_logged_user(bruno, "bruno@exemplo.com")
    return {
        "bruno": bruno,
        "ana": client,
        "custom_id": custom["id"],
        "split_id": split["id"],
        "session_id": session["id"],
        "set_id": s["set"]["id"],
        "supino": supino,
    }


def test_other_user_cannot_read_workout(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    sid = scenario["session_id"]
    r = bruno.get(f"/api/workouts/{sid}")
    assert r.status_code == 404
    assert "segredo" not in r.text
    assert bruno.get("/api/workouts").json()["total"] == 0
    assert bruno.get("/api/workouts/active").json() is None
    assert bruno.get("/api/records").json() == []
    assert bruno.get("/api/records/recent").json() == []
    assert bruno.get("/api/stats/dashboard").json()["total_workouts"] == 0


def test_other_user_cannot_modify_workout(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    sid, set_id = scenario["session_id"], scenario["set_id"]
    assert patch(bruno, f"/api/workouts/{sid}", {"notes": "hack"}).status_code == 404
    assert post(bruno, f"/api/workouts/{sid}/finish").status_code == 404
    assert (
        post(
            bruno,
            f"/api/workouts/{sid}/sets",
            {"exercise_id": scenario["supino"], "reps": 1, "weight_kg": 999},
        ).status_code
        == 404
    )
    assert (
        put(bruno, f"/api/workouts/{sid}/sets/{set_id}", {"reps": 1, "weight_kg": 1}).status_code
        == 404
    )
    assert delete(bruno, f"/api/workouts/{sid}/sets/{set_id}").status_code == 404
    assert delete(bruno, f"/api/workouts/{sid}").status_code == 404

    ana: TestClient = scenario["ana"]
    detail = ana.get(f"/api/workouts/{sid}").json()
    assert detail["notes"] == "segredo"
    assert detail["exercises"][0]["sets"][0]["weight_kg"] == 100


def test_set_id_from_other_session_is_rejected(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    own = post(bruno, "/api/workouts", {}).json()
    r = put(
        bruno, f"/api/workouts/{own['id']}/sets/{scenario['set_id']}", {"reps": 1, "weight_kg": 1}
    )
    assert r.status_code == 404


def test_other_user_cannot_use_custom_exercise(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    cid = scenario["custom_id"]
    assert cid not in [e["id"] for e in bruno.get("/api/exercises").json()]
    body = {"name": "Nome válido", "muscle_group": "peito"}
    assert put(bruno, f"/api/exercises/{cid}", body).status_code == 404
    assert delete(bruno, f"/api/exercises/{cid}").status_code == 404
    assert bruno.get(f"/api/exercises/{cid}/progress").status_code == 404
    assert bruno.get(f"/api/exercises/{cid}/records").status_code == 404

    own = post(bruno, "/api/workouts", {}).json()
    r = post(
        bruno, f"/api/workouts/{own['id']}/sets", {"exercise_id": cid, "reps": 1, "weight_kg": 1}
    )
    assert r.status_code == 404
    r = put(bruno, "/api/splits/A", {"name": "x", "exercises": [{"exercise_id": cid}]})
    assert r.status_code == 404


def test_other_user_cannot_use_split(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    assert bruno.get("/api/splits").json() == []
    r = post(bruno, "/api/workouts", {"split_id": scenario["split_id"]})
    assert r.status_code == 404
    assert put(bruno, "/api/splits/A", {"name": "Do Bruno"}).status_code == 200
    ana: TestClient = scenario["ana"]
    assert ana.get("/api/splits").json()[0]["name"] == "Treino da Ana"


def test_records_of_global_exercise_are_per_user(scenario: dict[str, Any]) -> None:
    bruno: TestClient = scenario["bruno"]
    supino = scenario["supino"]
    assert bruno.get(f"/api/exercises/{supino}/records").json() == []
    assert bruno.get(f"/api/exercises/{supino}/progress").json() == []
    own = post(bruno, "/api/workouts", {}).json()
    res = post(
        bruno,
        f"/api/workouts/{own['id']}/sets",
        {"exercise_id": supino, "reps": 5, "weight_kg": 50},
    ).json()
    weight = next(r for r in res["new_records"] if r["record_type"] == "max_weight")
    assert weight["previous_value"] is None


def test_export_contains_only_own_data(scenario: dict[str, Any]) -> None:
    ana: TestClient = scenario["ana"]
    bruno: TestClient = scenario["bruno"]
    r = ana.get("/api/users/me/export")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["perfil"]["email"] == "ana@exemplo.com"
    assert data["treinos"][0]["series"][0]["carga_kg"] == 100
    assert data["exercicios_personalizados"][0]["nome"] == "Exercício da Ana"
    assert "password" not in r.text and "hash" not in r.text
    other = bruno.get("/api/users/me/export").json()
    assert other["treinos"] == [] and other["divisoes"] == []


def test_unauthenticated_access_is_denied(client: TestClient) -> None:
    for url in [
        "/api/users/me/export",
        "/api/workouts",
        "/api/records",
        "/api/stats/dashboard",
        "/api/exercises",
        "/api/splits",
    ]:
        assert client.get(url).status_code == 401, url
