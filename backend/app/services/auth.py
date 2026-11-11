import contextlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError, TooManyRequestsError, UnauthorizedError
from app.core.logging import log_event
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    password_needs_rehash,
    verify_password,
)
from app.core.validators import validate_password, validate_timezone
from app.db.base import utcnow
from app.email import templates
from app.email.templates import EmailMessage
from app.models import EmailToken, User, UserSession
from app.repositories.users import (
    EmailTokenRepository,
    LoginAttemptRepository,
    SessionRepository,
    UserRepository,
)
from app.schemas.auth import RegisterIn

logger = logging.getLogger("replog.auth")

PURPOSE_VERIFY = "verify_email"
PURPOSE_RESET = "reset_password"
PURPOSE_NOTICE = "notice_account_exists"
MAX_EMAILS_PER_HOUR = 3


@dataclass
class NewSession:
    session: UserSession
    token: str
    csrf_token: str


class EmailNotVerifiedError(AppError):
    status_code = 403
    code = "email_nao_confirmado"
    message = "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada."


class InvalidTokenError(AppError):
    status_code = 400
    code = "link_invalido"
    message = "Este link é inválido ou expirou. Solicite um novo."


class PasswordPolicyError(AppError):
    status_code = 422
    code = "dados_invalidos"
    message = "Verifique os dados informados."


def _password_policy_error(exc: ValueError) -> AppError:
    return PasswordPolicyError(fields={"password": str(exc)})


