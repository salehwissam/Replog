from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import EmailToken, LoginAttempt, User, UserSession


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email.lower()))

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user

    def delete(self, user: User) -> None:
        self.db.delete(user)


class SessionRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, session: UserSession) -> UserSession:
        self.db.add(session)
        self.db.flush()
        return session

    def get_active_by_token_hash(self, token_hash: str, now: datetime) -> UserSession | None:
        return self.db.scalar(
            select(UserSession).where(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )

    def revoke_all_for_user(
        self, user_id: int, now: datetime, *, except_id: int | None = None
    ) -> int:
        stmt = update(UserSession).where(
            UserSession.user_id == user_id, UserSession.revoked_at.is_(None)
        )
        if except_id is not None:
            stmt = stmt.where(UserSession.id != except_id)
        result = self.db.execute(stmt.values(revoked_at=now))
        return int(getattr(result, "rowcount", 0) or 0)

    def purge_expired(self, now: datetime) -> None:
        self.db.execute(
            delete(UserSession).where(
                (UserSession.expires_at < now) | UserSession.revoked_at.is_not(None)
            )
        )


class EmailTokenRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, token: EmailToken) -> EmailToken:
        self.db.add(token)
        self.db.flush()
        return token

    def peek(self, token_hash: str, purpose: str, now: datetime) -> EmailToken | None:
        return self.db.scalar(
            select(EmailToken).where(
                EmailToken.token_hash == token_hash,
                EmailToken.purpose == purpose,
                EmailToken.used_at.is_(None),
                EmailToken.expires_at > now,
            )
        )

    def pending_registrations(
        self, user_id: int, now: datetime, limit: int = 5
    ) -> list[EmailToken]:
        return list(
            self.db.scalars(
                select(EmailToken)
                .where(
                    EmailToken.user_id == user_id,
                    EmailToken.purpose == "verify_email",
                    EmailToken.used_at.is_(None),
                    EmailToken.expires_at > now,
                    EmailToken.pending_password_hash.is_not(None),
                )
                .order_by(EmailToken.created_at.desc())
                .limit(limit)
            )
        )

    def consume(self, token_hash: str, purpose: str, now: datetime) -> EmailToken | None:
        result = self.db.execute(
            update(EmailToken)
            .where(
                EmailToken.token_hash == token_hash,
                EmailToken.purpose == purpose,
                EmailToken.used_at.is_(None),
                EmailToken.expires_at > now,
            )
            .values(used_at=now)
            .execution_options(synchronize_session=False)
        )
        if int(getattr(result, "rowcount", 0) or 0) != 1:
            return None
        return self.db.scalar(select(EmailToken).where(EmailToken.token_hash == token_hash))

    def count_recent(self, user_id: int, purpose: str, since: datetime) -> int:
        return int(
            self.db.scalar(
                select(func.count(EmailToken.id)).where(
                    EmailToken.user_id == user_id,
                    EmailToken.purpose == purpose,
                    EmailToken.created_at >= since,
                )
            )
            or 0
        )

    def invalidate_all(self, user_id: int, purpose: str, now: datetime) -> None:
        self.db.execute(
            update(EmailToken)
            .where(
                EmailToken.user_id == user_id,
                EmailToken.purpose == purpose,
                EmailToken.used_at.is_(None),
            )
            .values(used_at=now)
        )


class LoginAttemptRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, email: str, ip: str, success: bool) -> LoginAttempt:
        attempt = LoginAttempt(email=email, ip=ip, success=success)
        self.db.add(attempt)
        self.db.flush()
        return attempt

    def remove(self, attempt: LoginAttempt) -> None:
        self.db.delete(attempt)

    def failures_for_email(self, email: str, since: datetime) -> int:
        return self._count(LoginAttempt.email == email, since)

    def failures_for_ip(self, ip: str, since: datetime) -> int:
        return self._count(LoginAttempt.ip == ip, since)

    def _count(self, condition: object, since: datetime) -> int:
        return int(
            self.db.scalar(
                select(func.count(LoginAttempt.id)).where(
                    condition,  # type: ignore[arg-type]
                    LoginAttempt.success.is_(False),
                    LoginAttempt.created_at >= since,
                )
            )
            or 0
        )

    def clear_failures_for_email(self, email: str) -> None:
        self.db.execute(
            delete(LoginAttempt).where(LoginAttempt.email == email, LoginAttempt.success.is_(False))
        )

    def purge_older_than(self, before: datetime) -> None:
        self.db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < before))
