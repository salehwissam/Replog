import re
from typing import Any

from fastapi.testclient import TestClient
from httpx import Response

from app.email.sender import OUTBOX

DEFAULT_PASSWORD = "Treino-Pesado-2026"


def csrf_headers(client: TestClient) -> dict[str, str]:
    token = client.cookies.get("replog_csrf")
    if not token:
        client.get("/api/auth/csrf")
        token = client.cookies.get("replog_csrf")
    assert token
    return {"X-CSRF-Token": token}


def post(client: TestClient, url: str, json: Any = None) -> Response:
    return client.post(url, json=json, headers=csrf_headers(client))


def patch(client: TestClient, url: str, json: Any = None) -> Response:
    return client.patch(url, json=json, headers=csrf_headers(client))


def put(client: TestClient, url: str, json: Any = None) -> Response:
    return client.put(url, json=json, headers=csrf_headers(client))


def delete(client: TestClient, url: str, json: Any = None) -> Response:
    return client.request("DELETE", url, json=json, headers=csrf_headers(client))


def last_token(to: str) -> str:
    for msg in reversed(OUTBOX):
        if msg.to == to:
            match = re.search(r"#token=([A-Za-z0-9_\-]+)", msg.text)
            assert match, "e-mail sem token"
            return match.group(1)
    raise AssertionError(f"nenhum e-mail para {to}")


def register(
    client: TestClient,
    email: str = "ana@exemplo.com",
    name: str = "Ana Souza",
    password: str = DEFAULT_PASSWORD,
    timezone: str = "America/Sao_Paulo",
) -> Response:
    return post(
        client,
        "/api/auth/register",
        {
            "name": name,
            "email": email,
            "password": password,
            "password_confirm": password,
            "timezone": timezone,
        },
    )


def login(client: TestClient, email: str, password: str = DEFAULT_PASSWORD) -> Response:
    return post(client, "/api/auth/login", {"email": email, "password": password})


def create_logged_user(client: TestClient, email: str = "ana@exemplo.com") -> dict[str, Any]:
    assert register(client, email).status_code == 202
    assert (
        post(
            client,
            "/api/auth/verify-email",
            {"token": last_token(email), "password": DEFAULT_PASSWORD},
        ).status_code
        == 200
    )
    r = login(client, email)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data
