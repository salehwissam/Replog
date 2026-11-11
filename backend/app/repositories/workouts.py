from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy import Select, delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Exercise,
    PersonalRecord,
    SplitExercise,
    User,
    WorkoutSession,
    WorkoutSet,
    WorkoutSplit,
)
from app.models.workout import WARMUP_SET_TYPE


class ExerciseRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _visible(self, user_id: int) -> Select[Exercise]:
        return select(Exercise).where(
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
            Exercise.archived_at.is_(None),
        )

    def list_visible(
        self, user_id: int, query: str | None = None, group: str | None = None
    ) -> Sequence[Exercise]:
        stmt = self._visible(user_id)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(Exercise.name.ilike(f"%{escaped}%", escape="\\"))
        if group:
            stmt = stmt.where(Exercise.muscle_group == group)
        return self.db.scalars(stmt.order_by(Exercise.muscle_group, Exercise.name)).all()

    def get_visible(self, user_id: int, exercise_id: int) -> Exercise | None:
        return self.db.scalar(self._visible(user_id).where(Exercise.id == exercise_id))

    def get_visible_including_archived(self, user_id: int, exercise_id: int) -> Exercise | None:
        return self.db.scalar(
            select(Exercise).where(
                Exercise.id == exercise_id,
                or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
            )
        )

    def get_own(self, user_id: int, exercise_id: int) -> Exercise | None:
        return self.db.scalar(
            select(Exercise).where(Exercise.id == exercise_id, Exercise.user_id == user_id)
        )

    def name_taken(self, user_id: int, name: str, exclude_id: int | None = None) -> bool:
        stmt = select(Exercise.id).where(
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
            Exercise.archived_at.is_(None),
            func.lower(Exercise.name) == name.lower(),
        )
        if exclude_id is not None:
            stmt = stmt.where(Exercise.id != exclude_id)
        return self.db.scalar(stmt.limit(1)) is not None

    def get_own_archived_by_name(self, user_id: int, name: str) -> Exercise | None:
        return self.db.scalar(
            select(Exercise).where(
                Exercise.user_id == user_id,
                Exercise.archived_at.is_not(None),
                func.lower(Exercise.name) == name.lower(),
            )
        )

    def add(self, exercise: Exercise) -> Exercise:
        self.db.add(exercise)
        self.db.flush()
        return exercise


class SplitRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base(self, user_id: int) -> Select[WorkoutSplit]:
        return (
            select(WorkoutSplit)
            .where(WorkoutSplit.user_id == user_id)
            .options(selectinload(WorkoutSplit.exercises).selectinload(SplitExercise.exercise))
        )

    def list(self, user_id: int) -> Sequence[WorkoutSplit]:
        return self.db.scalars(self._base(user_id).order_by(WorkoutSplit.letter)).all()

    def get_by_letter(self, user_id: int, letter: str) -> WorkoutSplit | None:
        return self.db.scalar(self._base(user_id).where(WorkoutSplit.letter == letter))

    def get(self, user_id: int, split_id: int) -> WorkoutSplit | None:
        return self.db.scalar(self._base(user_id).where(WorkoutSplit.id == split_id))


class WorkoutRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _sessions_with_working_sets(user_id: int, exercise_id: int) -> Select[int]:
        return select(WorkoutSet.session_id).where(
            WorkoutSet.user_id == user_id,
            WorkoutSet.exercise_id == exercise_id,
            WorkoutSet.set_type != WARMUP_SET_TYPE,
        )

    def lock_user(self, user_id: int) -> None:
        self.db.execute(select(User.id).where(User.id == user_id).with_for_update())

    def get_session(self, user_id: int, session_id: int) -> WorkoutSession | None:
        return self.db.scalar(
            select(WorkoutSession)
            .where(WorkoutSession.id == session_id, WorkoutSession.user_id == user_id)
            .options(selectinload(WorkoutSession.sets).selectinload(WorkoutSet.exercise))
        )

    def latest_session_since(self, user_id: int, since: date) -> WorkoutSession | None:
        return self.db.scalar(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.local_date >= since)
            .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
            .limit(1)
        )

    def get_active(self, user_id: int) -> WorkoutSession | None:
        return self.db.scalar(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.finished_at.is_(None))
            .order_by(WorkoutSession.started_at.desc())
            .limit(1)
        )

    def get_set(self, user_id: int, session_id: int, set_id: int) -> WorkoutSet | None:
        return self.db.scalar(
            select(WorkoutSet).where(
                WorkoutSet.id == set_id,
                WorkoutSet.session_id == session_id,
                WorkoutSet.user_id == user_id,
            )
        )

    def sets_for_exercise(self, user_id: int, exercise_id: int) -> Sequence[WorkoutSet]:
        return self.db.scalars(
            select(WorkoutSet)
            .where(WorkoutSet.user_id == user_id, WorkoutSet.exercise_id == exercise_id)
            .order_by(WorkoutSet.performed_at, WorkoutSet.id)
        ).all()

    def sets_in_session(
        self, user_id: int, session_id: int, exercise_id: int | None = None
    ) -> Sequence[WorkoutSet]:
        stmt = select(WorkoutSet).where(
            WorkoutSet.user_id == user_id, WorkoutSet.session_id == session_id
        )
        if exercise_id is not None:
            stmt = stmt.where(WorkoutSet.exercise_id == exercise_id)
        return self.db.scalars(stmt.order_by(WorkoutSet.performed_at, WorkoutSet.id)).all()

    def count_sets_in_session(self, session_id: int) -> int:
        return int(
            self.db.scalar(
                select(func.count(WorkoutSet.id)).where(WorkoutSet.session_id == session_id)
            )
            or 0
        )

    def next_set_number(self, session_id: int, exercise_id: int) -> int:
        current = self.db.scalar(
            select(func.max(WorkoutSet.set_number)).where(
                WorkoutSet.session_id == session_id, WorkoutSet.exercise_id == exercise_id
            )
        )
        return int(current or 0) + 1

    def list_sessions(
        self,
        user_id: int,
        *,
        date_from: date | None = None,
        date_to: date | None = None,
        exercise_id: int | None = None,
        split_id: int | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[Sequence[WorkoutSession], int]:
        stmt = select(WorkoutSession).where(WorkoutSession.user_id == user_id)
        if date_from:
            stmt = stmt.where(WorkoutSession.local_date >= date_from)
        if date_to:
            stmt = stmt.where(WorkoutSession.local_date <= date_to)
        if split_id:
            stmt = stmt.where(WorkoutSession.split_id == split_id)
        if exercise_id:
            stmt = stmt.where(
                WorkoutSession.id.in_(
                    select(WorkoutSet.session_id).where(
                        WorkoutSet.user_id == user_id, WorkoutSet.exercise_id == exercise_id
                    )
                )
            )
        total = int(self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
        items = self.db.scalars(
            stmt.options(
                selectinload(WorkoutSession.sets).selectinload(WorkoutSet.exercise),
                selectinload(WorkoutSession.split),
            )
            .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
        return items, total

    def sessions_between(self, user_id: int, start: date, end: date) -> Sequence[WorkoutSession]:
        return self.db.scalars(
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.local_date >= start,
                WorkoutSession.local_date <= end,
            )
            .options(selectinload(WorkoutSession.sets), selectinload(WorkoutSession.split))
            .order_by(WorkoutSession.started_at)
        ).all()

    def session_dates(self, user_id: int) -> Sequence[date]:
        return self.db.scalars(
            select(WorkoutSession.local_date)
            .where(WorkoutSession.user_id == user_id)
            .distinct()
            .order_by(WorkoutSession.local_date.desc())
        ).all()

    def count_sessions(self, user_id: int) -> int:
        return int(
            self.db.scalar(
                select(func.count(WorkoutSession.id)).where(WorkoutSession.user_id == user_id)
            )
            or 0
        )

    def previous_session_with_exercise(
        self, user_id: int, exercise_id: int, before_session: WorkoutSession
    ) -> WorkoutSession | None:
        return self.db.scalar(
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.id != before_session.id,
                WorkoutSession.started_at < before_session.started_at,
                WorkoutSession.intensity == before_session.intensity,
                WorkoutSession.id.in_(self._sessions_with_working_sets(user_id, exercise_id)),
            )
            .options(selectinload(WorkoutSession.sets))
            .order_by(WorkoutSession.started_at.desc())
            .limit(1)
        )

    def sessions_with_exercise(self, user_id: int, exercise_id: int) -> Sequence[WorkoutSession]:
        return self.db.scalars(
            select(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.id.in_(self._sessions_with_working_sets(user_id, exercise_id)),
            )
            .options(selectinload(WorkoutSession.sets))
            .order_by(WorkoutSession.started_at)
        ).all()


class RecordRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_exercise(self, user_id: int, exercise_id: int) -> Sequence[PersonalRecord]:
        return self.db.scalars(
            select(PersonalRecord)
            .where(PersonalRecord.user_id == user_id, PersonalRecord.exercise_id == exercise_id)
            .options(selectinload(PersonalRecord.exercise))
            .order_by(PersonalRecord.achieved_at, PersonalRecord.id)
        ).all()

    def delete_for_exercise(self, user_id: int, exercise_id: int) -> None:
        self.db.execute(
            delete(PersonalRecord)
            .where(PersonalRecord.user_id == user_id, PersonalRecord.exercise_id == exercise_id)
            .execution_options(synchronize_session=False)
        )

    def best_values(self, user_id: int, exercise_id: int) -> dict[str, Decimal]:
        rows = self.db.execute(
            select(PersonalRecord.record_type, func.max(PersonalRecord.value))
            .where(PersonalRecord.user_id == user_id, PersonalRecord.exercise_id == exercise_id)
            .group_by(PersonalRecord.record_type)
        ).all()
        return {str(t): Decimal(v) for t, v in rows if v is not None}

    def recent(self, user_id: int, limit: int, *, only_beaten: bool) -> Sequence[PersonalRecord]:
        stmt = select(PersonalRecord).where(PersonalRecord.user_id == user_id)
        if only_beaten:
            stmt = stmt.where(PersonalRecord.previous_value.is_not(None))
        return self.db.scalars(
            stmt.options(selectinload(PersonalRecord.exercise))
            .order_by(PersonalRecord.achieved_at.desc(), PersonalRecord.id.desc())
            .limit(limit)
        ).all()

    def for_session(self, user_id: int, session_id: int) -> Sequence[PersonalRecord]:
        return self.db.scalars(
            select(PersonalRecord)
            .where(PersonalRecord.user_id == user_id, PersonalRecord.session_id == session_id)
            .options(selectinload(PersonalRecord.exercise))
            .order_by(PersonalRecord.achieved_at, PersonalRecord.id)
        ).all()

    def count_by_session(self, user_id: int, session_ids: Sequence[int]) -> dict[int, int]:
        if not session_ids:
            return {}
        rows = self.db.execute(
            select(PersonalRecord.session_id, func.count(PersonalRecord.id))
            .where(
                PersonalRecord.user_id == user_id,
                PersonalRecord.session_id.in_(session_ids),
                PersonalRecord.previous_value.is_not(None),
            )
            .group_by(PersonalRecord.session_id)
        ).all()
        return {int(sid): int(n) for sid, n in rows}

    def all_current(self, user_id: int) -> Sequence[PersonalRecord]:
        return self.db.scalars(
            select(PersonalRecord)
            .where(PersonalRecord.user_id == user_id)
            .options(selectinload(PersonalRecord.exercise))
            .order_by(PersonalRecord.achieved_at, PersonalRecord.id)
        ).all()
