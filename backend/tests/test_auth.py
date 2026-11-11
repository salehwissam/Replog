from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.email.sender import OUTBOX
from app.models import EmailToken, User, UserSession
from tests.helpers import (
    DEFAULT_PASSWORD,
    create_logged_user,
    csrf_headers,
    delete,
    last_token,
    login,
    patch,
    post,
    register,
)


def test_register_stores_argon2_hash_and_sends_confirmation(
    client: TestClient, db: Session
) -> None:
    r = register(client)
    assert r.status_code == 202
    assert "link de confirmação" in r.json()["mensagem"]

    user = db.scalar(select(User).where(User.email == "ana@exemplo.com"))
    assert user is not None
    assert user.password_hash.startswith("$argon2id$")
    assert DEFAULT_PASSWORD not in user.password_hash
    assert user.email_verified_at is None
    assert user.timezone == "America/Sao_Paulo"

    assert len(OUTBOX) == 1
    assert OUTBOX[0].subject == "Confirme seu e-mail no REPLOG"
    assert "/confirmar-email#token=" in OUTBOX[0].text


def test_register_normalizes_email_case(client: TestClient, db: Session) -> None:
    register(client, email="  Ana@Exemplo.COM ")
    assert db.scalar(select(User.email)) == "ana@exemplo.com"


