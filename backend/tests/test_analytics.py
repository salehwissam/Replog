from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, select
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID
from app.db.base import utcnow
from app.models import Exercise, WorkoutSession, WorkoutSet
from app.seeds.exercises import seed_exercises
from app.services.analytics import best_streak, current_streak
from app.services.stats import week_start
from tests.helpers import create_logged_user, patch, post, put

SUPINO = "Supino reto com barra"
AGACHAMENTO = "Agachamento livre"
REMADA = "Remada curvada com barra"
TZ = "America/Sao_Paulo"


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name))
    assert value is not None
    return value


def today_in(tz: str = TZ) -> date:
    return utcnow().astimezone(ZoneInfo(tz)).date()


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    r = post(client, "/api/workouts", body)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def add_set(
    client: TestClient,
    session_id: int,
    exercise_id: int,
    reps: int,
    weight: float,
    set_type: str = "normal",
) -> None:
    r = post(
        client,
        f"/api/workouts/{session_id}/sets",
        {"exercise_id": exercise_id, "reps": reps, "weight_kg": weight, "set_type": set_type},
    )
    assert r.status_code == 201, r.text


def finish(client: TestClient, session_id: int) -> None:
    assert post(client, f"/api/workouts/{session_id}/finish").status_code == 200


def make_split(client: TestClient, letter: str, exercise_id: int) -> int:
    r = put(
        client,
        f"/api/splits/{letter}",
        {"name": "Peito", "exercises": [{"exercise_id": exercise_id}]},
    )
    assert r.status_code == 200, r.text
    split_id: int = r.json()["id"]
    return split_id


def insert_session(
    db: Session,
    user_id: int,
    local_date: date,
    sets: Sequence[tuple[int, int, str, str]] = (),
) -> int:
    moment = utcnow() - timedelta(days=(today_in() - local_date).days)
    session = WorkoutSession(
        user_id=user_id,
        timezone=TZ,
        local_date=local_date,
        started_at=moment,
        finished_at=moment + timedelta(hours=1),
    )
    db.add(session)
    db.flush()
    for number, (exercise_id, reps, weight, set_type) in enumerate(sets, 1):
        db.add(
            WorkoutSet(
                session_id=session.id,
                user_id=user_id,
                exercise_id=exercise_id,
                set_number=number,
                reps=reps,
                weight_kg=Decimal(weight),
                set_type=set_type,
                performed_at=moment,
            )
        )
    db.commit()
    return session.id


ROUTES = [
    "/api/analytics/summary",
    "/api/analytics/muscles",
    "/api/analytics/heatmap",
    "/api/analytics/sessions/1/summary",
]


@pytest.mark.parametrize("url", ROUTES)
def test_requires_login(client: TestClient, url: str) -> None:
    assert client.get(url).status_code == 401


def test_summary_empty_user(client: TestClient) -> None:
    create_logged_user(client)
    assert client.get("/api/analytics/summary").json() == {
        "total_workouts": 0,
        "total_sets": 0,
        "total_reps": 0,
        "total_volume_kg": 0.0,
        "records_beaten": 0,
        "current_streak_weeks": 0,
        "best_streak_weeks": 0,
        "first_workout_date": None,
        "favorite_exercise": None,
        "heaviest_set": None,
    }


def test_summary_totals_ignore_warmup(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup, aga = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO)

    s1 = start(client)
    add_set(client, s1["id"], sup, 10, 20, "aquecimento")
    add_set(client, s1["id"], sup, 10, 50)
    add_set(client, s1["id"], sup, 8, 60)
    finish(client, s1["id"])

    s2 = start(client)
    add_set(client, s2["id"], sup, 15, 30, "aquecimento")
    add_set(client, s2["id"], sup, 10, 62.5, "falha")
    add_set(client, s2["id"], aga, 5, 100, "drop")
    finish(client, s2["id"])

    data = client.get("/api/analytics/summary").json()
    assert data["total_workouts"] == 2
    assert data["total_sets"] == 4
    assert data["total_reps"] == 10 + 8 + 10 + 5
    assert data["total_volume_kg"] == 500 + 480 + 625 + 500
    assert data["first_workout_date"] == today_in().isoformat()
    assert data["current_streak_weeks"] == 1
    assert data["best_streak_weeks"] == 1
    assert data["favorite_exercise"] == {"id": sup, "name": SUPINO, "sessions": 2}
    assert data["heaviest_set"] == {
        "exercise_id": aga,
        "name": AGACHAMENTO,
        "weight_kg": 100.0,
        "reps": 5,
        "date": today_in().isoformat(),
    }

    items = client.get("/api/workouts").json()["items"]
    expected = sum(i["records_count"] for i in items)
    assert expected > 0
    assert data["records_beaten"] == expected


