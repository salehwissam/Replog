import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.middleware.security import RateLimiter


def test_health_ok(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_security_headers_present(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["Cache-Control"] == "no-store"
    assert len(r.headers["X-Request-ID"]) == 16


def test_not_found_message_in_portuguese(client: TestClient) -> None:
    r = client.get("/api/nao-existe")
    assert r.status_code == 404
    assert r.json()["erro"]["mensagem"] == "Recurso não encontrado."


def test_post_without_csrf_is_rejected(client: TestClient) -> None:
    r = client.post("/api/qualquer", json={})
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "csrf_invalido"


def test_post_with_foreign_origin_is_rejected(client: TestClient) -> None:
    client.cookies.set("replog_csrf", "abc")
    r = client.post(
        "/api/qualquer",
        json={},
        headers={"X-CSRF-Token": "abc", "Origin": "https://site-malicioso.com"},
    )
    assert r.status_code == 403


def test_same_origin_request_is_accepted(client: TestClient) -> None:
    client.cookies.set("replog_csrf", "abc")
    headers = {
        "X-CSRF-Token": "abc",
        "Origin": "http://192.168.15.60:5173",
        "Host": "192.168.15.60:5173",
    }
    r = client.post("/api/qualquer", json={}, headers=headers)
    assert r.status_code == 404
    for origin in ("http://192.168.15.61:5173", "null", "https://192.168.15.60:5173.evil.com"):
        r = client.post("/api/qualquer", json={}, headers={**headers, "Origin": origin})
        assert r.status_code == 403, origin


def test_production_rejects_insecure_settings() -> None:
    with pytest.raises(ValidationError):
        Settings(environment="production", secret_key="dev-secret-nao-usar-em-producao")


def test_production_accepts_secure_settings() -> None:
    s = Settings(
        environment="production",
        secret_key="x" * 48,
        cookie_secure=True,
        email_backend="smtp",
        cors_origins="https://replog.app",
    )
    assert s.is_production


def test_rate_limiter_blocks_after_limit() -> None:
    limiter = RateLimiter(limit=3, window_seconds=60)
    assert [limiter.allow("1.1.1.1")[0] for _ in range(4)] == [True, True, True, False]
    assert limiter.allow("2.2.2.2")[0] is True
