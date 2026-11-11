import contextlib
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Barrier, BrokenBarrierError
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

import app.core.security as security_module
import app.services.auth as auth_service_module
from app.core.config import Settings, get_settings
from app.core.security import hash_token
from app.db.base import Base, utcnow
from app.db.session import build_engine, get_db
from app.email.sender import OUTBOX
from app.main import create_app
from app.middleware.security import RateLimiter
from app.models import LoginAttempt, User, UserSession
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

NEW_PASSWORD = "Nova-Senha-Forte-99"
WRONG = "Senha-Errada-123"


def _reset(client: TestClient, token: str, password: str = NEW_PASSWORD) -> Any:
    return post(
        client,
        "/api/auth/reset-password",
        {"token": token, "password": password, "password_confirm": password},
    )


def _change(client: TestClient, current: str, new: str = NEW_PASSWORD) -> Any:
    return post(
        client,
        "/api/auth/change-password",
        {"current_password": current, "password": new, "password_confirm": new},
    )


@pytest.fixture
def file_app(tmp_path: Path) -> Iterator[FastAPI]:
    eng = build_engine(f"sqlite:///{tmp_path / 'race.db'}")
    Base.metadata.create_all(eng)
    factory = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)
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


def _anon_client(application: FastAPI) -> TestClient:
    c = TestClient(application, base_url="http://testserver")
    c.get("/api/auth/csrf")
    token = c.cookies.get("replog_csrf")
    assert token
    c.headers["X-CSRF-Token"] = token
    return c


