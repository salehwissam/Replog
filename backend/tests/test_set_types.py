import sqlite3
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet
from app.seeds.exercises import seed_exercises
from app.services.records import rebuild_exercise_records
from app.services.set_rules import is_working_set, working_sets
from tests.helpers import create_logged_user, delete, post, put

BACKEND_DIR = Path(__file__).resolve().parents[1]
SUPINO = "Supino reto com barra"
AGACHAMENTO = "Agachamento livre"
RPE_STEP = "Use valores de 0,5 em 0,5 (ex.: 7,5)."


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name))
    assert value is not None
    return value


def start(client: TestClient) -> dict[str, Any]:
    r = post(client, "/api/workouts", {})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def add_set(
    client: TestClient,
    session_id: int,
    exercise_id: int,
    reps: int,
    weight: float,
    **extra: Any,
) -> dict[str, Any]:
    r = post(
        client,
        f"/api/workouts/{session_id}/sets",
        {"exercise_id": exercise_id, "reps": reps, "weight_kg": weight, **extra},
    )
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def records_of(client: TestClient, exercise_id: int) -> dict[str, Any]:
    for row in client.get("/api/records").json():
        if row["exercise"]["id"] == exercise_id:
            data: dict[str, Any] = row
            return data
    return {}


def test_working_set_helper() -> None:
    sets = [WorkoutSet(set_type=t) for t in ("normal", "aquecimento", "drop", "falha")]
    assert [is_working_set(s) for s in sets] == [True, False, True, True]
    assert [s.set_type for s in working_sets(sets)] == ["normal", "drop", "falha"]


def test_warmup_is_shown_but_does_not_count(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)

    warm = add_set(client, s["id"], sup, 10, 100, set_type="aquecimento")
    assert warm["new_records"] == []
    assert warm["set"]["set_type"] == "aquecimento"
    assert warm["set"]["volume_kg"] == 1000
    assert client.get("/api/records").json() == []

    work = add_set(client, s["id"], sup, 10, 60, rpe=8)
    assert work["set"]["set_type"] == "normal"
    assert work["set"]["rpe"] == 8.0
    assert {r["record_type"] for r in work["new_records"]} >= {"max_weight"}

    rec = records_of(client, sup)
    assert rec["max_weight"]["value"] == 60
    assert "max_set_volume" not in rec

    detail = client.get(f"/api/workouts/{s['id']}").json()
    assert detail["total_sets"] == 1
    assert detail["total_reps"] == 10
    assert detail["volume_kg"] == 600
    block = detail["exercises"][0]
    assert [x["set_type"] for x in block["sets"]] == ["aquecimento", "normal"]
    assert [x["set_number"] for x in block["sets"]] == [1, 2]
    assert block["summary"] == {
        "sets": 1,
        "total_reps": 10,
        "top_weight_kg": 60.0,
        "volume_kg": 600.0,
        "best_est_1rm": 80.0,
    }

    item = client.get("/api/workouts").json()["items"][0]
    assert item["total_sets"] == 1
    assert item["volume_kg"] == 600
    assert item["exercise_names"] == [SUPINO]

    dash = client.get("/api/stats/dashboard").json()
    assert dash["week_volume_kg"] == 600
    assert dash["week_sets"] == 1
    assert dash["week_workouts"] == 1
    month = client.get("/api/stats/volume", params={"period": "month", "count": 1}).json()
    assert month[-1]["volume_kg"] == 600
    assert month[-1]["sets"] == 1

    progress = client.get(f"/api/exercises/{sup}/progress").json()
    assert len(progress) == 1
    assert progress[0]["top_weight_kg"] == 60
    assert progress[0]["volume_kg"] == 600


