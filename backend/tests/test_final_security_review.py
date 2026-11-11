import re
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.email.sender import OUTBOX
from app.main import create_app
from app.models import User
from tests.helpers import (
    DEFAULT_PASSWORD,
    create_logged_user,
    last_token,
    login,
    patch,
    post,
    put,
)

ROOT = Path(__file__).resolve().parents[2]
XSS = '<img src=x onerror=alert(1)><script>alert("x")</script>'


def _make_admin(db: Session, email: str) -> None:
    user = db.scalar(select(User).where(User.email == email))
    assert user is not None
    user.role = "admin"
    db.commit()


@pytest.fixture
def admin_and_user(client: TestClient, make_client, db: Session) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    create_logged_user(client, "admin@exemplo.com")
    _make_admin(db, "admin@exemplo.com")
    bruno = make_client()
    data = create_logged_user(bruno, "bruno@exemplo.com")
    return {"admin": client, "bruno": bruno, "bruno_id": data["id"]}


def test_ACHADO_F01_path_id_overflow_gives_500(app: FastAPI) -> None:
    with TestClient(app, base_url="http://testserver", raise_server_exceptions=False) as c:
        create_logged_user(c)
        r = c.get("/api/workouts/99999999999999999999")
        assert r.status_code in (404, 422), f"ID gigante devolveu {r.status_code}"


def test_ACHADO_F02_unhandled_500_has_no_security_headers_nor_reference(app: FastAPI) -> None:
    def boom() -> None:
        raise RuntimeError("falha simulada")

    app.add_api_route("/api/__teste_500", boom, methods=["GET"])
    with TestClient(app, base_url="http://testserver", raise_server_exceptions=False) as c:
        r = c.get("/api/__teste_500")
    assert r.status_code == 500
    assert "falha simulada" not in r.text
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("cache-control") == "no-store"
    ref = r.json()["erro"]["mensagem"].rsplit(" ", 1)[-1]
    assert ref != "-", "o código de referência do erro 500 é sempre '-'"