def test_ACHADO_01_pre_account_takeover_by_registering_victim_email_first(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    attacker = make_client()
    attacker_pwd = "Senha-Do-Atacante-77"
    assert register(attacker, "vitima@exemplo.com", "Atacante", attacker_pwd).status_code == 202

    victim_pwd = "Escolha-Propria-2026"
    assert register(client, "vitima@exemplo.com", "Vitima Real", victim_pwd).status_code == 202
    token = last_token("vitima@exemplo.com")
    assert (
        post(client, "/api/auth/verify-email", {"token": token, "password": victim_pwd}).status_code
        == 200
    )

    attacker.cookies.clear()
    attacker_login = login(attacker, "vitima@exemplo.com", attacker_pwd)
    victim_login = login(client, "vitima@exemplo.com", victim_pwd)
    assert attacker_login.status_code == 401, "atacante entrou na conta confirmada pela vítima"
    assert victim_login.status_code == 200, "a senha escolhida pela vítima foi descartada"


def test_ACHADO_02_login_lockout_bypassed_by_parallel_requests(
    file_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = _anon_client(file_app)
    create_logged_user(setup, "alvo@exemplo.com")

    n = 10
    barrier = Barrier(n)
    original = auth_service_module.verify_password

    def slow_verify(password_hash: str | None, password: str) -> bool:
        with contextlib.suppress(BrokenBarrierError):
            barrier.wait(timeout=10)
        return original(password_hash, password)

    monkeypatch.setattr(auth_service_module, "verify_password", slow_verify)
    clients = [_anon_client(file_app) for _ in range(n)]

    def attempt(i: int) -> int:
        r = clients[i].post(
            "/api/auth/login", json={"email": "alvo@exemplo.com", "password": f"{WRONG}-{i}"}
        )
        return r.status_code

    with ThreadPoolExecutor(max_workers=n) as pool:
        codes = list(pool.map(attempt, range(n)))

    guesses_evaluated = codes.count(401)
    assert set(codes) <= {401, 429}, codes
    assert guesses_evaluated <= 5, (
        f"{guesses_evaluated} senhas testadas em paralelo; o limite é 5 por e-mail"
    )


def test_ACHADO_03_reset_token_not_atomically_single_use(
    file_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    setup = _anon_client(file_app)
    create_logged_user(setup, "ana@exemplo.com")
    assert post(setup, "/api/auth/forgot-password", {"email": "ana@exemplo.com"}).status_code == 202
    token = last_token("ana@exemplo.com")

    barrier = Barrier(2)
    original = auth_service_module.hash_password

    def slow_hash(password: str) -> str:
        with contextlib.suppress(BrokenBarrierError):
            barrier.wait(timeout=10)
        return original(password)

    monkeypatch.setattr(auth_service_module, "hash_password", slow_hash)
    clients = [_anon_client(file_app) for _ in range(2)]
    passwords = ["Primeira-Senha-Nova-1", "Segunda-Senha-Nova-2"]

    def use(i: int) -> int:
        r = clients[i].post(
            "/api/auth/reset-password",
            json={"token": token, "password": passwords[i], "password_confirm": passwords[i]},
        )
        return r.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(use, range(2)))

    assert sorted(codes) == [200, 400], f"token de uso único aceito {codes.count(200)}x: {codes}"


def test_ACHADO_04_current_password_bruteforce_via_change_password(client: TestClient) -> None:
    create_logged_user(client)
    codes = [_change(client, f"{WRONG}-{i}").status_code for i in range(8)]
    assert 429 in codes, f"8 palpites seguidos de senha atual sem bloqueio: {codes}"


def test_ACHADO_04b_current_password_bruteforce_via_delete_account(client: TestClient) -> None:
    create_logged_user(client)
    codes = [
        delete(client, "/api/users/me", {"password": f"{WRONG}-{i}"}).status_code for i in range(8)
    ]
    assert 429 in codes, f"8 palpites seguidos de senha sem bloqueio: {codes}"


def test_ACHADO_05_account_exists_email_has_no_quota(client: TestClient) -> None:
    create_logged_user(client)
    client.cookies.clear()
    OUTBOX.clear()
    for _ in range(10):
        assert register(client, name="Spam").status_code == 202
    sent = [m for m in OUTBOX if m.to == "ana@exemplo.com"]
    assert len(sent) <= 3, f"{len(sent)} e-mails enviados à vítima em segundos"


def test_ACHADO_06_pending_reset_token_survives_password_change(client: TestClient) -> None:
    create_logged_user(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    pending = last_token("ana@exemplo.com")
    assert _change(client, DEFAULT_PASSWORD).status_code == 200
    r = _reset(client, pending, "Senha-Do-Atacante-55")
    assert r.status_code == 400, "link de redefinição antigo ainda vale após a troca de senha"


def test_ACHADO_07_previous_session_not_revoked_on_new_login(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client)
    old = client.cookies.get("replog_session")
    assert login(client, "ana@exemplo.com").status_code == 200
    assert client.cookies.get("replog_session") != old

    thief = make_client()
    thief.cookies.set("replog_session", old)
    assert thief.get("/api/auth/me").status_code == 401, "sessão substituída continua válida"


def test_ACHADO_08_password_policy_not_applied_on_reset_and_change(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client, "anasouza@exemplo.com")
    weak = "anasouza-forte-123"
    assert _change(client, DEFAULT_PASSWORD, weak).status_code == 422, "troca aceitou"

    post(client, "/api/auth/forgot-password", {"email": "anasouza@exemplo.com"})
    anon = make_client()
    assert _reset(anon, last_token("anasouza@exemplo.com"), weak).status_code == 422, (
        "redefinição aceitou"
    )


def test_ACHADO_09_rate_limiter_memory_guard_never_frees_entries() -> None:
    limiter = RateLimiter(limit=10, window_seconds=0.0)
    for i in range(50_001):
        limiter.allow(f"10.{i // 65536}.{(i // 256) % 256}.{i % 256}")
    assert len(limiter._hits) <= 50_000, f"{len(limiter._hits)} chaves expiradas mantidas"


def test_ACHADO_10_name_min_length_checked_before_cleaning(client: TestClient) -> None:
    r = register(client, name="  a  ")
    assert r.status_code == 422, "nome de 1 caractere aceito"


def test_OK_01_unsafe_request_without_csrf_pair_is_rejected(client: TestClient) -> None:
    body = {"email": "ana@exemplo.com", "password": DEFAULT_PASSWORD}
    assert client.post("/api/auth/login", json=body).status_code == 403
    client.cookies.set("replog_csrf", "aaaaaaaaaaaaaaaaaaaaaaaa")
    r = client.post(
        "/api/auth/login", json=body, headers={"X-CSRF-Token": "bbbbbbbbbbbbbbbbbbbbbbbb"}
    )
    assert r.status_code == 403
    assert r.json()["erro"]["codigo"] == "csrf_invalido"


def test_OK_02_foreign_origin_rejected_even_with_valid_double_submit(client: TestClient) -> None:
    headers = csrf_headers(client) | {"Origin": "https://evil.example"}
    r = client.post("/api/auth/forgot-password", json={"email": "a@b.com"}, headers=headers)
    assert r.status_code == 403
    headers["Origin"] = "null"
    assert (
        client.post(
            "/api/auth/forgot-password", json={"email": "a@b.com"}, headers=headers
        ).status_code
        == 403
    )
    headers["Origin"] = "http://localhost:5173"
    assert (
        client.post(
            "/api/auth/forgot-password", json={"email": "a@b.com"}, headers=headers
        ).status_code
        == 202
    )


def test_OK_03_csrf_token_of_another_users_session_is_rejected(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client, "vitima@exemplo.com")
    attacker = make_client()
    create_logged_user(attacker, "atacante@exemplo.com")
    attacker_csrf = attacker.cookies.get("replog_csrf")
    assert attacker_csrf

    client.cookies.set("replog_csrf", attacker_csrf)
    r = client.patch(
        "/api/users/me", json={"name": "Hackeado"}, headers={"X-CSRF-Token": attacker_csrf}
    )
    assert r.status_code == 403
    assert client.get("/api/auth/me").json()["name"] == "Ana Souza"


def test_OK_04_logout_requires_csrf(client: TestClient) -> None:
    create_logged_user(client)
    assert client.post("/api/auth/logout").status_code == 403
    assert client.get("/api/auth/me").status_code == 200


def test_OK_05_planted_session_cookie_is_not_adopted_on_login(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    register(client)
    post(
        client,
        "/api/auth/verify-email",
        {"token": last_token("ana@exemplo.com"), "password": DEFAULT_PASSWORD},
    )
    planted = "sessao-plantada-pelo-atacante-0123456789"
    client.cookies.set("replog_session", planted)
    csrf_before = client.cookies.get("replog_csrf")
    r = login(client, "ana@exemplo.com")
    assert r.status_code == 200
    issued = r.cookies.get("replog_session")
    assert issued and issued != planted
    assert r.cookies.get("replog_csrf") not in (None, csrf_before)
    probe = make_client()
    probe.cookies.set("replog_session", planted)
    assert probe.get("/api/auth/me").status_code == 401


def test_OK_06_session_hash_is_hmac_of_cookie(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    cookie = client.cookies.get("replog_session")
    assert cookie and len(cookie) >= 43
    row = db.scalar(select(UserSession))
    assert row is not None
    assert row.token_hash == hash_token(cookie)
    assert row.csrf_hash == hash_token(client.cookies.get("replog_csrf") or "")


def test_OK_07_secure_mode_cookie_flags(db_factory: sessionmaker[Session]) -> None:
    settings = Settings(cookie_secure=True)
    application = create_app(settings)

    def _get_db() -> Iterator[Session]:
        s = db_factory()
        try:
            yield s
        finally:
            s.close()

    application.dependency_overrides[get_db] = _get_db
    with TestClient(application, base_url="https://testserver") as c:
        c.get("/api/auth/csrf")
        token = c.cookies.get("__Host-replog_csrf")
        assert token
        h = {"X-CSRF-Token": token}
        body = {
            "name": "Ana Souza",
            "email": "ana@exemplo.com",
            "password": DEFAULT_PASSWORD,
            "password_confirm": DEFAULT_PASSWORD,
        }
        assert c.post("/api/auth/register", json=body, headers=h).status_code == 202
        c.post(
            "/api/auth/verify-email",
            json={"token": last_token("ana@exemplo.com"), "password": DEFAULT_PASSWORD},
            headers=h,
        )
        r = c.post(
            "/api/auth/login",
            json={"email": "ana@exemplo.com", "password": DEFAULT_PASSWORD},
            headers=h,
        )
        assert r.status_code == 200
        cookies = r.headers.get_list("set-cookie")
        sess = next(x for x in cookies if x.startswith("__Host-replog_session="))
        csrf = next(x for x in cookies if x.startswith("__Host-replog_csrf="))
        for ck in (sess, csrf):
            low = ck.lower()
            assert "secure" in low and "path=/" in low and "domain=" not in low
        assert "httponly" in sess.lower() and "samesite=lax" in sess.lower()
        assert "httponly" not in csrf.lower() and "samesite=strict" in csrf.lower()


def test_OK_08_oversized_or_garbage_session_cookie_gives_401(client: TestClient) -> None:
    for value in ("x" * 129, "%00%00", "' OR 1=1 --"):
        client.cookies.set("replog_session", value)
        assert client.get("/api/auth/me").status_code == 401


def test_OK_09_sliding_expiration_never_exceeds_absolute_limit(
    client: TestClient, db: Session
) -> None:
    create_logged_user(client)
    row = db.scalar(select(UserSession))
    assert row is not None
    now = utcnow()
    row.created_at = now - timedelta(days=29, hours=23)
    row.last_seen_at = now - timedelta(hours=1)
    db.commit()
    assert client.get("/api/auth/me").status_code == 200
    db.refresh(row)
    assert row.expires_at <= row.created_at + timedelta(days=30)


def test_OK_10_deactivated_user_session_and_login_rejected(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    user = db.scalar(select(User))
    assert user is not None
    user.is_active = False
    db.commit()
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.clear()
    r = login(client, "ana@exemplo.com")
    unknown = login(client, "ninguem@exemplo.com")
    assert r.status_code == unknown.status_code == 401
    assert r.json() == unknown.json()


def test_OK_11_register_same_answer_for_new_unverified_and_verified(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client, "confirmada@exemplo.com")
    register(client, "pendente@exemplo.com")
    other = make_client()
    answers = [
        register(other, e)
        for e in ("nova@exemplo.com", "pendente@exemplo.com", "confirmada@exemplo.com")
    ]
    assert {a.status_code for a in answers} == {202}
    assert len({a.text for a in answers}) == 1


def test_OK_12_resend_and_forgot_same_answer_for_any_state(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client, "confirmada@exemplo.com")
    register(client, "pendente@exemplo.com")
    other = make_client()
    for url in ("/api/auth/resend-verification", "/api/auth/forgot-password"):
        answers = [
            post(other, url, {"email": e})
            for e in ("ninguem@exemplo.com", "pendente@exemplo.com", "confirmada@exemplo.com")
        ]
        assert {a.status_code for a in answers} == {202}
        assert len({a.text for a in answers}) == 1


def test_OK_13_unverified_account_with_wrong_password_looks_like_unknown(
    client: TestClient,
) -> None:
    register(client)
    a = login(client, "ana@exemplo.com", WRONG)
    b = login(client, "ninguem@exemplo.com", WRONG)
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_OK_14_argon2_runs_same_number_of_times_for_known_and_unknown_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    create_logged_user(client)
    client.cookies.clear()
    real = security_module._hasher
    calls = {"verify": 0, "hash": 0}

    class Counting:
        def verify(self, h: str, p: str) -> bool:
            calls["verify"] += 1
            return real.verify(h, p)

        def hash(self, p: str) -> str:
            calls["hash"] += 1
            return real.hash(p)

        def check_needs_rehash(self, h: str) -> bool:
            return real.check_needs_rehash(h)

    monkeypatch.setattr(security_module, "_hasher", Counting())
    login(client, "ana@exemplo.com", WRONG)
    known = dict(calls)
    calls.update(verify=0, hash=0)
    login(client, "ninguem@exemplo.com", WRONG)
    assert calls == known == {"verify": 1, "hash": 0}

    calls.update(verify=0, hash=0)
    register(client, "ana@exemplo.com")
    existing = dict(calls)
    calls.update(verify=0, hash=0)
    register(client, "nova@exemplo.com")
    assert calls == existing == {"verify": 0, "hash": 1}


def test_OK_15_lockout_identical_for_unknown_email(client: TestClient) -> None:
    for _ in range(5):
        assert login(client, "ninguem@exemplo.com", WRONG).status_code == 401
    assert login(client, "ninguem@exemplo.com", WRONG).status_code == 429


def test_OK_16_lockout_counts_case_variants_of_email(client: TestClient) -> None:
    create_logged_user(client)
    client.cookies.clear()
    for variant in (
        "ANA@exemplo.com",
        "Ana@Exemplo.com",
        " ana@EXEMPLO.COM",
        "aNa@exemplo.com",
        "ana@exemplo.COM",
    ):
        assert login(client, variant, WRONG).status_code == 401
    assert login(client, "ana@exemplo.com").status_code == 429


def test_OK_17_ip_limit_blocks_password_spraying(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    client.cookies.clear()
    for i in range(20):
        assert login(client, f"spray{i}@exemplo.com", WRONG).status_code == 401
    assert login(client, "ana@exemplo.com").status_code == 429
    failures = select(func.count(LoginAttempt.id)).where(LoginAttempt.success.is_(False))
    assert db.scalar(failures) == 20


def test_OK_18_reset_token_cannot_verify_email_and_wrong_purpose_rejected(
    client: TestClient,
) -> None:
    create_logged_user(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    reset_token = last_token("ana@exemplo.com")
    assert (
        post(
            client, "/api/auth/verify-email", {"token": reset_token, "password": DEFAULT_PASSWORD}
        ).status_code
        == 400
    )
    assert _reset(client, reset_token).status_code == 200


def test_OK_19_reset_invalidates_other_pending_reset_links(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    first = last_token("ana@exemplo.com")
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    second = last_token("ana@exemplo.com")
    anon = make_client()
    assert _reset(anon, second).status_code == 200
    assert _reset(anon, first, "Outra-Senha-Forte-77").status_code == 400


def test_OK_20_links_in_fragment_and_no_token_query(client: TestClient) -> None:
    register(client)
    post(client, "/api/auth/forgot-password", {"email": "ana@exemplo.com"})
    for m in OUTBOX:
        if "#token=" in m.text:
            assert "?token=" not in m.text and "?token=" not in m.html


@pytest.mark.parametrize(
    "extra",
    [
        {"role": "admin"},
        {"email": "x@y.com"},
        {"is_active": False},
        {"email_verified_at": None},
        {"id": 1},
    ],
)
def test_OK_21_profile_mass_assignment_rejected(client: TestClient, extra: dict[str, Any]) -> None:
    create_logged_user(client)
    assert patch(client, "/api/users/me", extra).status_code == 422
    assert client.get("/api/auth/me").json()["role"] == "user"


def test_OK_22_login_rejects_unknown_fields(client: TestClient) -> None:
    r = post(
        client,
        "/api/auth/login",
        {"email": "ana@exemplo.com", "password": DEFAULT_PASSWORD, "role": "admin"},
    )
    assert r.status_code == 422


def test_OK_23_validation_errors_do_not_echo_secrets(client: TestClient) -> None:
    secret = "SegredoQueNaoPodeVoltar-123"
    r = post(
        client,
        "/api/auth/register",
        {
            "name": "Ana",
            "email": "ana@exemplo.com",
            "password": secret,
            "password_confirm": secret + "x",
        },
    )
    assert r.status_code == 422
    assert secret not in r.text
    r = post(client, "/api/auth/verify-email", {"token": "t" * 500, "password": DEFAULT_PASSWORD})
    assert r.status_code == 422 and "t" * 129 not in r.text


def test_OK_24_user_actions_only_affect_own_account(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    create_logged_user(client, "ana@exemplo.com")
    bob = make_client()
    create_logged_user(bob, "bob@exemplo.com")

    assert patch(bob, "/api/users/me", {"name": "Bob Novo"}).status_code == 200
    assert post(bob, "/api/auth/logout-others").status_code == 200
    assert _change(bob, DEFAULT_PASSWORD).status_code == 200
    assert delete(bob, "/api/users/me", {"password": NEW_PASSWORD}).status_code == 204

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["name"] == "Ana Souza"
    assert login(client, "ana@exemplo.com").status_code == 200


def test_OK_25_user_response_has_no_sensitive_fields(client: TestClient) -> None:
    body = create_logged_user(client)
    assert set(body) == {"id", "name", "email", "timezone", "role", "created_at"}


def test_OK_26_security_headers_present(client: TestClient) -> None:
    r = client.get("/api/auth/me")
    for h in (
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Content-Security-Policy",
        "Cache-Control",
    ):
        assert h in r.headers
    assert r.headers["Cache-Control"] == "no-store"


def test_OK_27_rate_limiter_blocks_and_sets_retry_after() -> None:
    limiter = RateLimiter(limit=3, window_seconds=60)
    results = [limiter.allow("1.2.3.4")[0] for _ in range(4)]
    assert results == [True, True, True, False]
    assert limiter.allow("1.2.3.4")[1] >= 1
    assert limiter.allow("5.6.7.8")[0] is True


def test_OK_28_production_refuses_insecure_settings() -> None:
    with pytest.raises(ValueError, match="secret_key"):
        Settings(environment="production", secret_key="dev-secret-nao-usar-em-producao")
    with pytest.raises(ValueError, match="REPLOG_SECRET_KEY"):
        Settings(environment="production", secret_key="dev-" + "x" * 40, cookie_secure=True)
    with pytest.raises(ValueError, match="REPLOG_COOKIE_SECURE"):
        Settings(environment="production", secret_key="x" * 40, cookie_secure=False)


def test_RETESTE_01b_pre_takeover_still_possible_via_resend_link(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    attacker = make_client()
    attacker_pwd = "Senha-Do-Atacante-77"
    assert register(attacker, "vitima@exemplo.com", "Atacante", attacker_pwd).status_code == 202
    victim_pwd = "Escolha-Propria-2026"
    assert register(client, "vitima@exemplo.com", "Vitima Real", victim_pwd).status_code == 202
    r = post(client, "/api/auth/resend-verification", {"email": "vitima@exemplo.com"})
    assert r.status_code == 202
    assert (
        post(
            client,
            "/api/auth/verify-email",
            {"token": last_token("vitima@exemplo.com"), "password": victim_pwd},
        ).status_code
        == 200
    )

    attacker.cookies.clear()
    assert login(attacker, "vitima@exemplo.com", attacker_pwd).status_code == 401, (
        "atacante entrou após a vítima confirmar pelo link de reenvio"
    )
    assert login(client, "vitima@exemplo.com", victim_pwd).status_code == 200


def test_RETESTE_01c_pre_takeover_if_victim_clicks_attackers_email(
    client: TestClient, make_client: Callable[[], TestClient]
) -> None:
    attacker = make_client()
    attacker_pwd = "Senha-Do-Atacante-77"
    register(attacker, "vitima@exemplo.com", "Vitima Real", attacker_pwd)
    attackers_link = last_token("vitima@exemplo.com")
    register(client, "vitima@exemplo.com", "Vitima Real", "Escolha-Propria-2026")
    r = post(
        client,
        "/api/auth/verify-email",
        {"token": attackers_link, "password": "Escolha-Propria-2026"},
    )
    attacker.cookies.clear()
    if r.status_code == 200:
        assert login(attacker, "vitima@exemplo.com", attacker_pwd).status_code == 401, (
            "link gerado pelo cadastro do atacante ativou a conta com a senha dele"
        )


def test_RETESTE_09b_rate_limiter_fails_closed_for_new_ips_when_full() -> None:
    limiter = RateLimiter(limit=10, window_seconds=60)
    limiter.MAX_KEYS = 100  # type: ignore[misc]  # mesmo comportamento com 100 000
    for i in range(100):
        assert limiter.allow(f"2001:db8::{i:x}")[0]
    assert limiter.allow("198.51.100.7")[0] is True, "usuário legítimo novo recebeu 429"


def test_OK_29_body_size_limit_declared_and_chunked(client: TestClient) -> None:
    h = csrf_headers(client) | {"content-type": "application/json"}
    r = client.post("/api/auth/forgot-password", content=b"x" * 70_000, headers=h)
    assert r.status_code == 413

    def chunks() -> Iterator[bytes]:
        for _ in range(200):
            yield b"x" * 1024

    r = client.post("/api/auth/forgot-password", content=chunks(), headers=h)
    assert r.status_code in (400, 413)


def test_OK_30_shared_lockout_covers_change_password_and_delete(client: TestClient) -> None:
    create_logged_user(client)
    anon_codes = []
    for _ in range(5):
        anon_codes.append(
            client.post(
                "/api/auth/login",
                json={"email": "ana@exemplo.com", "password": WRONG},
                headers=csrf_headers(client),
            ).status_code
        )
    assert anon_codes == [401] * 5
    assert _change(client, DEFAULT_PASSWORD).status_code == 429
    assert delete(client, "/api/users/me", {"password": DEFAULT_PASSWORD}).status_code == 429


def test_OK_31_resend_without_prior_attacker_keeps_victim_password(client: TestClient) -> None:
    register(client, "ana@exemplo.com", "Ana Souza", "Minha-Senha-Unica-1")
    post(client, "/api/auth/resend-verification", {"email": "ana@exemplo.com"})
    post(
        client,
        "/api/auth/verify-email",
        {"token": last_token("ana@exemplo.com"), "password": "Minha-Senha-Unica-1"},
    )
    assert login(client, "ana@exemplo.com", "Minha-Senha-Unica-1").status_code == 200