def test_session_with_only_warmup_has_no_records(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    add_set(client, s["id"], sup, 15, 40, set_type="aquecimento")
    add_set(client, s["id"], sup, 10, 50, set_type="aquecimento")

    assert client.get("/api/records").json() == []
    detail = client.get(f"/api/workouts/{s['id']}").json()
    assert detail["total_sets"] == 0
    assert detail["volume_kg"] == 0
    assert len(detail["exercises"][0]["sets"]) == 2
    assert detail["exercises"][0]["summary"]["sets"] == 0
    assert client.get(f"/api/exercises/{sup}/progress").json() == []


@pytest.mark.parametrize("set_type", ["drop", "falha", "normal"])
def test_working_set_types_count(client: TestClient, db: Session, set_type: str) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    res = add_set(client, s["id"], sup, 8, 70, set_type=set_type)
    assert res["set"]["set_type"] == set_type
    assert {r["record_type"] for r in res["new_records"]} >= {"max_weight", "max_est_1rm"}
    assert records_of(client, sup)["max_weight"]["value"] == 70
    detail = client.get(f"/api/workouts/{s['id']}").json()
    assert detail["total_sets"] == 1
    assert detail["volume_kg"] == 560


def test_comparison_ignores_warmup(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)

    s1 = start(client)
    add_set(client, s1["id"], sup, 10, 40, set_type="aquecimento")
    add_set(client, s1["id"], sup, 10, 60)
    post(client, f"/api/workouts/{s1['id']}/finish")

    s2 = start(client)
    add_set(client, s2["id"], sup, 12, 30, set_type="aquecimento")
    post(client, f"/api/workouts/{s2['id']}/finish")

    s3 = start(client)
    add_set(client, s3["id"], sup, 10, 20, set_type="aquecimento")
    add_set(client, s3["id"], sup, 10, 65)

    comparison = client.get(f"/api/workouts/{s3['id']}").json()["exercises"][0]["comparison"]
    assert comparison["previous_session_id"] == s1["id"]
    assert comparison["previous"]["sets"] == 1
    assert comparison["previous"]["volume_kg"] == 600
    assert comparison["delta_volume_kg"] == 50
    assert comparison["delta_top_weight_kg"] == 5
    assert comparison["delta_total_reps"] == 0


def test_incremental_records_match_rebuild_with_warmups(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    sup = ex_id(db, SUPINO)
    plan = [
        [("aquecimento", 10, 100), ("normal", 10, 60), ("drop", 12, 40)],
        [("aquecimento", 5, 120), ("falha", 6, 75)],
        [("normal", 8, 70), ("aquecimento", 20, 30)],
    ]
    for sets in plan:
        s = start(client)
        for kind, reps, kg in sets:
            add_set(client, s["id"], sup, reps, kg, set_type=kind)
        post(client, f"/api/workouts/{s['id']}/finish")

    def snapshot() -> list[tuple[str, str, str | None, int | None, int]]:
        db.expire_all()
        rows = db.scalars(
            select(PersonalRecord).order_by(PersonalRecord.record_type, PersonalRecord.value)
        )
        return [
            (
                r.record_type,
                str(r.value),
                str(r.previous_value) if r.previous_value is not None else None,
                r.set_id,
                r.session_id,
            )
            for r in rows
        ]

    incremental = snapshot()
    assert max(float(v) for t, v, *_ in incremental if t == "max_weight") == 75
    rebuild_exercise_records(db, user["id"], sup)
    db.commit()
    assert snapshot() == incremental


def test_update_set_type_rebuilds_records(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    heavy = add_set(client, s["id"], sup, 10, 100, rpe=9.5)
    add_set(client, s["id"], sup, 10, 60)
    url = f"/api/workouts/{s['id']}/sets/{heavy['set']['id']}"
    assert records_of(client, sup)["max_weight"]["value"] == 100

    r = put(client, url, {"reps": 10, "weight_kg": 100, "set_type": "aquecimento"})
    assert r.status_code == 200, r.text
    assert r.json()["set_type"] == "aquecimento"
    assert r.json()["rpe"] == 9.5
    assert records_of(client, sup)["max_weight"]["value"] == 60
    assert client.get(f"/api/workouts/{s['id']}").json()["volume_kg"] == 600

    r = put(client, url, {"reps": 10, "weight_kg": 90})
    assert r.json()["set_type"] == "aquecimento"
    assert records_of(client, sup)["max_weight"]["value"] == 60

    r = put(client, url, {"reps": 10, "weight_kg": 90, "set_type": "falha", "rpe": None})
    assert r.json()["set_type"] == "falha"
    assert r.json()["rpe"] is None
    assert records_of(client, sup)["max_weight"]["value"] == 90
    assert client.get(f"/api/workouts/{s['id']}").json()["volume_kg"] == 1500

    r = put(client, url, {"reps": 10, "weight_kg": 90, "rpe": "7.5"})
    assert r.json()["rpe"] == 7.5
    assert r.json()["set_type"] == "falha"


@pytest.mark.parametrize(
    ("rpe", "message"),
    [
        (0.3, "Valor muito baixo."),
        (0.5, "Valor muito baixo."),
        (11, "Valor muito alto."),
        (10.5, "Valor muito alto."),
        (7.25, RPE_STEP),
        ("7.25", RPE_STEP),
        (6.1, RPE_STEP),
        ("abc", "Informe um número válido."),
    ],
)
def test_invalid_rpe_is_rejected(client: TestClient, db: Session, rpe: Any, message: str) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    r = post(
        client,
        f"/api/workouts/{s['id']}/sets",
        {"exercise_id": sup, "reps": 10, "weight_kg": 50, "rpe": rpe},
    )
    assert r.status_code == 422
    assert r.json()["erro"]["campos"]["rpe"] == message

    ok = add_set(client, s["id"], sup, 10, 50)
    r = put(
        client,
        f"/api/workouts/{s['id']}/sets/{ok['set']['id']}",
        {"reps": 10, "weight_kg": 50, "rpe": rpe},
    )
    assert r.status_code == 422
    assert r.json()["erro"]["campos"]["rpe"] == message


@pytest.mark.parametrize("rpe", [1, 1.5, 7, "7.5", 9.5, 10])
def test_valid_rpe_values(client: TestClient, db: Session, rpe: Any) -> None:
    create_logged_user(client)
    s = start(client)
    res = add_set(client, s["id"], ex_id(db, SUPINO), 10, 50, rpe=rpe)
    assert res["set"]["rpe"] == float(rpe)


@pytest.mark.parametrize("set_type", ["pesado", "Aquecimento", "", None, 1])
def test_invalid_set_type_is_rejected(client: TestClient, db: Session, set_type: Any) -> None:
    create_logged_user(client)
    s = start(client)
    r = post(
        client,
        f"/api/workouts/{s['id']}/sets",
        {"exercise_id": ex_id(db, SUPINO), "reps": 10, "weight_kg": 50, "set_type": set_type},
    )
    assert r.status_code == 422
    assert "set_type" in r.json()["erro"]["campos"]


@pytest.mark.parametrize(
    "extra",
    [
        {"user_id": 999},
        {"performed_at": "2020-01-01T00:00:00Z"},
        {"set_number": 7},
        {"id": 1},
        {"session_id": 1},
        {"tipo": "aquecimento"},
    ],
)
def test_mass_assignment_still_blocked(
    client: TestClient, db: Session, extra: dict[str, Any]
) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    body = {"exercise_id": sup, "reps": 10, "weight_kg": 50, "set_type": "drop", "rpe": 8}
    r = post(client, f"/api/workouts/{s['id']}/sets", {**body, **extra})
    assert r.status_code == 422
    ok = add_set(client, s["id"], sup, 10, 50)
    r = put(
        client,
        f"/api/workouts/{s['id']}/sets/{ok['set']['id']}",
        {"reps": 10, "weight_kg": 50, "set_type": "drop", **extra},
    )
    assert r.status_code == 422


def test_database_constraints(db: Session) -> None:
    user = User(name="Ana", email="ana@exemplo.com", password_hash="x", timezone="UTC")
    db.add(user)
    db.flush()
    session = WorkoutSession(user_id=user.id, timezone="UTC", local_date=date(2026, 11, 9))
    db.add(session)
    db.flush()
    sup = ex_id(db, SUPINO)
    base = {"session_id": session.id, "user_id": user.id, "exercise_id": sup, "reps": 5}

    ok = WorkoutSet(set_number=1, weight_kg=50, **base)
    db.add(ok)
    db.commit()
    assert ok.set_type == "normal"
    assert ok.rpe is None

    for number, bad in enumerate([{"set_type": "pesado"}, {"rpe": 11}, {"rpe": 0}], start=2):
        db.add(WorkoutSet(set_number=number, weight_kg=50, **base, **bad))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_export_includes_type_and_rpe(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    add_set(client, s["id"], sup, 12, 60, set_type="aquecimento")
    add_set(client, s["id"], sup, 8, 70, rpe=8.5)
    add_set(client, s["id"], sup, 6, 50, set_type="drop", rpe=10)

    data = client.get("/api/users/me/export").json()
    series = data["treinos"][0]["series"]
    assert [(x["tipo"], x["rpe"]) for x in series] == [
        ("aquecimento", None),
        ("normal", 8.5),
        ("drop", 10.0),
    ]
    weight_records = [r["valor"] for r in data["recordes"] if r["tipo"] == "max_weight"]
    assert weight_records == [70.0]


def test_other_user_cannot_change_set_type(
    client: TestClient,
    make_client,  # type: ignore[no-untyped-def]
    db: Session,
) -> None:
    create_logged_user(client, "ana@exemplo.com")
    sup = ex_id(db, SUPINO)
    s = start(client)
    mine = add_set(client, s["id"], sup, 10, 100)
    url = f"/api/workouts/{s['id']}/sets/{mine['set']['id']}"

    bruno = make_client()
    create_logged_user(bruno, "bruno@exemplo.com")
    r = put(bruno, url, {"reps": 10, "weight_kg": 100, "set_type": "aquecimento", "rpe": 5})
    assert r.status_code == 404
    r = post(
        bruno,
        f"/api/workouts/{s['id']}/sets",
        {"exercise_id": sup, "reps": 1, "weight_kg": 1, "set_type": "aquecimento"},
    )
    assert r.status_code == 404
    assert delete(bruno, url).status_code == 404

    detail = client.get(f"/api/workouts/{s['id']}").json()
    assert detail["exercises"][0]["sets"][0]["set_type"] == "normal"
    assert detail["exercises"][0]["sets"][0]["rpe"] is None
    assert records_of(client, sup)["max_weight"]["value"] == 100

    sb = start(bruno)
    add_set(bruno, sb["id"], sup, 10, 200, set_type="aquecimento")
    assert bruno.get("/api/records").json() == []
    assert records_of(client, sup)["max_weight"]["value"] == 100


def test_migration_defaults_existing_sets_to_normal(tmp_path: Path) -> None:
    db_file = tmp_path / "b1.db"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)

    command.upgrade(cfg, "4e8eb19ddd9c")
    with sqlite3.connect(db_file) as conn:
        conn.execute(
            "INSERT INTO workout_sets (id, session_id, user_id, exercise_id, set_number, reps,"
            " weight_kg, performed_at) VALUES (1, 1, 1, 1, 1, 10, 50, '2026-01-01 00:00:00')"
        )
    command.upgrade(cfg, "head")
    with sqlite3.connect(db_file) as conn:
        assert conn.execute("SELECT set_type, rpe FROM workout_sets").fetchall() == [
            ("normal", None)
        ]
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE workout_sets SET set_type = 'pesado'")
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("UPDATE workout_sets SET rpe = 11")

    command.downgrade(cfg, "4e8eb19ddd9c")
    with sqlite3.connect(db_file) as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(workout_sets)")}
        assert "set_type" not in cols and "rpe" not in cols
        assert conn.execute("SELECT COUNT(*) FROM workout_sets").fetchone() == (1,)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
