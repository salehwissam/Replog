import re
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, select
from sqlalchemy.orm import Session

from app.models import Exercise, WorkoutSession, WorkoutSet, WorkoutSplit
from app.seeds.exercises import seed_exercises
from app.services.achievements import DEFINITIONS
from app.services.records import rebuild_exercise_records
from tests.helpers import create_logged_user, post

SUPINO = "Supino reto com barra"
AGACHAMENTO = "Agachamento livre"
LUCIDE_ICONS = {
    "dumbbell", "calendar-check", "medal", "crown", "flame", "zap", "calendar-range",
    "trophy", "award", "star", "biceps-flexed", "weight", "mountain", "rocket", "repeat",
    "sunrise", "moon", "timer", "target", "compass",
}  # fmt: skip
T0 = datetime(2026, 11, 2, 18, 0, tzinfo=UTC)

SetSpec = tuple[Any, ...]


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name, Exercise.user_id.is_(None)))
    assert value is not None
    return value


def catalog_ids(db: Session, count: int) -> list[int]:
    return list(
        db.scalars(
            select(Exercise.id).where(Exercise.user_id.is_(None)).order_by(Exercise.id).limit(count)
        )
    )


def add_workout(
    db: Session,
    user_id: int,
    started_at: datetime,
    sets: Sequence[SetSpec],
    *,
    tz: str = "America/Sao_Paulo",
    split_id: int | None = None,
) -> WorkoutSession:
    session = WorkoutSession(
        user_id=user_id,
        split_id=split_id,
        started_at=started_at,
        timezone=tz,
        local_date=started_at.astimezone(ZoneInfo(tz)).date(),
    )
    db.add(session)
    db.flush()
    numbers: dict[int, int] = {}
    last = started_at
    for spec in sets:
        exercise_id, reps, weight, minutes = spec[:4]
        set_type = spec[4] if len(spec) > 4 else "normal"
        numbers[exercise_id] = numbers.get(exercise_id, 0) + 1
        last = started_at + timedelta(minutes=minutes)
        db.add(
            WorkoutSet(
                session_id=session.id,
                user_id=user_id,
                exercise_id=exercise_id,
                set_number=numbers[exercise_id],
                reps=reps,
                weight_kg=Decimal(str(weight)),
                set_type=set_type,
                performed_at=last,
            )
        )
    session.finished_at = last + timedelta(minutes=1)
    db.flush()
    for exercise_id in numbers:
        rebuild_exercise_records(db, user_id, exercise_id)
    db.commit()
    return session


def achievements(client: TestClient) -> dict[str, dict[str, Any]]:
    r = client.get("/api/achievements")
    assert r.status_code == 200, r.text
    return {a["key"]: a for a in r.json()}


