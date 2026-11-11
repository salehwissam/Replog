from datetime import timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import Exercise, WorkoutSession
from app.seeds.exercises import seed_exercises
from app.services.records import epley_1rm
from tests.helpers import create_logged_user, delete, patch, post, put


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name))
    assert value is not None
    return value


SUPINO = "Supino reto com barra"
AGACHAMENTO = "Agachamento livre"
BARRA_FIXA = "Barra fixa"


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    r = post(client, "/api/workouts", body)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def add_set(
    client: TestClient, session_id: int, exercise_id: int, reps: int, weight: str | float
) -> dict[str, Any]:
    r = post(
        client,
        f"/api/workouts/{session_id}/sets",
        {"exercise_id": exercise_id, "reps": reps, "weight_kg": weight},
    )
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


@pytest.mark.parametrize(
    ("weight", "reps", "expected"),
    [
        ("100", 1, Decimal("100.00")),
        ("100", 10, Decimal("133.33")),
        ("60", 5, Decimal("70.00")),
        ("80", 12, Decimal("112.00")),
        ("80", 13, None),
        ("0", 10, None),
    ],
)
def test_epley_1rm(weight: str, reps: int, expected: Decimal | None) -> None:
    assert epley_1rm(Decimal(weight), reps) == expected


def test_catalog_and_custom_exercises(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    r = client.get("/api/exercises", params={"q": "supino"})
    assert r.status_code == 200
    names = [e["name"] for e in r.json()]
    assert SUPINO in names and all("upino" in n for n in names)

    r = post(client, "/api/exercises", {"name": "Supino Articulado", "muscle_group": "peito"})
    assert r.status_code == 201
    assert r.json()["is_custom"] is True

    dup = post(client, "/api/exercises", {"name": "supino reto com BARRA", "muscle_group": "peito"})
    assert dup.status_code == 409
    assert dup.json()["erro"]["mensagem"] == "Já existe um exercício com esse nome."

    bad = post(client, "/api/exercises", {"name": "X1", "muscle_group": "cabeca"})
    assert bad.status_code == 422


def test_search_with_sql_wildcards_is_literal(client: TestClient) -> None:
    create_logged_user(client)
    assert client.get("/api/exercises", params={"q": "%"}).json() == []
    assert client.get("/api/exercises", params={"q": "' OR 1=1 --"}).json() == []


def test_global_exercise_cannot_be_edited_or_archived(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sid = ex_id(db, SUPINO)
    body = {"name": "Hackeado", "muscle_group": "peito"}
    assert put(client, f"/api/exercises/{sid}", body).status_code == 404
    assert delete(client, f"/api/exercises/{sid}").status_code == 404


def test_archived_exercise_keeps_history(client: TestClient) -> None:
    create_logged_user(client)
    custom = post(client, "/api/exercises", {"name": "Remada Meadows", "muscle_group": "costas"})
    cid = custom.json()["id"]
    session = start(client)
    add_set(client, session["id"], cid, 10, 30)
    assert delete(client, f"/api/exercises/{cid}").status_code == 204
    assert cid not in [e["id"] for e in client.get("/api/exercises").json()]
    detail = client.get(f"/api/workouts/{session['id']}").json()
    assert detail["exercises"][0]["exercise"]["name"] == "Remada Meadows"
    assert client.get(f"/api/exercises/{cid}/progress").status_code == 200


def test_split_crud(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    body = {
        "name": "Peito e Tríceps",
        "exercises": [
            {"exercise_id": ex_id(db, SUPINO), "target_sets": 4, "target_reps": "8-12"},
            {"exercise_id": ex_id(db, "Tríceps na polia (corda)"), "rest_seconds": 60},
        ],
    }
    r = put(client, "/api/splits/A", body)
    assert r.status_code == 200, r.text
    assert [e["exercise"]["name"] for e in r.json()["exercises"]] == [
        SUPINO,
        "Tríceps na polia (corda)",
    ]
    body["exercises"] = body["exercises"][::-1]
    r = put(client, "/api/splits/A", body)
    assert r.json()["exercises"][0]["exercise"]["name"] == "Tríceps na polia (corda)"
    assert len(client.get("/api/splits").json()) == 1

    assert put(client, "/api/splits/F", body).status_code == 422
    dup = {"name": "X", "exercises": [{"exercise_id": ex_id(db, SUPINO)}] * 2}
    assert put(client, "/api/splits/B", dup).status_code == 409
    assert (
        put(
            client, "/api/splits/B", {"name": "X", "exercises": [{"exercise_id": 999999}]}
        ).status_code
        == 404
    )
    bad_reps = {
        "name": "X",
        "exercises": [{"exercise_id": ex_id(db, SUPINO), "target_reps": "<script>"}],
    }
    assert put(client, "/api/splits/B", bad_reps).status_code == 422

    assert delete(client, "/api/splits/A").status_code == 204
    assert client.get("/api/splits").json() == []


def test_full_workout_flow_with_server_timestamps(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    before = utcnow()
    session = start(client, notes="Dia de peito")
    assert session["finished_at"] is None
    assert session["timezone"] == "America/Sao_Paulo"

    sup = ex_id(db, SUPINO)
    s1 = add_set(client, session["id"], sup, 12, 20)
    s2 = add_set(client, session["id"], sup, 10, "25")
    s3 = add_set(client, session["id"], sup, 8, "30.5")
    assert [s["set"]["set_number"] for s in (s1, s2, s3)] == [1, 2, 3]
    assert s3["set"]["volume_kg"] == 244.0

    detail = client.get(f"/api/workouts/{session['id']}").json()
    assert detail["total_sets"] == 3
    assert detail["total_reps"] == 30
    assert detail["volume_kg"] == 240 + 250 + 244
    block = detail["exercises"][0]
    assert block["summary"]["top_weight_kg"] == 30.5
    performed = block["sets"][0]["performed_at"]
    assert performed >= before.isoformat()[:19]

    finished = post(client, f"/api/workouts/{session['id']}/finish").json()
    assert finished["finished_at"] is not None
    assert finished["duration_seconds"] >= 0


def test_client_cannot_set_timestamps_or_owner(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    session = start(client)
    r = post(
        client,
        f"/api/workouts/{session['id']}/sets",
        {
            "exercise_id": ex_id(db, SUPINO),
            "reps": 10,
            "weight_kg": 20,
            "performed_at": "2020-01-01T00:00:00Z",
        },
    )
    assert r.status_code == 422
    r = post(client, "/api/workouts", {"user_id": 999})
    assert r.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"reps": 0, "weight_kg": 20},
        {"reps": 1001, "weight_kg": 20},
        {"reps": 10, "weight_kg": -1},
        {"reps": 10, "weight_kg": 1500.01},
        {"reps": 10, "weight_kg": "20.555"},
        {"reps": 10, "weight_kg": "abc"},
        {"reps": "dez", "weight_kg": 20},
    ],
)
def test_set_validation(client: TestClient, db: Session, payload: dict[str, Any]) -> None:
    create_logged_user(client)
    session = start(client)
    r = post(
        client,
        f"/api/workouts/{session['id']}/sets",
        {"exercise_id": ex_id(db, SUPINO), **payload},
    )
    assert r.status_code == 422
    assert r.json()["erro"]["campos"]


def test_only_one_active_workout(client: TestClient) -> None:
    create_logged_user(client)
    first = start(client)
    r = post(client, "/api/workouts", {})
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "treino_em_andamento"
    assert client.get("/api/workouts/active").json()["id"] == first["id"]
    post(client, f"/api/workouts/{first['id']}/finish")
    assert client.get("/api/workouts/active").json() is None
    start(client)


def test_start_workout_from_split(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    split = put(
        client,
        "/api/splits/B",
        {"name": "Pernas", "exercises": [{"exercise_id": ex_id(db, AGACHAMENTO)}]},
    ).json()
    session = start(client, split_id=split["id"])
    assert session["split"]["letter"] == "B"
    assert post(client, "/api/workouts", {"split_id": 999999}).status_code in (404, 409)


def test_local_date_uses_user_timezone(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    patch(client, "/api/users/me", {"timezone": "Pacific/Kiritimati"})
    session = start(client)
    expected = utcnow().astimezone(ZoneInfo("Pacific/Kiritimati")).date().isoformat()
    assert session["local_date"] == expected
    assert session["timezone"] == "Pacific/Kiritimati"


def _types(records: list[dict[str, Any]]) -> set[str]:
    return {r["record_type"] for r in records}


def test_personal_records_detection(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    session = start(client)

    first = add_set(client, session["id"], sup, 10, 60)
    assert _types(first["new_records"]) == {"max_weight", "max_reps", "max_est_1rm"}
    assert all(r["previous_value"] is None for r in first["new_records"])

    heavier = add_set(client, session["id"], sup, 5, 70)
    by_type = {r["record_type"]: r for r in heavier["new_records"]}
    assert by_type["max_weight"]["value"] == 70
    assert by_type["max_weight"]["previous_value"] == 60
    assert "max_reps" not in by_type

    weaker = add_set(client, session["id"], sup, 3, 40)
    assert weaker["new_records"] == []

    overview = client.get("/api/records").json()
    assert len(overview) == 1
    assert overview[0]["max_weight"]["value"] == 70
    assert overview[0]["max_est_1rm"]["value"] == 81.67

    recent = client.get("/api/records/recent").json()
    assert all(r["previous_value"] is not None for r in recent)
    assert recent[0]["exercise_name"] == SUPINO


def test_bodyweight_exercise_records_reps_only(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    session = start(client)
    res = add_set(client, session["id"], ex_id(db, BARRA_FIXA), 12, 0)
    assert _types(res["new_records"]) == {"max_reps"}


def test_editing_and_deleting_sets_rebuilds_records(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    session = start(client)
    add_set(client, session["id"], sup, 10, 60)
    typo = add_set(client, session["id"], sup, 5, 700)

    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 700
    r = put(
        client,
        f"/api/workouts/{session['id']}/sets/{typo['set']['id']}",
        {"reps": 5, "weight_kg": 70},
    )
    assert r.status_code == 200
    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 70

    third = add_set(client, session["id"], sup, 3, 50)
    assert (
        delete(client, f"/api/workouts/{session['id']}/sets/{typo['set']['id']}").status_code == 204
    )
    detail = client.get(f"/api/workouts/{session['id']}").json()
    numbers = [s["set_number"] for s in detail["exercises"][0]["sets"]]
    assert numbers == [1, 2]
    assert detail["exercises"][0]["sets"][1]["id"] == third["set"]["id"]
    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 60

    assert delete(client, f"/api/workouts/{session['id']}").status_code == 204
    assert client.get("/api/records").json() == []


def test_comparison_with_previous_session(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s1 = start(client)
    add_set(client, s1["id"], sup, 10, 60)
    add_set(client, s1["id"], sup, 8, 65)
    post(client, f"/api/workouts/{s1['id']}/finish")

    s2 = start(client)
    add_set(client, s2["id"], sup, 10, 62.5)
    add_set(client, s2["id"], sup, 9, 67.5)

    block = client.get(f"/api/workouts/{s2['id']}").json()["exercises"][0]
    comp = block["comparison"]
    assert comp["previous_session_id"] == s1["id"]
    assert comp["delta_top_weight_kg"] == 2.5
    assert comp["delta_total_reps"] == 1
    assert comp["delta_volume_kg"] == round((625 + 607.5) - (600 + 520), 2)

    first_block = client.get(f"/api/workouts/{s1['id']}").json()["exercises"][0]
    assert first_block["comparison"] is None

    progress = client.get(f"/api/exercises/{sup}/progress").json()
    assert [p["top_weight_kg"] for p in progress] == [65, 67.5]


def test_history_pagination_and_filters(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup, agach = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO)
    ids = []
    for i in range(3):
        s = start(client)
        add_set(client, s["id"], sup if i % 2 == 0 else agach, 10, 50)
        post(client, f"/api/workouts/{s['id']}/finish")
        ids.append(s["id"])

    page = client.get("/api/workouts", params={"page_size": 2}).json()
    assert page["total"] == 3
    assert [i["id"] for i in page["items"]] == [ids[2], ids[1]]
    page2 = client.get("/api/workouts", params={"page_size": 2, "page": 2}).json()
    assert [i["id"] for i in page2["items"]] == [ids[0]]

    only_squat = client.get("/api/workouts", params={"exercise_id": agach}).json()
    assert [i["id"] for i in only_squat["items"]] == [ids[1]]
    assert only_squat["items"][0]["exercise_names"] == [AGACHAMENTO]

    today = page["items"][0]["local_date"]
    assert (
        client.get("/api/workouts", params={"date_from": today, "date_to": today}).json()["total"]
        == 3
    )
    bad = client.get("/api/workouts", params={"date_from": "2026-02-01", "date_to": "2026-01-01"})
    assert bad.status_code == 400

    cal = client.get("/api/workouts/calendar", params={"month": today[:7]}).json()
    assert cal["days"] == [today]
    assert client.get("/api/workouts/calendar", params={"month": "2026-13"}).status_code == 422


def test_dashboard_and_volume(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    empty = client.get("/api/stats/dashboard").json()
    assert empty["week_workouts"] == 0
    assert empty["last_session"] is None
    assert empty["recent_records"] == []

    sup = ex_id(db, SUPINO)
    s = start(client)
    add_set(client, s["id"], sup, 10, 50)
    add_set(client, s["id"], sup, 10, 55)

    dash = client.get("/api/stats/dashboard").json()
    assert dash["week_workouts"] == 1
    assert dash["week_volume_kg"] == 1050
    assert dash["active_session_id"] == s["id"]
    assert dash["last_session"]["id"] == s["id"]
    assert dash["streak_weeks"] == 1
    assert len(dash["weekly"]) == 8
    assert dash["week_sessions"] == [
        {"id": s["id"], "local_date": s["local_date"], "split_letter": None, "finished": False}
    ]
    assert dash["recent_records"][0]["record_type"] in {"max_weight", "max_est_1rm"}

    months = client.get("/api/stats/volume", params={"period": "month", "count": 3}).json()
    assert len(months) == 3
    assert months[-1]["volume_kg"] == 1050
    assert months[-1]["workouts"] == 1


def test_cannot_add_set_to_finished_workout_but_can_edit(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    first = add_set(client, s["id"], sup, 10, 60)
    post(client, f"/api/workouts/{s['id']}/finish")
    r = post(
        client, f"/api/workouts/{s['id']}/sets", {"exercise_id": sup, "reps": 5, "weight_kg": 100}
    )
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "treino_finalizado"
    r = put(
        client,
        f"/api/workouts/{s['id']}/sets/{first['set']['id']}",
        {"reps": 10, "weight_kg": 62.5},
    )
    assert r.status_code == 200


def test_incremental_records_match_full_rebuild(client: TestClient, db: Session) -> None:
    from app.models import PersonalRecord
    from app.services.records import rebuild_exercise_records

    user = create_logged_user(client)
    sup = ex_id(db, SUPINO)
    plan = [[(10, 60), (8, 70), (12, 55)], [(10, 62.5), (6, 75)], [(15, 40), (10, 70), (8, 70)]]
    for sets in plan:
        s = start(client)
        for reps, kg in sets:
            add_set(client, s["id"], sup, reps, kg)
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
    rebuild_exercise_records(db, user["id"], sup)
    db.commit()
    assert snapshot() == incremental


def test_recreating_archived_exercise_restores_it(client: TestClient) -> None:
    create_logged_user(client)
    first = post(
        client, "/api/exercises", {"name": "Remada Pendlay", "muscle_group": "costas"}
    ).json()
    assert delete(client, f"/api/exercises/{first['id']}").status_code == 204
    again = post(client, "/api/exercises", {"name": "remada pendlay", "muscle_group": "costas"})
    assert again.status_code == 201
    assert again.json()["id"] == first["id"]
    other = post(client, "/api/exercises", {"name": "Outro nome", "muscle_group": "costas"}).json()
    delete(client, f"/api/exercises/{first['id']}")
    clash = put(
        client,
        f"/api/exercises/{other['id']}",
        {"name": "Remada Pendlay", "muscle_group": "costas"},
    )
    assert clash.status_code == 409


def test_names_are_single_line(client: TestClient) -> None:
    create_logged_user(client)
    r = post(client, "/api/exercises", {"name": "Supino\nde lado", "muscle_group": "peito"})
    assert r.status_code == 201
    assert r.json()["name"] == "Supino de lado"


def test_records_per_month_counts_only_beaten_records(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    add_set(client, s["id"], sup, 10, 50)
    add_set(client, s["id"], sup, 10, 60)
    months = client.get("/api/records/per-month", params={"count": 2}).json()
    assert len(months) == 2
    assert months[0]["workouts"] == 0
    assert months[-1]["workouts"] == 2


def test_streak_counts_consecutive_weeks(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    today = utcnow().astimezone(ZoneInfo("America/Sao_Paulo")).date()
    for weeks_ago in (1, 2, 4):
        db.add(
            WorkoutSession(
                user_id=user["id"],
                timezone="America/Sao_Paulo",
                local_date=today - timedelta(weeks=weeks_ago),
                started_at=utcnow() - timedelta(weeks=weeks_ago),
                finished_at=utcnow() - timedelta(weeks=weeks_ago),
            )
        )
    db.commit()
    assert client.get("/api/stats/dashboard").json()["streak_weeks"] == 2


def test_intensity_defaults_to_normal_and_is_listed(client: TestClient) -> None:
    create_logged_user(client)
    s = start(client)
    assert s["intensity"] == "normal"
    items = client.get("/api/workouts").json()["items"]
    assert items[0]["intensity"] == "normal"


def test_new_workout_inherits_the_week_intensity(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    leve = start(client, intensity="leve")
    post(client, f"/api/workouts/{leve['id']}/finish")
    assert start(client)["intensity"] == "leve"


def test_week_intensity_resets_on_a_new_week(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    old = start(client, intensity="pesado")
    post(client, f"/api/workouts/{old['id']}/finish")
    row = db.get(WorkoutSession, old["id"])
    assert row is not None
    row.local_date -= timedelta(days=7)
    row.started_at -= timedelta(days=7)
    db.commit()
    assert start(client)["intensity"] == "normal"


def test_patch_changes_only_the_fields_sent(client: TestClient) -> None:
    create_logged_user(client)
    s = start(client, notes="Joelho bom hoje")
    r = patch(client, f"/api/workouts/{s['id']}", {"intensity": "pesado"})
    assert r.status_code == 200, r.text
    assert r.json()["intensity"] == "pesado"
    assert r.json()["notes"] == "Joelho bom hoje"
    r = patch(client, f"/api/workouts/{s['id']}", {"notes": None})
    assert r.json()["intensity"] == "pesado" and r.json()["notes"] is None
    assert patch(client, f"/api/workouts/{s['id']}", {"intensity": "x"}).status_code == 422


def test_comparison_only_with_the_same_intensity(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    normal = start(client)
    add_set(client, normal["id"], sup, 10, 80)
    post(client, f"/api/workouts/{normal['id']}/finish")
    leve = start(client, intensity="leve")
    add_set(client, leve["id"], sup, 8, 50)
    post(client, f"/api/workouts/{leve['id']}/finish")

    leve_block = client.get(f"/api/workouts/{leve['id']}").json()["exercises"][0]
    assert leve_block["comparison"] is None

    again = start(client, intensity="normal")
    add_set(client, again["id"], sup, 10, 82.5)
    comp = client.get(f"/api/workouts/{again['id']}").json()["exercises"][0]["comparison"]
    assert comp["previous_session_id"] == normal["id"]
    assert comp["delta_top_weight_kg"] == 2.5
