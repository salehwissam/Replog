import contextlib
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from threading import Barrier, BrokenBarrierError
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, func, select
from sqlalchemy.orm import Session, sessionmaker

import app.services.stats as stats_module
import app.services.workouts as workouts_module
from app.core.config import get_settings
from app.db.base import Base, utcnow
from app.db.session import build_engine, get_db
from app.main import create_app
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet
from app.repositories.workouts import WorkoutRepository
from app.seeds.exercises import seed_exercises
from tests.helpers import create_logged_user, csrf_headers, delete, login, patch, post, put

SUPINO = "Supino reto com barra"


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str = SUPINO) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name, Exercise.user_id.is_(None)))
    assert value is not None
    return value


def start(client: TestClient, **body: Any) -> dict[str, Any]:
    r = post(client, "/api/workouts", body)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def add_set(client: TestClient, sid: int, exercise_id: int, reps: int, weight: Any) -> Any:
    return post(
        client,
        f"/api/workouts/{sid}/sets",
        {"exercise_id": exercise_id, "reps": reps, "weight_kg": weight},
    )


def finish(client: TestClient, sid: int) -> None:
    assert post(client, f"/api/workouts/{sid}/finish").status_code == 200


@pytest.fixture
def file_app(tmp_path: Path) -> Iterator[FastAPI]:
    eng = build_engine(f"sqlite:///{tmp_path / 'race.db'}")
    Base.metadata.create_all(eng)
    factory = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)
    with factory() as s:
        seed_exercises(s)
    application = create_app(get_settings())

    def _get_db() -> Iterator[Session]:
        s = factory()
        try:
            yield s
        finally:
            s.close()

    application.dependency_overrides[get_db] = _get_db
    application.state.test_factory = factory
    yield application
    eng.dispose()