def at(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def test_requires_login(client: TestClient) -> None:
    assert client.get("/api/achievements").status_code == 401


def test_new_account_everything_locked(client: TestClient) -> None:
    create_logged_user(client)
    r = client.get("/api/achievements")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 12
    assert len({a["key"] for a in items}) == len(items)
    for a in items:
        assert set(a) == {
            "key", "title", "description", "icon", "tier", "unlocked",
            "unlocked_at", "progress", "current", "target",
        }  # fmt: skip
        assert a["unlocked"] is False
        assert a["unlocked_at"] is None
        assert a["progress"] == 0
        assert a["current"] == 0
        assert a["target"] > 0


def test_icons_tiers_and_texts_are_valid() -> None:
    assert len(DEFINITIONS) >= 12
    tiers = {d.tier for d in DEFINITIONS}
    assert tiers == {"bronze", "prata", "ouro"}
    for d in DEFINITIONS:
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", d.key)
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", d.icon)
        assert d.icon in LUCIDE_ICONS, d.icon
        assert d.title and d.description.endswith((".", "!"))


def test_first_workout_via_api_unlocks(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    session = post(client, "/api/workouts", {}).json()
    r = post(
        client,
        f"/api/workouts/{session['id']}/sets",
        {"exercise_id": ex_id(db, SUPINO), "reps": 10, "weight_kg": 40},
    )
    assert r.status_code == 201
    first = achievements(client)["primeiro-treino"]
    assert first["unlocked"] is True
    assert first["progress"] == 1
    assert at(first["unlocked_at"]) == at(r.json()["set"]["performed_at"])


def test_partial_progress_and_unlock_moment(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    for week in range(3):
        add_workout(db, user["id"], T0 + timedelta(weeks=week), [(supino, 10, 40, 5)])

    data = achievements(client)
    first = data["primeiro-treino"]
    assert first["unlocked"] is True
    assert at(first["unlocked_at"]) == T0 + timedelta(minutes=5)

    ten = data["treinos-10"]
    assert (ten["unlocked"], ten["current"], ten["target"], ten["progress"]) == (False, 3, 10, 0.3)
    assert ten["unlocked_at"] is None

    streak = data["sequencia-4-semanas"]
    assert (streak["current"], streak["progress"], streak["unlocked"]) == (3, 0.75, False)

    add_workout(db, user["id"], T0 + timedelta(weeks=3), [(supino, 10, 40, 7)])
    streak = achievements(client)["sequencia-4-semanas"]
    assert streak["unlocked"] is True
    assert at(streak["unlocked_at"]) == T0 + timedelta(weeks=3, minutes=7)


def test_streak_uses_best_run_and_resets_on_gap(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    for week in (0, 1, 3, 4, 5):
        add_workout(db, user["id"], T0 + timedelta(weeks=week), [(supino, 10, 40, 1)])
    streak = achievements(client)["sequencia-4-semanas"]
    assert streak["current"] == 3
    assert streak["unlocked"] is False


def test_warmup_does_not_count(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    add_workout(db, user["id"], T0, [(supino, 20, 500, 1, "aquecimento")])
    data = achievements(client)
    assert data["series-100"]["current"] == 0
    assert data["primeiro-treino"]["unlocked"] is False
    assert data["repeticoes-1000"]["current"] == 0

    specs: list[SetSpec] = []
    for minute in range(1, 101):
        specs.append((supino, 10, 40, minute))
        if minute % 25 == 0:
            specs.append((supino, 10, 20, minute, "aquecimento"))
    add_workout(db, user["id"], T0 + timedelta(days=1), specs)
    series = achievements(client)["series-100"]
    assert series["current"] == 100
    assert series["target"] == 100
    assert series["unlocked"] is True
    assert at(series["unlocked_at"]) == T0 + timedelta(days=1, minutes=100)
    assert achievements(client)["series-500"]["progress"] == pytest.approx(0.2)


def test_records_beaten(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    add_workout(db, user["id"], T0, [(supino, 10, 60, 5)])
    assert achievements(client)["primeiro-recorde"]["unlocked"] is False

    add_workout(db, user["id"], T0 + timedelta(days=2), [(supino, 10, 62.5, 4)])
    data = achievements(client)
    first = data["primeiro-recorde"]
    assert first["unlocked"] is True
    assert at(first["unlocked_at"]) == T0 + timedelta(days=2, minutes=4)
    assert data["recordes-10"]["current"] >= 1
    assert data["recordes-10"]["unlocked"] is False


def test_local_time_respects_workout_timezone(
    client: TestClient, make_client: Any, db: Session
) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    early = datetime(2026, 11, 3, 9, 30, tzinfo=UTC)
    add_workout(db, user["id"], early, [(supino, 10, 40, 2)], tz="America/Sao_Paulo")
    late = datetime(2026, 11, 5, 1, 30, tzinfo=UTC)
    add_workout(db, user["id"], late, [(supino, 10, 40, 3)], tz="America/Sao_Paulo")
    data = achievements(client)
    assert data["madrugador"]["unlocked"] is True
    assert at(data["madrugador"]["unlocked_at"]) == early + timedelta(minutes=2)
    assert data["coruja"]["unlocked"] is True
    assert at(data["coruja"]["unlocked_at"]) == late + timedelta(minutes=3)

    other = make_client()
    other_user = create_logged_user(other, "bia@exemplo.com")
    add_workout(db, other_user["id"], early, [(supino, 10, 40, 2)], tz="UTC")
    add_workout(db, other_user["id"], late, [(supino, 10, 40, 2)], tz="Asia/Tokyo")
    data = achievements(other)
    assert data["madrugador"]["unlocked"] is False
    assert data["coruja"]["unlocked"] is False


def test_session_challenges(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    ids = catalog_ids(db, 15)
    squat = ex_id(db, AGACHAMENTO)
    add_workout(
        db,
        user["id"],
        T0,
        [(ids[i], 10, 20, i + 1) for i in range(5)] + [(ids[0], 10, 20, 95)],
    )
    add_workout(
        db,
        user["id"],
        T0 + timedelta(days=1),
        [(ids[i], 8, 30, i) for i in range(5, 15)] + [(squat, 5, 100, 30)],
    )
    data = achievements(client)

    long = data["treino-longo"]
    assert (long["unlocked"], long["current"], long["target"]) == (True, 95, 90)
    assert at(long["unlocked_at"]) == T0 + timedelta(minutes=90)

    variety = data["treino-variado"]
    assert variety["unlocked"] is True
    assert at(variety["unlocked_at"]) == T0 + timedelta(minutes=5)

    explorer = data["explorador"]
    assert explorer["current"] >= 15
    assert explorer["unlocked"] is True
    assert at(explorer["unlocked_at"]) == T0 + timedelta(days=1, minutes=14)

    heavy = data["clube-100kg"]
    assert (heavy["unlocked"], heavy["current"]) == (True, 100)
    assert at(heavy["unlocked_at"]) == T0 + timedelta(days=1, minutes=30)


def test_heavy_lift_ignores_warmup_and_other_exercises(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    squat = ex_id(db, AGACHAMENTO)
    leg_press = ex_id(db, "Leg press 45°")
    add_workout(
        db,
        user["id"],
        T0,
        [(squat, 3, 120, 1, "aquecimento"), (squat, 5, 80, 5), (leg_press, 10, 200, 10)],
    )
    heavy = achievements(client)["clube-100kg"]
    assert (heavy["unlocked"], heavy["current"], heavy["progress"]) == (False, 80, 0.8)


def test_full_week_with_all_splits(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    splits = [WorkoutSplit(user_id=user["id"], letter=x, name=f"Treino {x}") for x in "ABC"]
    db.add_all(splits)
    db.commit()
    a, b, c = (s.id for s in splits)
    add_workout(db, user["id"], T0, [(supino, 10, 40, 1)], split_id=a)
    add_workout(db, user["id"], T0 + timedelta(days=2), [(supino, 10, 40, 1)], split_id=b)
    week = achievements(client)["semana-completa"]
    assert (week["current"], week["target"], week["unlocked"]) == (2, 3, False)
    for i, split in enumerate((c, a, b)):
        add_workout(
            db, user["id"], T0 + timedelta(weeks=1, days=i), [(supino, 10, 40, 2)], split_id=split
        )
    week = achievements(client)["semana-completa"]
    assert week["unlocked"] is True
    assert at(week["unlocked_at"]) == T0 + timedelta(weeks=1, days=2, minutes=2)


def test_isolation_between_users(client: TestClient, make_client: Any, db: Session) -> None:
    owner = create_logged_user(client)
    ids = catalog_ids(db, 6)
    for day in range(12):
        add_workout(
            db,
            owner["id"],
            T0 + timedelta(weeks=day),
            [(i, 20, 200 + day, n) for n, i in enumerate(ids)],
        )
    assert achievements(client)["treinos-10"]["unlocked"] is True

    other = make_client()
    create_logged_user(other, "bia@exemplo.com")
    for a in achievements(other).values():
        assert a["unlocked"] is False
        assert a["current"] == 0


def test_query_count_does_not_grow_with_data(
    client: TestClient, db: Session, engine: Engine
) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    statements: list[str] = []

    def count(*args: Any) -> None:
        statements.append(args[2])

    add_workout(db, user["id"], T0, [(supino, 10, 40, 1)])
    event.listen(engine, "before_cursor_execute", count)
    try:
        achievements(client)
        few = len(statements)
        statements.clear()
        for day in range(1, 15):
            add_workout(db, user["id"], T0 + timedelta(days=day), [(supino, 10, 40, 1)] * 3)
        statements.clear()
        achievements(client)
        assert len(statements) == few
    finally:
        event.remove(engine, "before_cursor_execute", count)
