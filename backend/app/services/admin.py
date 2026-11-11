import logging
from datetime import timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.logging import log_event
from app.db.base import utcnow
from app.models import Exercise, User, UserSession, WorkoutSession, WorkoutSet
from app.repositories.users import EmailTokenRepository, SessionRepository
from app.repositories.workouts import ExerciseRepository
from app.schemas.admin import AdminStatsOut, AdminUserOut, AdminUserPage
from app.schemas.workout import ExerciseIn

logger = logging.getLogger("replog.admin")


def _count(db: Session, stmt: object) -> int:
    return int(db.scalar(stmt) or 0)  # type: ignore[call-overload]


class AdminService:
    def __init__(self, db: Session, admin: User) -> None:
        self.db = db
        self.admin = admin

    def stats(self) -> AdminStatsOut:
        db = self.db
        week_ago = utcnow() - timedelta(days=7)
        return AdminStatsOut(
            users_total=_count(db, select(func.count(User.id))),
            users_verified=_count(
                db, select(func.count(User.id)).where(User.email_verified_at.is_not(None))
            ),
            users_inactive=_count(db, select(func.count(User.id)).where(User.is_active.is_(False))),
            users_active_7d=_count(
                db,
                select(func.count(func.distinct(UserSession.user_id))).where(
                    UserSession.last_seen_at >= week_ago
                ),
            ),
            new_users_7d=_count(db, select(func.count(User.id)).where(User.created_at >= week_ago)),
            workouts_total=_count(db, select(func.count(WorkoutSession.id))),
            workouts_7d=_count(
                db,
                select(func.count(WorkoutSession.id)).where(WorkoutSession.started_at >= week_ago),
            ),
            sets_total=_count(db, select(func.count(WorkoutSet.id))),
        )

    def list_users(self, query: str | None, page: int, page_size: int) -> AdminUserPage:
        log_event(logger, "admin_consultou_usuarios", admin_id=self.admin.id, com_busca=bool(query))
        stmt = select(User)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{escaped}%"
            stmt = stmt.where(
                or_(User.email.ilike(like, escape="\\"), User.name.ilike(like, escape="\\"))
            )
        total = _count(self.db, select(func.count()).select_from(stmt.subquery()))
        users = self.db.scalars(
            stmt.order_by(User.created_at.desc(), User.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return AdminUserPage(
            items=self.describe(list(users)), total=total, page=page, page_size=page_size
        )

    def describe(self, users: list[User]) -> list[AdminUserOut]:
        ids = [u.id for u in users]
        last_seen = dict(
            self.db.execute(
                select(UserSession.user_id, func.max(UserSession.last_seen_at))
                .where(UserSession.user_id.in_(ids))
                .group_by(UserSession.user_id)
            ).all()
        )
        workouts = dict(
            self.db.execute(
                select(WorkoutSession.user_id, func.count(WorkoutSession.id))
                .where(WorkoutSession.user_id.in_(ids))
                .group_by(WorkoutSession.user_id)
            ).all()
        )
        return [
            AdminUserOut(
                id=u.id,
                name=u.name,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                is_verified=u.is_verified,
                created_at=u.created_at,
                last_seen_at=last_seen.get(u.id),
                workouts=int(workouts.get(u.id, 0)),
            )
            for u in users
        ]

    def set_active(self, user_id: int, active: bool) -> User:
        user = self.db.get(User, user_id)
        if user is None:
            raise NotFoundError("Usuário não encontrado.")
        if user.id == self.admin.id:
            raise ForbiddenError("Você não pode desativar a própria conta por aqui.")
        if user.role == "admin":
            raise ForbiddenError("Contas de administrador não podem ser alteradas pelo painel.")
        user.is_active = active
        if not active:
            now = utcnow()
            SessionRepository(self.db).revoke_all_for_user(user.id, now)
            tokens = EmailTokenRepository(self.db)
            tokens.invalidate_all(user.id, "reset_password", now)
            tokens.invalidate_all(user.id, "verify_email", now)
        self.db.commit()
        log_event(
            logger,
            "admin_alterou_usuario",
            admin_id=self.admin.id,
            user_id=user.id,
            ativo=active,
        )
        return user

    def create_global_exercise(self, data: ExerciseIn) -> Exercise:
        exists = self.db.scalar(
            select(Exercise.id).where(
                Exercise.user_id.is_(None), func.lower(Exercise.name) == data.name.lower()
            )
        )
        if exists is not None:
            raise ConflictError(
                "Já existe um exercício com esse nome no catálogo.",
                fields={"name": "Já existe um exercício com esse nome no catálogo."},
            )
        exercise = ExerciseRepository(self.db).add(Exercise(user_id=None, **data.model_dump()))
        self.db.commit()
        log_event(logger, "admin_criou_exercicio", admin_id=self.admin.id, exercise_id=exercise.id)
        return exercise

    def archive_global_exercise(self, exercise_id: int) -> None:
        exercise = self.db.scalar(
            select(Exercise).where(Exercise.id == exercise_id, Exercise.user_id.is_(None))
        )
        if exercise is None or exercise.archived_at is not None:
            raise NotFoundError("Exercício não encontrado.")
        exercise.archived_at = utcnow()
        self.db.commit()
        log_event(
            logger, "admin_arquivou_exercicio", admin_id=self.admin.id, exercise_id=exercise_id
        )
