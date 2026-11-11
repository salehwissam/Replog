from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID
from app.models import Exercise
from app.seeds.exercises import seed_exercises
from app.services.suggestions import (
    format_kg,
    increased_weight,
    parse_rep_range,
    reduced_weight,
)
from tests.helpers import create_logged_user, delete, post, put

SUPINO = "Supino reto com barra"
SUPINO_HALTER = "Supino reto com halteres"
GOBLET = "Agachamento goblet"
BARRA_FIXA = "Barra fixa"


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name))
    assert value is not None
    return value


def workout(
    client: TestClient,
    exercise_id: int,
    sets: list[tuple[int, float] | tuple[int, float, str]],
    *,
    finish: bool = True,
    split_id: int | None = None,
    intensity: str | None = None,
) -> int:
    body: dict[str, Any] = {"split_id": split_id} if split_id else {}
    if intensity is not None:
        body["intensity"] = intensity
    r = post(client, "/api/workouts", body)
    assert r.status_code == 201, r.text
    session_id: int = r.json()["id"]
    for item in sets:
        payload: dict[str, Any] = {
            "exercise_id": exercise_id,
            "reps": item[0],
            "weight_kg": item[1],
        }
        if len(item) == 3:
            payload["set_type"] = item[2]
        r = post(client, f"/api/workouts/{session_id}/sets", payload)
        assert r.status_code == 201, r.text
    if finish:
        assert post(client, f"/api/workouts/{session_id}/finish").status_code == 200
    return session_id


def suggestion(
    client: TestClient,
    exercise_id: int,
    target_reps: str | None = None,
    intensity: str | None = None,
) -> Any:
    params: dict[str, str] = {}
    if target_reps is not None:
        params["target_reps"] = target_reps
    if intensity is not None:
        params["intensity"] = intensity
    r = client.get(f"/api/exercises/{exercise_id}/suggestion", params=params or None)
    assert r.status_code == 200, r.text
    return r.json()


def test_without_history_returns_null(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    assert suggestion(client, supino) == {
        "exercise_id": supino,
        "intensity": "normal",
        "based_on_session_id": None,
        "based_on_intensity": None,
        "last_date": None,
        "last_sets": [],
        "suggestion": None,
    }


def test_only_active_workout_counts_as_no_history(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 60)], finish=False)
    data = suggestion(client, supino)
    assert data["suggestion"] is None
    assert data["last_sets"] == []


def test_top_of_range_increases_load(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    session_id = workout(client, supino, [(12, 60), (12, 60), (13, 60)])
    data = suggestion(client, supino, "8-12")
    assert data["based_on_session_id"] == session_id
    assert data["last_date"] is not None
    assert data["last_sets"] == [
        {"reps": 12, "weight_kg": 60.0, "set_type": "normal"},
        {"reps": 12, "weight_kg": 60.0, "set_type": "normal"},
        {"reps": 13, "weight_kg": 60.0, "set_type": "normal"},
    ]
    s = data["suggestion"]
    assert s["weight_kg"] == 62.5
    assert s["reps"] == 8
    assert "60 kg" in s["reason"] and "62,5 kg" in s["reason"]


def test_within_range_adds_one_rep(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(11, 60), (10, 60), (9, 60)])
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert s["weight_kg"] == 60.0
    assert s["reps"] == 10
    assert "mantenha a carga" in s["reason"]


def test_within_range_never_passes_the_top(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 60), (12, 60), (11, 60)])
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (60.0, 12)


def test_below_range_keeps_load_and_aims_start(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(7, 60), (6, 60), (6, 60)])
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (60.0, 8)
    assert "abaixo" in s["reason"]


def test_well_below_range_reduces_load(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(5, 60), (4, 60), (4, 60)])
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (55.0, 8)
    assert "reduza para 55 kg" in s["reason"]


def test_single_number_target(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(5, 100), (5, 100), (5, 100)])
    s = suggestion(client, supino, "5")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (102.5, 5)


def test_only_top_load_sets_decide(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 60), (12, 60), (6, 50)])
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (62.5, 8)


def test_uses_the_most_recent_finished_workout(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 60), (12, 60)])
    latest = workout(client, supino, [(9, 62.5), (8, 62.5)])
    data = suggestion(client, supino, "8-12")
    assert data["based_on_session_id"] == latest
    assert (data["suggestion"]["weight_kg"], data["suggestion"]["reps"]) == (62.5, 9)


