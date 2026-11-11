from dataclasses import dataclass
from datetime import timedelta

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import generate_token, hash_token, tokens_equal
from app.db.base import utcnow
from app.db.session import get_db
from app.middleware.security import CSRF_HEADER, UNSAFE_METHODS
from app.models import User, UserSession
from app.repositories.users import SessionRepository

TOUCH_INTERVAL = timedelta(minutes=5)


def settings_dep(request: Request) -> Settings:
    settings: Settings = getattr(request.app.state, "settings", None) or get_settings()
    return settings


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "desconhecido"


@dataclass
class CurrentAuth:
    user: User
    session: UserSession


def get_current_auth(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> CurrentAuth:
    token = request.cookies.get(settings.session_cookie)
    if not token or len(token) > 128:
        raise UnauthorizedError()

    now = utcnow()
    session = SessionRepository(db).get_active_by_token_hash(hash_token(token), now)
    absolute_limit = timedelta(days=settings.session_absolute_days)
    if session is None or session.created_at + absolute_limit <= now:
        raise UnauthorizedError("Sua sessão expirou. Entre novamente.", code="sessao_expirada")

    user = session.user
    if not user.is_active or not user.is_verified:
        raise UnauthorizedError()

    if request.method in UNSAFE_METHODS:
        header = request.headers.get(CSRF_HEADER, "")
        if not header or not tokens_equal(hash_token(header), session.csrf_hash):
            raise ForbiddenError(
                "Sessão de segurança expirada. Recarregue a página.", code="csrf_invalido"
            )

    if now - session.last_seen_at >= TOUCH_INTERVAL:
        session.last_seen_at = now
        session.expires_at = min(
            now + timedelta(days=settings.session_idle_days),
            session.created_at + absolute_limit,
        )
        db.commit()

    return CurrentAuth(user=user, session=session)


def get_current_user(auth: CurrentAuth = Depends(get_current_auth)) -> User:
    return auth.user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise ForbiddenError()
    return user


def set_session_cookies(
    response: Response, settings: Settings, session_token: str, csrf_token: str
) -> None:
    max_age = settings.session_absolute_days * 24 * 3600
    response.set_cookie(
        settings.session_cookie,
        session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    set_csrf_cookie(response, settings, csrf_token, max_age=max_age)


def set_csrf_cookie(
    response: Response, settings: Settings, csrf_token: str | None = None, max_age: int = 86400
) -> str:
    token = csrf_token or generate_token()
    response.set_cookie(
        settings.csrf_cookie,
        token,
        max_age=max_age,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return token


def clear_session_cookies(response: Response, settings: Settings) -> None:
    for name in (settings.session_cookie, settings.csrf_cookie):
        response.delete_cookie(name, path="/", secure=settings.cookie_secure, samesite="lax")
