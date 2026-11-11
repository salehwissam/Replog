from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cli import set_role
from app.models import Exercise, User
from app.seeds.exercises import seed_exercises
from tests.helpers import create_logged_user, delete, login, patch, post


def make_admin(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email))
    assert user is not None
    user.role = "admin"
    db.commit()


@pytest.fixture
def setup(client: TestClient, make_client, db: Session) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    seed_exercises(db)
    create_logged_user(client, "admin@exemplo.com")
    make_admin(db, "admin@exemplo.com")
    bruno = make_client()
    bruno_data = create_logged_user(bruno, "bruno@exemplo.com")
    s = post(bruno, "/api/workouts", {"notes": "dado privado do bruno"}).json()
    sup = db.scalar(select(Exercise.id).where(Exercise.name == "Supino reto com barra"))
    post(bruno, f"/api/workouts/{s['id']}/sets", {"exercise_id": sup, "reps": 10, "weight_kg": 50})
    return {"admin": client, "bruno": bruno, "bruno_id": bruno_data["id"]}


def test_regular_user_cannot_access_admin(setup: dict[str, Any]) -> None:
    bruno: TestClient = setup["bruno"]
    for url in ["/api/admin/stats", "/api/admin/users"]:
        assert bruno.get(url).status_code == 403
    assert (
        patch(bruno, f"/api/admin/users/{setup['bruno_id']}", {"is_active": False}).status_code
        == 403
    )
    r = post(bruno, "/api/admin/exercises", {"name": "Hack", "muscle_group": "peito"})
    assert r.status_code == 403


def test_anonymous_cannot_access_admin(client: TestClient) -> None:
    assert client.get("/api/admin/stats").status_code == 401


def test_admin_stats_and_users_without_private_workout_data(setup: dict[str, Any]) -> None:
    admin: TestClient = setup["admin"]
    stats = admin.get("/api/admin/stats").json()
    assert stats["users_total"] == 2
    assert stats["workouts_total"] == 1
    assert stats["sets_total"] == 1
    r = admin.get("/api/admin/users", params={"q": "bruno"})
    assert r.status_code == 200
    page = r.json()
    assert page["total"] == 1
    assert page["items"][0]["workouts"] == 1
    assert "dado privado" not in r.text
    assert "password" not in r.text and "hash" not in r.text


def test_admin_deactivation_revokes_sessions_and_blocks_login(setup: dict[str, Any]) -> None:
    admin: TestClient = setup["admin"]
    bruno: TestClient = setup["bruno"]
    r = patch(admin, f"/api/admin/users/{setup['bruno_id']}", {"is_active": False})
    assert r.status_code == 200
    assert r.json()["is_active"] is False
    assert bruno.get("/api/auth/me").status_code == 401
    assert login(bruno, "bruno@exemplo.com").status_code == 401
    patch(admin, f"/api/admin/users/{setup['bruno_id']}", {"is_active": True})
    assert login(bruno, "bruno@exemplo.com").status_code == 200


def test_admin_cannot_change_self_or_other_admins_or_grant_role(
    setup: dict[str, Any], db: Session
) -> None:
    admin: TestClient = setup["admin"]
    me = admin.get("/api/auth/me").json()
    assert patch(admin, f"/api/admin/users/{me['id']}", {"is_active": False}).status_code == 403
    r = patch(admin, f"/api/admin/users/{setup['bruno_id']}", {"role": "admin"})
    assert r.status_code == 422
    make_admin(db, "bruno@exemplo.com")
    assert (
        patch(admin, f"/api/admin/users/{setup['bruno_id']}", {"is_active": False}).status_code
        == 403
    )


def test_admin_manages_global_catalog(setup: dict[str, Any]) -> None:
    admin: TestClient = setup["admin"]
    bruno: TestClient = setup["bruno"]
    r = post(admin, "/api/admin/exercises", {"name": "Remada Landmine", "muscle_group": "costas"})
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert r.json()["is_custom"] is False
    assert new_id in [e["id"] for e in bruno.get("/api/exercises").json()]
    dup = post(admin, "/api/admin/exercises", {"name": "remada landmine", "muscle_group": "costas"})
    assert dup.status_code == 409
    assert delete(admin, f"/api/admin/exercises/{new_id}").status_code == 204
    assert new_id not in [e["id"] for e in bruno.get("/api/exercises").json()]


def test_cli_promotes_only_verified_accounts(
    setup: dict[str, Any], db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import cli

    monkeypatch.setattr(cli, "SessionLocal", lambda: db)
    monkeypatch.setattr(db, "close", lambda: None)
    assert set_role("ninguem@exemplo.com", "admin") == 1
    assert set_role("bruno@exemplo.com", "admin") == 0
    db.expire_all()
    assert db.scalar(select(User.role).where(User.email == "bruno@exemplo.com")) == "admin"
    bruno: TestClient = setup["bruno"]
    assert bruno.get("/api/auth/me").status_code == 401