def test_ACHADO_F03_shared_proxy_ip_turns_ip_lockout_into_global_lockout() -> None:
    conf = (ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")
    assert re.search(r"^\s*set_real_ip_from\s", conf, re.M), "nginx sem set_real_ip_from"
    assert re.search(r"^\s*real_ip_header\s", conf, re.M), "nginx sem real_ip_header"


def test_ACHADO_F04_published_port_binds_all_interfaces() -> None:
    compose = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")
    ports = re.findall(r'^\s*-\s*"([^"]+:8080)"', compose, re.M)
    assert ports, "porta do web não encontrada"
    assert all(p.startswith("127.0.0.1:") for p in ports), (
        f"porta exposta em todas as interfaces: {ports}"
    )


def test_ACHADO_F05_deactivation_keeps_pending_reset_links(
    admin_and_user: dict[str, Any], make_client
) -> None:  # type: ignore[no-untyped-def]
    admin: TestClient = admin_and_user["admin"]
    anon = make_client()
    post(anon, "/api/auth/forgot-password", {"email": "bruno@exemplo.com"})
    token = last_token("bruno@exemplo.com")
    uid = admin_and_user["bruno_id"]
    assert patch(admin, f"/api/admin/users/{uid}", {"is_active": False}).status_code == 200
    assert patch(admin, f"/api/admin/users/{uid}", {"is_active": True}).status_code == 200
    new = "Outra-Senha-Forte-2026"
    r = post(
        anon, "/api/auth/reset-password", {"token": token, "password": new, "password_confirm": new}
    )
    assert r.status_code == 400, "link pedido antes da desativação continuou válido"


def test_OK_F01_stored_xss_payloads_only_leave_as_json(client: TestClient) -> None:
    create_logged_user(client)
    assert patch(client, "/api/users/me", {"name": "Ana " + XSS[:70]}).status_code == 200
    ex = post(client, "/api/exercises", {"name": XSS[:80], "muscle_group": "peito"})
    assert ex.status_code == 201
    s = post(client, "/api/workouts", {"notes": XSS}).json()
    r = post(
        client,
        f"/api/workouts/{s['id']}/sets",
        {"exercise_id": ex.json()["id"], "reps": 5, "weight_kg": 50, "notes": XSS},
    )
    assert r.status_code == 201
    for url in [
        "/api/auth/me",
        f"/api/workouts/{s['id']}",
        "/api/workouts",
        "/api/users/me/export",
    ]:
        resp = client.get(url)
        assert resp.headers["content-type"].startswith("application/json"), url
        assert resp.headers["x-content-type-options"] == "nosniff"


def test_OK_F02_export_is_attachment_without_secrets(client: TestClient) -> None:
    create_logged_user(client)
    r = client.get("/api/users/me/export")
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["cache-control"] == "no-store"
    text = r.text.lower()
    for leak in ("password", "argon2", "token", "csrf", "role", "is_active"):
        assert leak not in text, leak


def test_OK_F03_email_html_escapes_user_name(client: TestClient) -> None:
    from tests.helpers import register

    assert register(client, "xss@exemplo.com", name="Eve " + XSS[:70]).status_code == 202
    msg = next(m for m in OUTBOX if m.to == "xss@exemplo.com")
    assert "<script>" not in msg.html and "<img" not in msg.html
    assert "Eve" not in msg.html and "Eve" not in msg.text


def test_OK_F04_admin_search_treats_wildcards_literally(admin_and_user: dict[str, Any]) -> None:
    admin: TestClient = admin_and_user["admin"]
    for q in ["%", "_", "' OR 1=1 --"]:
        r = admin.get("/api/admin/users", params={"q": q})
        assert r.status_code == 200
        assert r.json()["total"] == 0, q


def test_OK_F05_admin_endpoints_need_csrf_and_reject_extra_fields(
    admin_and_user: dict[str, Any],
) -> None:
    admin: TestClient = admin_and_user["admin"]
    uid = admin_and_user["bruno_id"]
    assert admin.patch(f"/api/admin/users/{uid}", json={"is_active": False}).status_code == 403
    r = patch(admin, f"/api/admin/users/{uid}", {"is_active": True, "role": "admin"})
    assert r.status_code == 422
    r = post(
        admin,
        "/api/admin/exercises",
        {"name": "Remada X", "muscle_group": "costas", "user_id": uid},
    )
    assert r.status_code == 422


def test_OK_F06_regular_user_cannot_touch_global_exercise(
    admin_and_user: dict[str, Any],
) -> None:
    admin: TestClient = admin_and_user["admin"]
    bruno: TestClient = admin_and_user["bruno"]
    gid = post(
        admin, "/api/admin/exercises", {"name": "Remada Global", "muscle_group": "costas"}
    ).json()["id"]
    assert (
        put(bruno, f"/api/exercises/{gid}", {"name": "Hack", "muscle_group": "peito"}).status_code
        == 404
    )
    assert (
        bruno.request(
            "DELETE",
            f"/api/exercises/{gid}",
            headers={"X-CSRF-Token": bruno.cookies.get("replog_csrf") or ""},
        ).status_code
        == 404
    )
    own = post(bruno, "/api/exercises", {"name": "Meu Exercicio", "muscle_group": "peito"}).json()[
        "id"
    ]
    assert (
        admin.request(
            "DELETE",
            f"/api/admin/exercises/{own}",
            headers={"X-CSRF-Token": admin.cookies.get("replog_csrf") or ""},
        ).status_code
        == 404
    )


def test_OK_F07_inactive_account_cannot_use_pending_reset_link(
    admin_and_user: dict[str, Any], make_client
) -> None:  # type: ignore[no-untyped-def]
    admin: TestClient = admin_and_user["admin"]
    anon = make_client()
    post(anon, "/api/auth/forgot-password", {"email": "bruno@exemplo.com"})
    token = last_token("bruno@exemplo.com")
    assert (
        patch(
            admin, f"/api/admin/users/{admin_and_user['bruno_id']}", {"is_active": False}
        ).status_code
        == 200
    )
    new = "Outra-Senha-Forte-2026"
    r = post(
        anon, "/api/auth/reset-password", {"token": token, "password": new, "password_confirm": new}
    )
    assert r.status_code == 400
    assert login(anon, "bruno@exemplo.com", DEFAULT_PASSWORD).status_code == 401


def test_OK_F08_origin_null_is_rejected(client: TestClient) -> None:
    create_logged_user(client)
    token = client.cookies.get("replog_csrf") or ""
    r = client.post("/api/workouts", json={}, headers={"X-CSRF-Token": token, "Origin": "null"})
    assert r.status_code == 403


def test_OK_F09_docs_and_openapi_disabled_in_production() -> None:
    settings = Settings(
        environment="production",
        secret_key="k" * 48,
        cookie_secure=True,
        email_backend="smtp",
        database_url="sqlite://",
        frontend_url="https://replog.exemplo.com",
        cors_origins="https://replog.exemplo.com",
    )
    application = create_app(settings)
    paths = {getattr(r, "path", "") for r in application.routes}
    assert "/api/docs" not in paths and "/api/openapi.json" not in paths
    assert settings.session_cookie.startswith("__Host-")


def test_OK_F10_nginx_overwrites_forwarded_for_and_hides_version() -> None:
    conf = (ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")
    assert "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for" not in conf
    assert conf.count("proxy_set_header X-Forwarded-For $remote_addr;") >= 2
    assert "server_tokens off;" in conf
    assert "client_max_body_size 64k;" in conf