def test_default_range_is_8_to_12(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 60), (12, 60)])
    s = suggestion(client, supino)["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (62.5, 8)


def test_range_comes_from_the_split_when_not_informed(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    r = put(
        client,
        "/api/splits/A",
        {"name": "Força", "exercises": [{"exercise_id": supino, "target_reps": "4-6"}]},
    )
    assert r.status_code == 200, r.text
    workout(client, supino, [(6, 100), (6, 100), (6, 100)], split_id=r.json()["id"])
    s = suggestion(client, supino)["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (102.5, 4)
    s = suggestion(client, supino, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (100.0, 8)


def test_dumbbell_increments_by_2kg(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    halter = ex_id(db, SUPINO_HALTER)
    workout(client, halter, [(12, 22), (12, 22), (12, 22)])
    s = suggestion(client, halter, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (24.0, 8)
    assert "24 kg" in s["reason"]


def test_dumbbell_rounds_to_reachable_weight(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    halter = ex_id(db, SUPINO_HALTER)
    workout(client, halter, [(12, 23), (12, 23)])
    s = suggestion(client, halter, "8-12")["suggestion"]
    assert s["weight_kg"] == 24.0


def test_kettlebell_increments_by_4kg(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    goblet = ex_id(db, GOBLET)
    workout(client, goblet, [(15, 16), (15, 16)])
    s = suggestion(client, goblet, "10-15")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (20.0, 10)


def test_bodyweight_adds_reps_keeping_zero_kg(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    barra_fixa = ex_id(db, BARRA_FIXA)
    workout(client, barra_fixa, [(10, 0), (9, 0), (8, 0)])
    s = suggestion(client, barra_fixa, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (0.0, 9)
    assert "peso do corpo" in s["reason"]


def test_bodyweight_has_no_rep_ceiling(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    barra_fixa = ex_id(db, BARRA_FIXA)
    workout(client, barra_fixa, [(15, 0), (15, 0)])
    s = suggestion(client, barra_fixa, "8-12")["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (0.0, 16)


def test_warmup_is_ignored_by_the_rule(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(
        client,
        supino,
        [(5, 80, "aquecimento"), (3, 40, "aquecimento"), (12, 60), (12, 60), (12, 60, "falha")],
    )
    data = suggestion(client, supino, "8-12")
    assert [s["set_type"] for s in data["last_sets"]] == [
        "aquecimento",
        "aquecimento",
        "normal",
        "normal",
        "falha",
    ]
    s = data["suggestion"]
    assert (s["weight_kg"], s["reps"]) == (62.5, 8)


def test_workout_with_only_warmup_is_not_a_base(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    base = workout(client, supino, [(12, 60), (12, 60)])
    workout(client, supino, [(10, 40, "aquecimento")])
    data = suggestion(client, supino, "8-12")
    assert data["based_on_session_id"] == base


def test_active_workout_does_not_change_the_suggestion(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    base = workout(client, supino, [(10, 60), (10, 60)])
    before = suggestion(client, supino, "8-12")

    workout(client, supino, [(12, 70), (12, 70)], finish=False)
    during = suggestion(client, supino, "8-12")
    assert during == before
    assert during["based_on_session_id"] == base
    assert (during["suggestion"]["weight_kg"], during["suggestion"]["reps"]) == (60.0, 11)


@pytest.mark.parametrize("target", ["abc", "8-", "-8", "8-12-15", "1234", "0", "0-5", "12-8", ""])
def test_invalid_target_reps_is_422(client: TestClient, db: Session, target: str) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    r = client.get(f"/api/exercises/{supino}/suggestion", params={"target_reps": target})
    assert r.status_code == 422, r.text
    assert r.json()["erro"]["codigo"] == "dados_invalidos"
    assert "target_reps" in r.json()["erro"]["campos"]


@pytest.mark.parametrize("bad_id", ["0", "-1", str(MAX_ID + 1), "99999999999999999999", "abc"])
def test_invalid_id_is_422(client: TestClient, bad_id: str) -> None:
    create_logged_user(client)
    assert client.get(f"/api/exercises/{bad_id}/suggestion").status_code == 422


def test_missing_exercise_is_404(client: TestClient) -> None:
    create_logged_user(client)
    assert client.get(f"/api/exercises/{MAX_ID}/suggestion").status_code == 404


def test_requires_login(client: TestClient, db: Session) -> None:
    supino = ex_id(db, SUPINO)
    assert client.get(f"/api/exercises/{supino}/suggestion").status_code == 401


def test_other_users_history_is_invisible(
    client: TestClient, make_client: Any, db: Session
) -> None:
    create_logged_user(client, "ana@exemplo.com")
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(12, 100), (12, 100)])

    bia = make_client()
    create_logged_user(bia, "bia@exemplo.com")
    data = suggestion(bia, supino)
    assert data["suggestion"] is None
    assert data["based_on_session_id"] is None


def test_other_users_custom_exercise_is_404(
    client: TestClient, make_client: Any, db: Session
) -> None:
    create_logged_user(client, "ana@exemplo.com")
    r = post(
        client,
        "/api/exercises",
        {"name": "Supino da Ana", "muscle_group": "peito", "equipment": "barra"},
    )
    assert r.status_code == 201, r.text
    proprio = r.json()["id"]
    workout(client, proprio, [(12, 50), (12, 50)])
    assert suggestion(client, proprio)["suggestion"]["weight_kg"] == 52.5

    bia = make_client()
    create_logged_user(bia, "bia@exemplo.com")
    r = bia.get(f"/api/exercises/{proprio}/suggestion")
    assert r.status_code == 404
    assert r.json()["erro"]["codigo"] == "nao_encontrado"


def test_archived_exercise_is_404(client: TestClient) -> None:
    create_logged_user(client)
    r = post(
        client,
        "/api/exercises",
        {"name": "Remada da Ana", "muscle_group": "costas", "equipment": "polia"},
    )
    exercise_id = r.json()["id"]
    workout(client, exercise_id, [(10, 40)])
    assert delete(client, f"/api/exercises/{exercise_id}").status_code == 204
    assert client.get(f"/api/exercises/{exercise_id}/suggestion").status_code == 404


def test_parse_rep_range() -> None:
    assert parse_rep_range("8-12") is not None
    assert parse_rep_range("10") == parse_rep_range("10-10")
    for bad in (None, "", "0", "12-8", "a-b", "1-2-3", "5-1001"):
        assert parse_rep_range(bad) is None


def test_weight_helpers() -> None:
    assert format_kg(Decimal("60")) == "60 kg"
    assert format_kg(Decimal("62.50")) == "62,5 kg"
    assert format_kg(Decimal("17.25")) == "17,25 kg"
    assert increased_weight(Decimal("61"), Decimal("2.5")) == Decimal("62.5")
    assert increased_weight(Decimal("1500"), Decimal("2.5")) == Decimal("1500")
    assert reduced_weight(Decimal("60"), Decimal("2.5")) == Decimal("55")
    assert reduced_weight(Decimal("20"), Decimal("2")) == Decimal("18")
    assert reduced_weight(Decimal("2.5"), Decimal("2.5")) is None


def test_light_week_suggests_about_60_percent(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    normal = workout(client, supino, [(10, 80), (9, 80)])
    data = suggestion(client, supino, intensity="leve")
    assert data["intensity"] == "leve"
    assert data["based_on_session_id"] == normal
    assert data["based_on_intensity"] == "normal"
    assert data["suggestion"]["weight_kg"] == 47.5
    assert data["suggestion"]["reps"] == 8
    assert "Semana leve" in data["suggestion"]["reason"]


def test_after_deload_progression_continues_from_last_normal(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    normal = workout(client, supino, [(12, 80), (12, 80)])
    workout(client, supino, [(8, 47.5)], intensity="leve")
    data = suggestion(client, supino)
    assert data["based_on_session_id"] == normal
    assert data["suggestion"]["weight_kg"] == 82.5
    assert data["suggestion"]["reps"] == 8


def test_first_heavy_workout_converts_by_estimated_max(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(10, 60)])
    data = suggestion(client, supino, target_reps="8-12", intensity="pesado")
    assert data["suggestion"]["weight_kg"] == 65.0
    assert data["suggestion"]["reps"] == 6
    assert "Primeiro treino pesado" in data["suggestion"]["reason"]


def test_heavy_week_uses_its_own_range_not_the_split_one(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(10, 60)])
    heavy = workout(client, supino, [(5, 70), (5, 70), (4, 70)], intensity="pesado")
    data = suggestion(client, supino, target_reps="8-12", intensity="pesado")
    assert data["based_on_session_id"] == heavy
    assert data["suggestion"]["weight_kg"] == 70.0
    assert data["suggestion"]["reps"] == 5
    normal = suggestion(client, supino, target_reps="8-12")
    assert normal["suggestion"]["weight_kg"] == 60.0
    assert normal["suggestion"]["reps"] == 11


def test_suggestion_follows_the_active_workout_intensity(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    workout(client, supino, [(10, 100)])
    workout(client, supino, [], finish=False, intensity="leve")
    assert suggestion(client, supino)["intensity"] == "leve"
    assert suggestion(client, supino)["suggestion"]["weight_kg"] == 60.0


def test_bodyweight_light_week_reduces_reps(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    barra = ex_id(db, "Barra fixa")
    workout(client, barra, [(10, 0), (10, 0)])
    data = suggestion(client, barra, intensity="leve")
    assert data["suggestion"] == {
        "weight_kg": 0.0,
        "reps": 6,
        "reason": data["suggestion"]["reason"],
    }


def test_invalid_intensity_is_422(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    r = client.get(f"/api/exercises/{supino}/suggestion", params={"intensity": "extremo"})
    assert r.status_code == 422