def test_favorite_exercise_tie_break_and_warmup(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    sup, aga, rem = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO), ex_id(db, REMADA)
    today = today_in()
    for days_ago in (1, 2, 3):
        insert_session(
            db, user["id"], today - timedelta(days=days_ago), [(rem, 10, "40", "aquecimento")]
        )
    insert_session(db, user["id"], today, [(sup, 10, "50", "normal"), (aga, 10, "80", "normal")])

    fav = client.get("/api/analytics/summary").json()["favorite_exercise"]
    assert fav == {"id": aga, "name": AGACHAMENTO, "sessions": 1}


def test_best_streak_with_gaps(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    today = today_in()
    for weeks_ago in (1, 2, 5, 6, 7, 8):
        insert_session(db, user["id"], today - timedelta(weeks=weeks_ago))
    extra = week_start(today - timedelta(weeks=8))
    insert_session(db, user["id"], extra)

    data = client.get("/api/analytics/summary").json()
    assert data["total_workouts"] == 7
    assert data["current_streak_weeks"] == 2
    assert data["best_streak_weeks"] == 4
    assert data["first_workout_date"] == min(extra, today - timedelta(weeks=8)).isoformat()
    assert data["total_sets"] == 0
    assert data["favorite_exercise"] is None


def test_streak_functions() -> None:
    monday = date(2026, 11, 9)
    weeks = {monday - timedelta(weeks=n) for n in (0, 1, 3, 4, 5)}
    assert current_streak(weeks, monday + timedelta(days=3)) == 2
    assert current_streak(weeks, monday + timedelta(weeks=1)) == 2
    assert current_streak(weeks, monday + timedelta(weeks=2)) == 0
    assert best_streak(weeks) == 3
    assert best_streak([]) == 0
    assert best_streak([monday]) == 1
    assert current_streak(set(), monday) == 0


def test_muscles_groups_and_warmup(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup, aga = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO)
    s = start(client)
    add_set(client, s["id"], sup, 10, 20, "aquecimento")
    add_set(client, s["id"], sup, 10, 50)
    add_set(client, s["id"], sup, 10, 50)
    add_set(client, s["id"], sup, 8, 55.5)
    add_set(client, s["id"], aga, 5, 100)
    add_set(client, s["id"], aga, 5, 100)
    finish(client, s["id"])

    assert client.get("/api/analytics/muscles").json() == [
        {"muscle_group": "peito", "label": "Peito", "sets": 3, "volume_kg": 1444.0},
        {"muscle_group": "quadriceps", "label": "Quadríceps", "sets": 2, "volume_kg": 1000.0},
    ]


def test_muscles_window_starts_on_week_start(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    sup, rem, aga = ex_id(db, SUPINO), ex_id(db, REMADA), ex_id(db, AGACHAMENTO)
    first_day = week_start(today_in()) - timedelta(weeks=1)
    insert_session(db, user["id"], first_day, [(sup, 10, "50", "normal")])
    insert_session(db, user["id"], first_day - timedelta(days=1), [(rem, 10, "40", "normal")])
    insert_session(db, user["id"], first_day, [(aga, 10, "20", "aquecimento")])

    groups = client.get("/api/analytics/muscles", params={"weeks": 2}).json()
    assert [g["muscle_group"] for g in groups] == ["peito"]
    groups = client.get("/api/analytics/muscles", params={"weeks": 3}).json()
    assert {g["muscle_group"] for g in groups} == {"peito", "costas"}


@pytest.mark.parametrize(
    ("weeks", "status"), [(0, 422), (53, 422), ("x", 422), (1, 200), (52, 200)]
)
def test_muscles_param_limits(client: TestClient, weeks: Any, status: int) -> None:
    create_logged_user(client)
    assert client.get("/api/analytics/muscles", params={"weeks": weeks}).status_code == status


def test_heatmap_all_days_with_zeros(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    sup = ex_id(db, SUPINO)
    today = today_in()
    s = start(client)
    add_set(client, s["id"], sup, 10, 20, "aquecimento")
    add_set(client, s["id"], sup, 10, 50)
    finish(client, s["id"])
    insert_session(db, user["id"], today - timedelta(days=3))
    insert_session(db, user["id"], today - timedelta(days=3), [(sup, 5, "40", "normal")])
    insert_session(db, user["id"], today - timedelta(days=7), [(sup, 5, "40", "normal")])

    days = client.get("/api/analytics/heatmap", params={"days": 7}).json()
    assert len(days) == 7
    assert [d["date"] for d in days] == [
        (today - timedelta(days=n)).isoformat() for n in range(6, -1, -1)
    ]
    by_date = {d["date"]: d for d in days}
    assert by_date[today.isoformat()] == {
        "date": today.isoformat(),
        "volume_kg": 500.0,
        "workouts": 1,
        "sets": 1,
    }
    three = (today - timedelta(days=3)).isoformat()
    assert by_date[three] == {"date": three, "volume_kg": 200.0, "workouts": 2, "sets": 1}
    zeros = [d for d in days if d["date"] not in (today.isoformat(), three)]
    assert len(zeros) == 5
    assert all(d["volume_kg"] == 0 and d["workouts"] == 0 for d in zeros)

    default = client.get("/api/analytics/heatmap").json()
    assert len(default) == 182
    assert default[-1]["date"] == today.isoformat()


@pytest.mark.parametrize(("days", "status"), [(6, 422), (367, 422), (0, 422), (7, 200), (366, 200)])
def test_heatmap_param_limits(client: TestClient, days: int, status: int) -> None:
    create_logged_user(client)
    r = client.get("/api/analytics/heatmap", params={"days": days})
    assert r.status_code == status
    if status == 200:
        assert len(r.json()) == days


def test_heatmap_uses_user_timezone(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    patch(client, "/api/users/me", {"timezone": "Pacific/Kiritimati"})
    s = start(client)
    add_set(client, s["id"], ex_id(db, SUPINO), 10, 50)
    local_today = today_in("Pacific/Kiritimati").isoformat()
    assert s["local_date"] == local_today

    days = client.get("/api/analytics/heatmap", params={"days": 7}).json()
    assert days[-1] == {"date": local_today, "volume_kg": 500.0, "workouts": 1, "sets": 1}
    summary = client.get("/api/analytics/summary").json()
    assert summary["first_workout_date"] == local_today
    assert client.get("/api/analytics/muscles", params={"weeks": 1}).json()[0]["sets"] == 1


def test_session_summary_with_previous_same_split(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup, aga, rem = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO), ex_id(db, REMADA)
    split_a = make_split(client, "A", sup)

    s1 = start(client, split_id=split_a)
    add_set(client, s1["id"], sup, 10, 20, "aquecimento")
    add_set(client, s1["id"], sup, 10, 50)
    add_set(client, s1["id"], sup, 10, 50)
    finish(client, s1["id"])

    free = start(client)
    add_set(client, free["id"], rem, 10, 40)
    finish(client, free["id"])

    only_warmup = start(client, split_id=split_a)
    add_set(client, only_warmup["id"], sup, 10, 20, "aquecimento")
    finish(client, only_warmup["id"])

    s2 = start(client, split_id=split_a)
    add_set(client, s2["id"], sup, 10, 20, "aquecimento")
    for _ in range(3):
        add_set(
            client, s2["id"], sup, 10, 60
        )
    add_set(client, s2["id"], aga, 5, 100)
    finish(client, s2["id"])

    data = client.get(f"/api/analytics/sessions/{s2['id']}/summary").json()
    assert data["session_id"] == s2["id"]
    assert data["volume_kg"] == 2300.0
    assert data["sets"] == 4
    assert data["reps"] == 35
    assert isinstance(data["duration_seconds"], int)
    assert data["duration_seconds"] >= 0
    assert data["muscle_groups"] == [
        {"muscle_group": "peito", "label": "Peito", "sets": 3},
        {"muscle_group": "quadriceps", "label": "Quadríceps", "sets": 1},
    ]
    assert data["previous_same_split"] == {
        "session_id": s1["id"],
        "local_date": s1["local_date"],
        "volume_kg": 1000.0,
        "sets": 2,
    }
    assert data["delta_volume_kg"] == 1300.0
    detail = client.get(f"/api/workouts/{s2['id']}").json()
    beaten = [r for r in detail["records"] if r["previous_value"] is not None]
    assert data["records_beaten"] == len(beaten) == 2

    first = client.get(f"/api/analytics/sessions/{s1['id']}/summary").json()
    assert first["previous_same_split"] is None
    assert first["delta_volume_kg"] is None
    assert first["records_beaten"] == 0

    livre = client.get(f"/api/analytics/sessions/{free['id']}/summary").json()
    assert livre["previous_same_split"] is None
    assert livre["delta_volume_kg"] is None
    assert livre["muscle_groups"] == [{"muscle_group": "costas", "label": "Costas", "sets": 1}]

    warm = client.get(f"/api/analytics/sessions/{only_warmup['id']}/summary").json()
    assert warm["sets"] == 0
    assert warm["volume_kg"] == 0
    assert warm["muscle_groups"] == []
    assert warm["previous_same_split"]["session_id"] == s1["id"]
    assert warm["delta_volume_kg"] == -1000.0


def test_session_summary_active_session_has_no_duration(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    s = start(client)
    add_set(client, s["id"], ex_id(db, SUPINO), 10, 50)
    data = client.get(f"/api/analytics/sessions/{s['id']}/summary").json()
    assert data["duration_seconds"] is None
    assert data["volume_kg"] == 500.0


@pytest.mark.parametrize(
    ("session_id", "status"), [(0, 422), (-1, 422), (MAX_ID + 1, 422), (MAX_ID, 404)]
)
def test_session_summary_param_limits(client: TestClient, session_id: int, status: int) -> None:
    create_logged_user(client)
    assert client.get(f"/api/analytics/sessions/{session_id}/summary").status_code == status


def test_isolation_between_users(client: TestClient, make_client: Any, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db, SUPINO)
    s = start(client)
    add_set(client, s["id"], sup, 10, 50)
    finish(client, s["id"])

    other = make_client()
    create_logged_user(other, "bia@exemplo.com")
    r = other.get(f"/api/analytics/sessions/{s['id']}/summary")
    assert r.status_code == 404
    summary = other.get("/api/analytics/summary").json()
    assert summary["total_workouts"] == 0
    assert summary["total_volume_kg"] == 0
    assert summary["favorite_exercise"] is None
    assert other.get("/api/analytics/muscles").json() == []
    heat = other.get("/api/analytics/heatmap", params={"days": 7}).json()
    assert all(d["workouts"] == 0 and d["volume_kg"] == 0 for d in heat)

    assert client.get(f"/api/analytics/sessions/{s['id']}/summary").status_code == 200
    assert client.get("/api/analytics/summary").json()["total_workouts"] == 1


@contextmanager
def count_queries(engine: Engine) -> Iterator[list[str]]:
    statements: list[str] = []

    def _on_execute(*args: Any) -> None:
        statements.append(str(args[2]))

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


def test_query_count_does_not_grow_with_history(
    client: TestClient, db: Session, engine: Engine
) -> None:
    user = create_logged_user(client)
    sup, aga = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO)
    split_a = make_split(client, "A", sup)
    today = today_in()

    def add_history(n: int) -> None:
        for i in range(n):
            sid = insert_session(
                db,
                user["id"],
                today - timedelta(days=i),
                [
                    (sup, 10, "50", "normal"),
                    (aga, 5, "80", "normal"),
                    (sup, 10, "20", "aquecimento"),
                ],
            )
            db.get_one(WorkoutSession, sid).split_id = split_a
        db.commit()

    def measure() -> list[int]:
        last = db.scalar(
            select(WorkoutSession.id).order_by(WorkoutSession.started_at.desc()).limit(1)
        )
        counts = []
        for url in (
            "/api/analytics/summary",
            "/api/analytics/muscles?weeks=52",
            "/api/analytics/heatmap?days=366",
            f"/api/analytics/sessions/{last}/summary",
        ):
            with count_queries(engine) as statements:
                assert client.get(url).status_code == 200
            counts.append(len(statements))
        return counts

    add_history(3)
    small = measure()
    add_history(40)
    assert measure() == small


def test_heaviest_set_ignores_warmup_and_breaks_ties_by_reps(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    sup, aga = ex_id(db, SUPINO), ex_id(db, AGACHAMENTO)
    s = start(client)
    add_set(client, s["id"], aga, 3, 140, "aquecimento")
    add_set(client, s["id"], sup, 4, 120)
    add_set(client, s["id"], aga, 6, 120)
    add_set(client, s["id"], aga, 10, 0)
    heaviest = client.get("/api/analytics/summary").json()["heaviest_set"]
    assert heaviest["exercise_id"] == aga
    assert (heaviest["weight_kg"], heaviest["reps"]) == (120.0, 6)