class AuthService:
    def __init__(self, db: Session, settings: Settings) -> None:
        self.db = db
        self.settings = settings
        self.users = UserRepository(db)
        self.sessions = SessionRepository(db)
        self.tokens = EmailTokenRepository(db)
        self.attempts = LoginAttemptRepository(db)

    def _link(self, path: str, token: str) -> str:
        return f"{self.settings.frontend_url}{path}#token={token}"

    def _create_email_token(
        self,
        user: User,
        purpose: str,
        ttl: timedelta,
        *,
        pending_password_hash: str | None = None,
        pending_name: str | None = None,
    ) -> str:
        token = generate_token()
        self.tokens.add(
            EmailToken(
                user_id=user.id,
                purpose=purpose,
                token_hash=hash_token(token),
                expires_at=utcnow() + ttl,
                pending_password_hash=pending_password_hash,
                pending_name=pending_name,
            )
        )
        return token

    def _can_send(self, user: User, purpose: str) -> bool:
        since = utcnow() - timedelta(hours=1)
        return self.tokens.count_recent(user.id, purpose, since) < MAX_EMAILS_PER_HOUR

    def _guarded_verify(
        self, email: str, ip: str, password_hash: str | None, password: str
    ) -> bool:
        window_start = utcnow() - timedelta(minutes=self.settings.login_window_minutes)
        attempt = self.attempts.add(email, ip, success=False)
        self.db.commit()
        if (
            self.attempts.failures_for_email(email, window_start)
            > self.settings.login_max_failures_per_email
            or self.attempts.failures_for_ip(ip, window_start)
            > self.settings.login_max_failures_per_ip
        ):
            self.attempts.remove(attempt)
            self.db.commit()
            log_event(logger, "tentativa_bloqueada", level=logging.WARNING, ip=ip)
            raise TooManyRequestsError(
                f"Muitas tentativas. Aguarde {self.settings.login_window_minutes} "
                "minutos e tente novamente."
            )
        valid = verify_password(password_hash, password)
        if valid:
            attempt.success = True
            self.db.flush()
            self.attempts.clear_failures_for_email(email)
        self.db.commit()
        if not valid:
            log_event(logger, "senha_incorreta", level=logging.WARNING, ip=ip)
        return valid

    def register(self, data: RegisterIn) -> EmailMessage | None:
        password_hash = hash_password(data.password)
        existing = self.users.get_by_email(data.email)
        if existing is not None:
            log_event(logger, "cadastro_email_existente", user_id=existing.id)
            if not existing.is_verified:
                return self._verification_email(
                    existing, pending_password_hash=password_hash, pending_name=data.name
                )
            return self._account_exists_notice(existing)

        user = User(
            name=data.name,
            email=data.email,
            password_hash=password_hash,
            timezone=data.timezone,
        )
        try:
            self.users.add(user)
        except IntegrityError:
            self.db.rollback()
            return None
        message = self._verification_email(
            user,
            check_quota=False,
            pending_password_hash=password_hash,
            pending_name=data.name,
        )
        log_event(logger, "usuario_cadastrado", user_id=user.id)
        return message

    def _account_exists_notice(self, user: User) -> EmailMessage | None:
        if not self._can_send(user, PURPOSE_NOTICE):
            return None
        now = utcnow()
        self.tokens.add(
            EmailToken(
                user_id=user.id,
                purpose=PURPOSE_NOTICE,
                token_hash=hash_token(generate_token()),
                expires_at=now,
                used_at=now,
            )
        )
        self.db.commit()
        return templates.account_exists(
            user.email,
            user.name,
            f"{self.settings.frontend_url}/entrar",
            f"{self.settings.frontend_url}/esqueci-senha",
        )

    def _verification_email(
        self,
        user: User,
        *,
        check_quota: bool = True,
        pending_password_hash: str | None = None,
        pending_name: str | None = None,
    ) -> EmailMessage | None:
        if check_quota and not self._can_send(user, PURPOSE_VERIFY):
            return None
        hours = self.settings.verify_email_hours
        token = self._create_email_token(
            user,
            PURPOSE_VERIFY,
            timedelta(hours=hours),
            pending_password_hash=pending_password_hash,
            pending_name=pending_name,
        )
        self.db.commit()
        return templates.verify_email(user.email, self._link("/confirmar-email", token), hours)

    def resend_verification(self, email: str) -> EmailMessage | None:
        user = self.users.get_by_email(email)
        if user is None or user.is_verified or not user.is_active:
            return None
        return self._verification_email(user)

    def verify_email(self, token: str, password: str) -> User:
        now = utcnow()
        token_hash = hash_token(token)
        peeked = self.tokens.peek(token_hash, PURPOSE_VERIFY, now)
        user = self.users.get(peeked.user_id) if peeked else None
        if peeked is None or user is None:
            raise InvalidTokenError()

        candidates: list[tuple[str, str | None]] = []
        if user.email_verified_at is None:
            for rec in [peeked, *self.tokens.pending_registrations(user.id, now)]:
                if rec.pending_password_hash and all(
                    rec.pending_password_hash != h for h, _ in candidates
                ):
                    candidates.append((rec.pending_password_hash, rec.pending_name))
        if not candidates:
            candidates.append((user.password_hash, None))

        chosen = next(((h, n) for h, n in candidates if verify_password(h, password)), None)
        if chosen is None:
            raise AppError(
                "A senha não confere com a do cadastro.",
                code="senha_incorreta",
                fields={"password": "A senha não confere com a do cadastro."},
            )

        record = self.tokens.consume(token_hash, PURPOSE_VERIFY, now)
        if record is None:
            self.db.rollback()
            raise InvalidTokenError()
        if user.email_verified_at is None:
            user.password_hash, chosen_name = chosen
            if chosen_name:
                user.name = chosen_name
            user.email_verified_at = now
        self.tokens.invalidate_all(user.id, PURPOSE_VERIFY, now)
        self.sessions.revoke_all_for_user(user.id, now)
        self.db.commit()
        log_event(logger, "email_confirmado", user_id=user.id)
        return user

    def login(
        self,
        email: str,
        password: str,
        ip: str,
        user_agent: str | None,
        tz: str | None,
        previous_session_token: str | None = None,
    ) -> tuple[User, NewSession]:
        now = utcnow()
        user = self.users.get_by_email(email)
        valid = self._guarded_verify(email, ip, user.password_hash if user else None, password)
        if not valid or user is None or not user.is_active:
            raise UnauthorizedError("E-mail ou senha incorretos.", code="credenciais_invalidas")

        if not user.is_verified:
            raise EmailNotVerifiedError()

        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        if tz:
            with contextlib.suppress(ValueError):
                user.timezone = validate_timezone(tz)
        if previous_session_token and len(previous_session_token) <= 128:
            previous = self.sessions.get_active_by_token_hash(
                hash_token(previous_session_token), now
            )
            if previous is not None:
                previous.revoked_at = now
        new = self._create_session(user, ip, user_agent)
        self._maybe_housekeeping(now)
        self.db.commit()
        log_event(logger, "login_ok", user_id=user.id)
        return user, new

    def _create_session(self, user: User, ip: str | None, user_agent: str | None) -> NewSession:
        token = generate_token()
        csrf = generate_token()
        now = utcnow()
        session = self.sessions.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token(token),
                csrf_hash=hash_token(csrf),
                created_at=now,
                last_seen_at=now,
                expires_at=now + timedelta(days=self.settings.session_idle_days),
                ip=ip,
                user_agent=(user_agent or "")[:255] or None,
            )
        )
        return NewSession(session=session, token=token, csrf_token=csrf)

    def _maybe_housekeeping(self, now: datetime) -> None:
        if secrets.randbelow(50) == 0:
            self.attempts.purge_older_than(now - timedelta(days=1))
            self.sessions.purge_expired(now)

    def logout(self, session: UserSession) -> None:
        session.revoked_at = utcnow()
        self.db.commit()

    def logout_others(self, user: User, current: UserSession) -> int:
        count = self.sessions.revoke_all_for_user(user.id, utcnow(), except_id=current.id)
        self.db.commit()
        return count

    def forgot_password(self, email: str) -> EmailMessage | None:
        user = self.users.get_by_email(email)
        if user is None or not user.is_active or not self._can_send(user, PURPOSE_RESET):
            return None
        minutes = self.settings.reset_password_minutes
        token = self._create_email_token(user, PURPOSE_RESET, timedelta(minutes=minutes))
        self.db.commit()
        log_event(logger, "recuperacao_solicitada", user_id=user.id)
        return templates.reset_password(
            user.email, user.name, self._link("/redefinir-senha", token), minutes
        )

    def reset_password(self, token: str, new_password: str) -> EmailMessage:
        now = utcnow()
        token_hash = hash_token(token)
        peeked = self.tokens.peek(token_hash, PURPOSE_RESET, now)
        owner = self.users.get(peeked.user_id) if peeked else None
        if owner is None or not owner.is_active:
            raise InvalidTokenError()
        try:
            validate_password(new_password, email=owner.email)
        except ValueError as exc:
            raise _password_policy_error(exc) from exc
        new_hash = hash_password(new_password)
        self.db.commit()
        record = self.tokens.consume(token_hash, PURPOSE_RESET, now)
        if record is None or record.user_id != owner.id:
            self.db.rollback()
            raise InvalidTokenError()
        owner.password_hash = new_hash
        if owner.email_verified_at is None:
            owner.email_verified_at = now
            self.tokens.invalidate_all(owner.id, PURPOSE_VERIFY, now)
        self.tokens.invalidate_all(owner.id, PURPOSE_RESET, now)
        self.sessions.revoke_all_for_user(owner.id, now)
        self.attempts.clear_failures_for_email(owner.email)
        self.db.commit()
        log_event(logger, "senha_redefinida", user_id=owner.id)
        return templates.password_changed(
            owner.email, owner.name, f"{self.settings.frontend_url}/esqueci-senha"
        )

    def change_password(
        self,
        user: User,
        current: UserSession,
        current_password: str,
        new_password: str,
        ip: str,
    ) -> tuple[NewSession, EmailMessage]:
        try:
            validate_password(new_password, email=user.email)
        except ValueError as exc:
            raise _password_policy_error(exc) from exc
        if not self._guarded_verify(user.email, ip, user.password_hash, current_password):
            raise AppError(
                "Senha atual incorreta.",
                code="senha_incorreta",
                fields={"current_password": "Senha atual incorreta."},
            )
        now = utcnow()
        user.password_hash = hash_password(new_password)
        self.sessions.revoke_all_for_user(user.id, now)
        self.tokens.invalidate_all(user.id, PURPOSE_RESET, now)
        new = self._create_session(user, current.ip, current.user_agent)
        self.db.commit()
        log_event(logger, "senha_alterada", user_id=user.id)
        return new, templates.password_changed(
            user.email, user.name, f"{self.settings.frontend_url}/esqueci-senha"
        )

    def delete_account(self, user: User, password: str, ip: str) -> None:
        if not self._guarded_verify(user.email, ip, user.password_hash, password):
            raise AppError(
                "Senha incorreta.",
                code="senha_incorreta",
                fields={"password": "Senha incorreta."},
            )
        user_id = user.id
        self.users.delete(user)
        self.db.commit()
        log_event(logger, "conta_excluida", user_id=user_id)