def test_duplicate_register_gives_same_answer_and_creates_no_user(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    OUTBOX.clear()
    r = register(client, name="Impostor")
    assert r.status_code == 202
    assert db.scalar(select(func.count(User.id))) == 1
    assert OUTBOX[0].subject == "Tentativa de cadastro no REPLOG"


def test_password_policy(client: TestClient) -> None:
    cases = {
        "curta": "A senha deve ter pelo menos 10 caracteres.",
        "1234567890": "Essa senha é muito comum. Escolha outra.",
        "aaaaaaaaaaaa": "Essa senha é muito comum. Escolha outra.",
        "anasouza-forte-123": None,
    }
    for pwd, expected in cases.items():
        r = register(client, email="anasouza@exemplo.com", password=pwd)
        assert r.status_code == 422, pwd
        body = r.json()["erro"]
        assert body["mensagem"] == "Verifique os dados informados."
        if expected:
            assert expected in body["campos"].values()


def test_password_confirmation_must_match(client: TestClient) -> None:
    r = post(
        client,
        "/api/auth/register",
        {
            "name": "Ana",
            "email": "ana@exemplo.com",
            "password": DEFAULT_PASSWORD,
            "password_confirm": DEFAULT_PASSWORD + "x",
        },
    )
    assert r.status_code == 422
    assert "As senhas não conferem." in r.json()["erro"]["campos"].values()


def test_register_rejects_invalid_email_and_timezone(client: TestClient) -> None:
    assert register(client, email="nao-e-email").status_code == 422
    r = register(client, timezone="Marte/Olimpo")
    assert r.status_code == 422
    assert r.json()["erro"]["campos"]["timezone"] == "Fuso horário inválido."


def test_register_rejects_mass_assignment_of_role(client: TestClient, db: Session) -> None:
    r = post(
        client,
        "/api/auth/register",
        {
            "name": "Ana",
            "email": "ana@exemplo.com",
            "password": DEFAULT_PASSWORD,
            "password_confirm": DEFAULT_PASSWORD,
            "role": "admin",
        },
    )
    assert r.status_code == 422
    assert db.scalar(select(func.count(User.id))) == 0


def test_login_requires_confirmed_email(client: TestClient) -> None:
    register(client)
    r = login(client, "ana@exemplo.com")
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "email_nao_confirmado"


def test_verification_token_is_single_use(client: TestClient) -> None:
    register(client)
    token = last_token("ana@exemplo.com")
    assert (
        post(
            client, "/api/auth/verify-email", {"token": token, "password": DEFAULT_PASSWORD}
        ).status_code
        == 200
    )
    r = post(client, "/api/auth/verify-email", {"token": token, "password": DEFAULT_PASSWORD})
    assert r.status_code == 400
    assert r.json()["erro"]["codigo"] == "link_invalido"


def test_pre_confirmation_email_does_not_echo_typed_name(client: TestClient) -> None:
    register(client, email="vitima@exemplo.com", name="Seu PIX expira! Pague em http://golpe")
    assert len(OUTBOX) == 1
    assert "golpe" not in OUTBOX[0].text and "golpe" not in OUTBOX[0].html
    assert "PIX" not in OUTBOX[0].text


def test_verification_requires_registration_password(client: TestClient) -> None:
    register(client)
    token = last_token("ana@exemplo.com")
    r = post(client, "/api/auth/verify-email", {"token": token, "password": "Senha-Errada-123"})
    assert r.status_code == 400
    assert r.json()["erro"]["campos"]["password"] == "A senha não confere com a do cadastro."
    r = post(client, "/api/auth/verify-email", {"token": token, "password": DEFAULT_PASSWORD})
    assert r.status_code == 200


def test_verification_token_stored_only_as_hash(client: TestClient, db: Session) -> None:
    register(client)
    token = last_token("ana@exemplo.com")
    stored = db.scalar(select(EmailToken.token_hash))
    assert stored is not None and stored != token and len(stored) == 64


def test_expired_verification_token_is_rejected(client: TestClient, db: Session) -> None:
    register(client)
    token = last_token("ana@exemplo.com")
    record = db.scalar(select(EmailToken))
    assert record is not None
    record.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert (
        post(
            client, "/api/auth/verify-email", {"token": token, "password": DEFAULT_PASSWORD}
        ).status_code
        == 400
    )


def test_resend_verification_is_generic_and_rate_limited(client: TestClient) -> None:
    register(client)
    OUTBOX.clear()
    for _ in range(5):
        r = post(client, "/api/auth/resend-verification", {"email": "ana@exemplo.com"})
        assert r.status_code == 202
    assert len(OUTBOX) == 2
    r = post(client, "/api/auth/resend-verification", {"email": "ninguem@exemplo.com"})
    assert r.status_code == 202


def test_login_sets_secure_session_cookie_and_me_works(client: TestClient) -> None:
    register(client)
    post(
        client,
        "/api/auth/verify-email",
        {"token": last_token("ana@exemplo.com"), "password": DEFAULT_PASSWORD},
    )
    r = login(client, "ana@exemplo.com")
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == "ana@exemplo.com"
    assert "password_hash" not in body

    set_cookies = r.headers.get_list("set-cookie")
    session_cookie = next(c for c in set_cookies if c.startswith("replog_session="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["name"] == "Ana Souza"


def test_wrong_password_and_unknown_email_return_same_error(client: TestClient) -> None:
    create_logged_user(client)
    client.cookies.clear()
    a = login(client, "ana@exemplo.com", "Senha-Errada-123")
    b = login(client, "ninguem@exemplo.com", "Senha-Errada-123")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()
    assert a.json()["erro"]["mensagem"] == "E-mail ou senha incorretos."


def test_brute_force_is_blocked_even_with_correct_password(client: TestClient) -> None:
    create_logged_user(client)
    client.cookies.clear()
    for _ in range(5):
        assert login(client, "ana@exemplo.com", "Senha-Errada-123").status_code == 401
    r = login(client, "ana@exemplo.com")
    assert r.status_code == 429
    assert "Muitas tentativas" in r.json()["erro"]["mensagem"]


def test_successful_login_resets_failure_counter(client: TestClient) -> None:
    create_logged_user(client)
    for _ in range(4):
        login(client, "ana@exemplo.com", "Senha-Errada-123")
    assert login(client, "ana@exemplo.com").status_code == 200
    for _ in range(4):
        login(client, "ana@exemplo.com", "Senha-Errada-123")
    assert login(client, "ana@exemplo.com").status_code == 200


def test_login_updates_timezone_from_device(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    r = post(
        client,
        "/api/auth/login",
        {"email": "ana@exemplo.com", "password": DEFAULT_PASSWORD, "timezone": "Europe/Lisbon"},
    )
    assert r.json()["timezone"] == "Europe/Lisbon"


def test_private_route_requires_login(client: TestClient) -> None:
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["erro"]["mensagem"] == "Você precisa entrar na sua conta."


def test_session_is_stored_hashed(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    cookie = client.cookies.get("replog_session")
    stored = db.scalar(select(UserSession.token_hash))
    assert cookie and stored and cookie != stored


def test_logout_revokes_session_server_side(client: TestClient, make_client) -> None:  # type: ignore[no-untyped-def]
    create_logged_user(client)
    stolen = client.cookies.get("replog_session")
    assert post(client, "/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401

    other = make_client()
    other.cookies.set("replog_session", stolen)
    assert other.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    session = db.scalar(select(UserSession))
    assert session is not None
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = client.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "sessao_expirada"


def test_absolute_session_lifetime(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    session = db.scalar(select(UserSession))
    assert session is not None
    session.created_at = utcnow() - timedelta(days=31)
    db.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_token_must_belong_to_session(client: TestClient) -> None:
    create_logged_user(client)
    client.cookies.set("replog_csrf", "token-plantado-pelo-atacante-123")
    r = client.patch(
        "/api/users/me",
        json={"name": "Hacker"},
        headers={"X-CSRF-Token": "token-plantado-pelo-atacante-123"},
    )
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "csrf_invalido"


def test_authenticated_post_without_csrf_header_is_rejected(client: TestClient) -> None:
    create_logged_user(client)
    r = client.patch("/api/users/me", json={"name": "Outro"})
    assert r.status_code == 403


def test_logout_others_keeps_current_session(client: TestClient, make_client) -> None:  # type: ignore[no-untyped-def]
    create_logged_user(client)
    phone = make_client()
    assert login(phone, "ana@exemplo.com").status_code == 200
    r = post(client, "/api/auth/logout-others")
    assert r.status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    assert phone.get("/api/auth/me").status_code == 401


def test_forgot_password_does_not_reveal_accounts(client: TestClient) -> None:
    create_logged_user(client)
    OUTBOX.clear()
    a = post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    b = post(client, "/api/auth/forgot-password", {"email": "ninguem@exemplo.com"})
    assert a.status_code == b.status_code == 202
    assert a.json() == b.json()
    assert [m.to for m in OUTBOX] == ["ana@exemplo.com"]


def test_reset_password_flow(client: TestClient, make_client) -> None:  # type: ignore[no-untyped-def]
    create_logged_user(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    token = last_token("ana@exemplo.com")
    new_password = "Nova-Senha-Forte-99"

    anon = make_client()
    r = post(
        anon,
        "/api/auth/reset-password",
        {"token": token, "password": new_password, "password_confirm": new_password},
    )
    assert r.status_code == 200

    assert client.get("/api/auth/me").status_code == 401
    assert login(anon, "ana@exemplo.com").status_code == 401
    assert login(anon, "ana@exemplo.com", new_password).status_code == 200
    r = post(
        anon,
        "/api/auth/reset-password",
        {
            "token": token,
            "password": "Outra-Senha-Forte-77",
            "password_confirm": "Outra-Senha-Forte-77",
        },
    )
    assert r.status_code == 400


def test_reset_token_expires(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    token = last_token("ana@exemplo.com")
    for rec in db.scalars(select(EmailToken).where(EmailToken.purpose == "reset_password")):
        rec.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    r = post(
        client,
        "/api/auth/reset-password",
        {
            "token": token,
            "password": "Nova-Senha-Forte-99",
            "password_confirm": "Nova-Senha-Forte-99",
        },
    )
    assert r.status_code == 400


def test_verify_token_cannot_be_used_to_reset_password(client: TestClient) -> None:
    register(client)
    verify_token = last_token("ana@exemplo.com")
    r = post(
        client,
        "/api/auth/reset-password",
        {
            "token": verify_token,
            "password": "Nova-Senha-Forte-99",
            "password_confirm": "Nova-Senha-Forte-99",
        },
    )
    assert r.status_code == 400


def test_change_password_rotates_sessions(client: TestClient, make_client) -> None:  # type: ignore[no-untyped-def]
    create_logged_user(client)
    phone = make_client()
    login(phone, "ana@exemplo.com")
    old_cookie = client.cookies.get("replog_session")

    r = post(
        client,
        "/api/auth/change-password",
        {
            "current_password": DEFAULT_PASSWORD,
            "password": "Nova-Senha-Forte-99",
            "password_confirm": "Nova-Senha-Forte-99",
        },
    )
    assert r.status_code == 200
    assert client.cookies.get("replog_session") != old_cookie
    assert client.get("/api/auth/me").status_code == 200
    assert phone.get("/api/auth/me").status_code == 401


def test_change_password_requires_current_password(client: TestClient) -> None:
    create_logged_user(client)
    r = post(
        client,
        "/api/auth/change-password",
        {
            "current_password": "errada-errada",
            "password": "Nova-Senha-Forte-99",
            "password_confirm": "Nova-Senha-Forte-99",
        },
    )
    assert r.status_code == 400
    assert r.json()["erro"]["campos"]["current_password"] == "Senha atual incorreta."


def test_update_profile(client: TestClient) -> None:
    create_logged_user(client)
    r = patch(client, "/api/users/me", {"name": "  Ana   Paula ", "timezone": "America/Manaus"})
    assert r.status_code == 200
    assert r.json()["name"] == "Ana Paula"
    assert r.json()["timezone"] == "America/Manaus"
    assert patch(client, "/api/users/me", {"role": "admin"}).status_code == 422


def test_delete_account_requires_password_and_removes_user(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    assert delete(client, "/api/users/me", {"password": "errada-errada"}).status_code == 400
    assert delete(client, "/api/users/me", {"password": DEFAULT_PASSWORD}).status_code == 204
    assert db.scalar(select(func.count(User.id))) == 0
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_endpoint_sets_readable_cookie(client: TestClient) -> None:
    r = client.get("/api/auth/csrf")
    assert r.status_code == 204
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("replog_csrf=")
    assert "HttpOnly" not in cookie
    assert csrf_headers(client)["X-CSRF-Token"]