def _barrier_wrap(original: Callable[..., Any], parties: int) -> Callable[..., Any]:
    barrier = Barrier(parties)

    def wrapper(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        with contextlib.suppress(BrokenBarrierError):
            barrier.wait(timeout=10)
        return result

    return wrapper


def test_ACHADO_W01_record_rebuild_cost_grows_with_history(
    client: TestClient, db: Session, engine: Engine
) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    uid = db.scalar(select(User.id))
    assert uid is not None
    base = utcnow() - timedelta(hours=2)
    old = WorkoutSession(
        user_id=uid,
        timezone="UTC",
        local_date=base.date(),
        started_at=base,
        finished_at=base + timedelta(hours=1),
    )
    db.add(old)
    db.commit()
    sid = start(client)["id"]
    db.add_all(
        WorkoutSet(
            session_id=old.id,
            user_id=uid,
            exercise_id=sup,
            set_number=i + 1,
            reps=5,
            weight_kg=Decimal(20) + Decimal(i) / 4,
            performed_at=base + timedelta(seconds=i),
        )
        for i in range(300)
    )
    db.commit()
    from app.services.records import rebuild_exercise_records

    rebuild_exercise_records(db, uid, sup)
    db.commit()
    assert add_set(client, sid, sup, 5, 20).status_code == 201

    raw = engine.raw_connection()
    try:
        before = raw.driver_connection.total_changes  # type: ignore[union-attr]
        assert add_set(client, sid, sup, 5, 20).status_code == 201
        changed = raw.driver_connection.total_changes - before  # type: ignore[union-attr]
    finally:
        raw.close()
    assert changed <= 50, f"uma série nova gravou/apagou {changed} linhas no banco"


def test_ACHADO_W02_recreating_archived_exercise_name_gives_500(app: FastAPI) -> None:
    with TestClient(app, base_url="http://testserver", raise_server_exceptions=False) as c:
        create_logged_user(c)
        body = {"name": "Meu Supino Especial", "muscle_group": "peito"}
        first = post(c, "/api/exercises", body)
        assert first.status_code == 201
        assert delete(c, f"/api/exercises/{first.json()['id']}").status_code == 204
        again = post(c, "/api/exercises", body)
        assert again.status_code in (201, 409), f"recriar após arquivar: {again.status_code}"
        other = post(c, "/api/exercises", {"name": "Outro Nome", "muscle_group": "peito"})
        if other.status_code == 201:
            r = put(c, f"/api/exercises/{other.json()['id']}", body)
            assert r.status_code in (200, 409), f"renomear para nome arquivado: {r.status_code}"


def test_ACHADO_W03_late_set_in_finished_session_rewrites_record_history(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    s1 = start(client)["id"]
    assert add_set(client, s1, sup, 5, 60).status_code == 201
    finish(client, s1)
    s2 = start(client)["id"]
    assert add_set(client, s2, sup, 5, 80).status_code == 201
    finish(client, s2)

    late = add_set(client, s1, sup, 5, 100)
    if late.status_code == 201:
        history = client.get(f"/api/exercises/{sup}/records").json()
        s2_weight = [
            r for r in history if r["session_id"] == s2 and r["record_type"] == "max_weight"
        ]
        assert s2_weight, "o recorde de 80 kg da sessão 2 sumiu do histórico"
    else:
        assert late.status_code in (400, 409)


def test_ACHADO_W04a_concurrent_sets_get_duplicate_numbers_on_sqlite(
    file_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = TestClient(file_app, base_url="http://testserver")
    create_logged_user(first)
    second = TestClient(file_app, base_url="http://testserver")

    assert login(second, "ana@exemplo.com").status_code == 200
    sid = start(first)["id"]
    with file_app.state.test_factory() as s:
        sup = s.scalar(select(Exercise.id).where(Exercise.name == SUPINO))

    monkeypatch.setattr(
        WorkoutRepository,
        "next_set_number",
        _barrier_wrap(WorkoutRepository.next_set_number, 2),
    )
    clients = [first, second]
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(lambda c: add_set(c, sid, sup, 5, 50).status_code, clients))
    assert codes == [201, 201]
    with file_app.state.test_factory() as s:
        numbers = sorted(
            s.scalars(select(WorkoutSet.set_number).where(WorkoutSet.session_id == sid))
        )
    assert numbers == [1, 2], f"números de série duplicados: {numbers}"


def test_ACHADO_W04b_two_active_workouts_on_sqlite(
    file_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = TestClient(file_app, base_url="http://testserver")
    create_logged_user(first)
    second = TestClient(file_app, base_url="http://testserver")

    assert login(second, "ana@exemplo.com").status_code == 200
    monkeypatch.setattr(
        WorkoutRepository, "get_active", _barrier_wrap(WorkoutRepository.get_active, 2)
    )
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(lambda c: post(c, "/api/workouts", {}).status_code, [first, second]))
    with file_app.state.test_factory() as s:
        active = s.scalar(
            select(func.count(WorkoutSession.id)).where(WorkoutSession.finished_at.is_(None))
        )
    assert active == 1, f"{active} treinos ativos ao mesmo tempo (respostas {codes})"


def test_ACHADO_W05_exercise_name_accepts_line_breaks(client: TestClient) -> None:
    create_logged_user(client)
    r = post(client, "/api/exercises", {"name": "Supino\n\n\nfalso", "muscle_group": "peito"})
    assert r.status_code == 422 or "\n" not in r.json()["name"]


@pytest.fixture
def two_users(
    client: TestClient, make_client: Callable[[], TestClient], db: Session
) -> dict[str, Any]:
    create_logged_user(client, "ana@exemplo.com")
    custom = post(
        client, "/api/exercises", {"name": "Exercício da Ana", "muscle_group": "peito"}
    ).json()
    sid = start(client, notes="segredo-da-ana")["id"]
    sup = ex_id(db)
    set_id = add_set(client, sid, sup, 5, 100).json()["set"]["id"]
    add_set(client, sid, custom["id"], 5, 30)
    finish(client, sid)
    bruno = make_client()
    create_logged_user(bruno, "bruno@exemplo.com")
    return {
        "ana": client,
        "bruno": bruno,
        "sid": sid,
        "set_id": set_id,
        "custom": custom["id"],
        "sup": sup,
    }


def test_OK_W01_bola_sweep_with_other_users_ids(two_users: dict[str, Any]) -> None:
    bruno: TestClient = two_users["bruno"]
    sid, set_id, custom = two_users["sid"], two_users["set_id"], two_users["custom"]
    reads = [
        f"/api/workouts/{sid}",
        f"/api/exercises/{custom}/progress",
        f"/api/exercises/{custom}/records",
    ]
    for url in reads:
        r = bruno.get(url)
        assert r.status_code == 404, url
        assert "segredo" not in r.text and "Ana" not in r.text
    assert bruno.get(f"/api/workouts?exercise_id={custom}").json()["total"] == 0
    assert bruno.get(f"/api/workouts?exercise_id={two_users['sup']}").json()["total"] == 0
    today = date.today()
    cal = bruno.get(f"/api/workouts/calendar?month={today:%Y-%m}").json()
    assert cal["days"] == []
    assert all(b["workouts"] == 0 for b in bruno.get("/api/stats/volume").json())
    assert bruno.get("/api/stats/dashboard").json()["recent_records"] == []
    own = start(bruno)["id"]
    assert (
        put(bruno, f"/api/workouts/{own}/sets/{set_id}", {"reps": 1, "weight_kg": 1}).status_code
        == 404
    )
    assert delete(bruno, f"/api/workouts/{own}/sets/{set_id}").status_code == 404
    assert add_set(bruno, sid, two_users["sup"], 1, 1).status_code == 404
    ana: TestClient = two_users["ana"]
    detail = ana.get(f"/api/workouts/{sid}").json()
    assert detail["total_sets"] == 2 and detail["notes"] == "segredo-da-ana"


def test_OK_W02_comparison_never_uses_other_users_session(two_users: dict[str, Any]) -> None:
    bruno: TestClient = two_users["bruno"]
    sid = start(bruno)["id"]
    add_set(bruno, sid, two_users["sup"], 5, 40)
    block = bruno.get(f"/api/workouts/{sid}").json()["exercises"][0]
    assert block["comparison"] is None


def test_OK_W03_comparison_points_to_immediately_previous_session(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    ids = []
    for weight in (50, 60, 70):
        sid = start(client)["id"]
        add_set(client, sid, sup, 5, weight)
        finish(client, sid)
        ids.append(sid)
    first = client.get(f"/api/workouts/{ids[0]}").json()["exercises"][0]
    second = client.get(f"/api/workouts/{ids[1]}").json()["exercises"][0]
    third = client.get(f"/api/workouts/{ids[2]}").json()["exercises"][0]
    assert first["comparison"] is None
    assert second["comparison"]["previous_session_id"] == ids[0]
    assert third["comparison"]["previous_session_id"] == ids[1]
    assert third["comparison"]["delta_top_weight_kg"] == 10
    assert third["comparison"]["delta_volume_kg"] == 50


def test_OK_W04_local_date_at_utc_day_boundary(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    create_logged_user(client)
    fixed = datetime(2026, 3, 1, 2, 30, tzinfo=UTC)
    monkeypatch.setattr(workouts_module, "utcnow", lambda: fixed)
    monkeypatch.setattr(stats_module, "utcnow", lambda: fixed)
    session = start(client)
    assert session["local_date"] == "2026-02-28"
    assert client.get("/api/workouts/calendar?month=2026-02").json()["days"] == ["2026-02-28"]
    assert client.get("/api/workouts/calendar?month=2026-03").json()["days"] == []

    patch(client, "/api/users/me", {"timezone": "Pacific/Kiritimati"})
    finish(client, session["id"])
    assert start(client)["local_date"] == "2026-03-01"


def test_OK_W05_records_rebuilt_after_deleting_session_and_ties_not_records(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    s1 = start(client)["id"]
    add_set(client, s1, sup, 5, 60)
    finish(client, s1)
    s2 = start(client)["id"]
    tie = add_set(client, s2, sup, 5, 60).json()
    assert "max_weight" not in {r["record_type"] for r in tie["new_records"]}
    add_set(client, s2, sup, 5, 90)
    finish(client, s2)
    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 90

    assert delete(client, f"/api/workouts/{s2}").status_code == 204
    overview = client.get("/api/records").json()
    assert overview[0]["max_weight"]["value"] == 60
    assert overview[0]["max_weight"]["session_id"] == s1
    assert (
        db.scalar(select(func.count(PersonalRecord.id)).where(PersonalRecord.session_id == s2)) == 0
    )


def test_OK_W06_record_update_downgrade_and_delete_set(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    sid = start(client)["id"]
    a = add_set(client, sid, sup, 5, 80).json()["set"]["id"]
    b = add_set(client, sid, sup, 5, 100).json()["set"]["id"]
    assert (
        put(client, f"/api/workouts/{sid}/sets/{b}", {"reps": 5, "weight_kg": 70}).status_code
        == 200
    )
    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 80
    assert delete(client, f"/api/workouts/{sid}/sets/{a}").status_code == 204
    detail = client.get(f"/api/workouts/{sid}").json()
    assert [s["set_number"] for s in detail["exercises"][0]["sets"]] == [1]
    assert client.get("/api/records").json()[0]["max_weight"]["value"] == 70


@pytest.mark.parametrize(
    "raw_weight",
    ["NaN", "Infinity", "-Infinity", "1e400", '"0.001"', "-0.01", "true", "null"],
)
def test_OK_W07_weight_rejects_special_numbers(
    client: TestClient, db: Session, raw_weight: str
) -> None:
    create_logged_user(client)
    sid = start(client)["id"]
    body = f'{{"exercise_id": {ex_id(db)}, "reps": 5, "weight_kg": {raw_weight}}}'
    r = client.post(
        f"/api/workouts/{sid}/sets",
        content=body,
        headers={"content-type": "application/json", **_csrf(client)},
    )
    assert r.status_code == 422, (raw_weight, r.text)


def _csrf(client: TestClient) -> dict[str, str]:

    return csrf_headers(client)


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=10001",
        "page_size=0",
        "page_size=101",
        "exercise_id=0",
        "split_id=-1",
        "date_from=2026-13-01",
        "date_from=2026-02-01&date_to=2026-01-01",
    ],
)
def test_OK_W08_history_query_limits(client: TestClient, query: str) -> None:
    create_logged_user(client)
    assert client.get(f"/api/workouts?{query}").status_code in (400, 422), query


def test_OK_W09_stats_and_calendar_limits(client: TestClient) -> None:
    create_logged_user(client)
    for url in (
        "/api/stats/volume?count=53",
        "/api/stats/volume?count=0",
        "/api/stats/volume?period=year",
        "/api/workouts/calendar?month=1999-12",
        "/api/workouts/calendar?month=2026-13",
        "/api/workouts/calendar?month=2026-1",
        "/api/records/recent?limit=51",
    ):
        assert client.get(url).status_code in (400, 422), url
    assert len(client.get("/api/stats/volume?period=month&count=52").json()) == 52


def test_OK_W10_mass_assignment_on_workout_payloads(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    sid = start(client)["id"]
    sup = ex_id(db)
    bad = [
        ("/api/workouts", {"local_date": "2020-01-01"}),
        ("/api/workouts", {"started_at": "2020-01-01T00:00:00Z"}),
        (
            f"/api/workouts/{sid}/sets",
            {"exercise_id": sup, "reps": 5, "weight_kg": 5, "user_id": 2},
        ),
        (
            f"/api/workouts/{sid}/sets",
            {"exercise_id": sup, "reps": 5, "weight_kg": 5, "set_number": 9},
        ),
        ("/api/exercises", {"name": "X Y", "muscle_group": "peito", "user_id": None}),
    ]
    for url, body in bad:
        assert post(client, url, body).status_code == 422, (url, body)
    assert patch(client, f"/api/workouts/{sid}", {"finished_at": None}).status_code == 422
    assert put(client, "/api/splits/F", {"name": "x"}).status_code == 422


def test_OK_W11_global_catalog_is_read_only_and_archived_cannot_receive_sets(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    sup = ex_id(db)
    assert (
        put(client, f"/api/exercises/{sup}", {"name": "Hack", "muscle_group": "peito"}).status_code
        == 404
    )
    assert delete(client, f"/api/exercises/{sup}").status_code == 404
    mine = post(
        client, "/api/exercises", {"name": "Remada Própria", "muscle_group": "costas"}
    ).json()
    assert delete(client, f"/api/exercises/{mine['id']}").status_code == 204
    sid = start(client)["id"]
    assert add_set(client, sid, mine["id"], 5, 10).status_code == 404
    assert db.scalar(select(Exercise.name).where(Exercise.id == sup)) == SUPINO
