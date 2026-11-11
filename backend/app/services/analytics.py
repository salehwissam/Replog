from collections.abc import Iterable
from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Float, distinct, func, select, type_coerce
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet
from app.repositories.workouts import RecordRepository, WorkoutRepository
from app.schemas.analytics import (
    AnalyticsSummaryOut,
    FavoriteExerciseOut,
    HeatmapDayOut,
    HeaviestSetOut,
    MuscleSetsOut,
    MuscleVolumeOut,
    PreviousSessionOut,
    SessionSummaryOut,
)
from app.seeds.exercises import MUSCLE_GROUPS
from app.services.records import set_volume
from app.services.set_rules import WARMUP_SET_TYPE, working_sets
from app.services.stats import week_start
from app.services.workouts import duration_seconds

ONE_WEEK = timedelta(weeks=1)


def _is_working() -> ColumnElement[bool]:
    return WorkoutSet.set_type != WARMUP_SET_TYPE


def _volume_sum() -> ColumnElement[float]:
    return type_coerce(func.coalesce(func.sum(WorkoutSet.weight_kg * WorkoutSet.reps), 0), Float)


def _kg(value: float | Decimal | None) -> float:
    return round(float(value or 0), 2)


def muscle_label(group: str) -> str:
    return MUSCLE_GROUPS.get(group, group)


def current_streak(weeks: set[date], today: date) -> int:
    current = week_start(today)
    if current not in weeks:
        current -= ONE_WEEK
    streak = 0
    while current in weeks:
        streak += 1
        current -= ONE_WEEK
    return streak


def best_streak(weeks: Iterable[date]) -> int:
    best = run = 0
    previous: date | None = None
    for week in sorted(set(weeks)):
        run = run + 1 if previous is not None and week - previous == ONE_WEEK else 1
        best = max(best, run)
        previous = week
    return best


class AnalyticsService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user

    def today(self) -> date:
        return utcnow().astimezone(ZoneInfo(self.user.timezone or "UTC")).date()

    def summary(self) -> AnalyticsSummaryOut:
        uid = self.user.id
        total_workouts, first_date = self.db.execute(
            select(func.count(WorkoutSession.id), func.min(WorkoutSession.local_date)).where(
                WorkoutSession.user_id == uid
            )
        ).one()
        total_sets, total_reps, total_volume = self.db.execute(
            select(
                func.count(WorkoutSet.id),
                func.coalesce(func.sum(WorkoutSet.reps), 0),
                _volume_sum(),
            ).where(WorkoutSet.user_id == uid, _is_working())
        ).one()
        records_beaten = self.db.scalar(
            select(func.count(PersonalRecord.id)).where(
                PersonalRecord.user_id == uid, PersonalRecord.previous_value.is_not(None)
            )
        )
        dates = self.db.scalars(
            select(WorkoutSession.local_date).where(WorkoutSession.user_id == uid).distinct()
        ).all()
        weeks = {week_start(d) for d in dates}
        return AnalyticsSummaryOut(
            total_workouts=int(total_workouts or 0),
            total_sets=int(total_sets or 0),
            total_reps=int(total_reps or 0),
            total_volume_kg=_kg(total_volume),
            records_beaten=int(records_beaten or 0),
            current_streak_weeks=current_streak(weeks, self.today()),
            best_streak_weeks=best_streak(weeks),
            first_workout_date=first_date,
            favorite_exercise=self._favorite_exercise(),
            heaviest_set=self._heaviest_set(),
        )

    def _heaviest_set(self) -> HeaviestSetOut | None:
        row = self.db.execute(
            select(
                Exercise.id,
                Exercise.name,
                WorkoutSet.weight_kg,
                WorkoutSet.reps,
                WorkoutSession.local_date,
            )
            .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
            .join(WorkoutSession, WorkoutSession.id == WorkoutSet.session_id)
            .where(WorkoutSet.user_id == self.user.id, _is_working(), WorkoutSet.weight_kg > 0)
            .order_by(
                WorkoutSet.weight_kg.desc(),
                WorkoutSet.reps.desc(),
                WorkoutSet.performed_at,
                WorkoutSet.id,
            )
            .limit(1)
        ).first()
        if row is None:
            return None
        return HeaviestSetOut(
            exercise_id=row[0], name=row[1], weight_kg=_kg(row[2]), reps=row[3], date=row[4]
        )

    def _favorite_exercise(self) -> FavoriteExerciseOut | None:
        sessions = func.count(distinct(WorkoutSet.session_id))
        row = self.db.execute(
            select(Exercise.id, Exercise.name, sessions)
            .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
            .where(WorkoutSet.user_id == self.user.id, _is_working())
            .group_by(Exercise.id, Exercise.name)
            .order_by(sessions.desc(), Exercise.name, Exercise.id)
            .limit(1)
        ).first()
        if row is None:
            return None
        return FavoriteExerciseOut(id=row[0], name=row[1], sessions=int(row[2]))

    def muscles(self, weeks: int) -> list[MuscleVolumeOut]:
        today = self.today()
        start = week_start(today) - (weeks - 1) * ONE_WEEK
        sets = func.count(WorkoutSet.id)
        rows = self.db.execute(
            select(Exercise.muscle_group, sets, _volume_sum())
            .join(WorkoutSession, WorkoutSession.id == WorkoutSet.session_id)
            .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
            .where(
                WorkoutSet.user_id == self.user.id,
                WorkoutSession.user_id == self.user.id,
                WorkoutSession.local_date >= start,
                WorkoutSession.local_date <= today,
                _is_working(),
            )
            .group_by(Exercise.muscle_group)
        ).all()
        out = [
            MuscleVolumeOut(
                muscle_group=group, label=muscle_label(group), sets=int(n), volume_kg=_kg(volume)
            )
            for group, n, volume in rows
            if n
        ]
        out.sort(key=lambda m: (-m.sets, -m.volume_kg, m.label))
        return out

    def heatmap(self, days: int) -> list[HeatmapDayOut]:
        today = self.today()
        start = today - timedelta(days=days - 1)
        uid = self.user.id
        in_range = (
            WorkoutSession.user_id == uid,
            WorkoutSession.local_date >= start,
            WorkoutSession.local_date <= today,
        )
        workouts: dict[date, int] = {
            d: int(n)
            for d, n in self.db.execute(
                select(WorkoutSession.local_date, func.count(WorkoutSession.id))
                .where(*in_range)
                .group_by(WorkoutSession.local_date)
            ).all()
        }
        volumes: dict[date, float] = {}
        sets: dict[date, int] = {}
        for d, v, n in self.db.execute(
            select(WorkoutSession.local_date, _volume_sum(), func.count(WorkoutSet.id))
            .join(WorkoutSet, WorkoutSet.session_id == WorkoutSession.id)
            .where(*in_range, WorkoutSet.user_id == uid, _is_working())
            .group_by(WorkoutSession.local_date)
        ).all():
            volumes[d] = _kg(v)
            sets[d] = int(n)
        result: list[HeatmapDayOut] = []
        for offset in range(days):
            day = start + timedelta(days=offset)
            result.append(
                HeatmapDayOut(
                    date=day,
                    volume_kg=volumes.get(day, 0.0),
                    workouts=workouts.get(day, 0),
                    sets=sets.get(day, 0),
                )
            )
        return result

    def session_summary(self, session_id: int) -> SessionSummaryOut:
        session = WorkoutRepository(self.db).get_session(self.user.id, session_id)
        if session is None:
            raise NotFoundError("Treino não encontrado.")

        counted = working_sets(session.sets)
        volume = _kg(sum((set_volume(Decimal(s.weight_kg), s.reps) for s in counted), Decimal(0)))
        by_group: dict[str, int] = {}
        for s in counted:
            by_group[s.exercise.muscle_group] = by_group.get(s.exercise.muscle_group, 0) + 1
        groups = sorted(
            (
                MuscleSetsOut(muscle_group=g, label=muscle_label(g), sets=n)
                for g, n in by_group.items()
            ),
            key=lambda m: (-m.sets, m.label),
        )
        records = RecordRepository(self.db).count_by_session(self.user.id, [session.id])

        previous = self._previous_same_split(session)
        return SessionSummaryOut(
            session_id=session.id,
            volume_kg=volume,
            sets=len(counted),
            reps=sum(s.reps for s in counted),
            duration_seconds=duration_seconds(session),
            records_beaten=records.get(session.id, 0),
            muscle_groups=groups,
            previous_same_split=previous,
            delta_volume_kg=round(volume - previous.volume_kg, 2) if previous else None,
        )

    def _previous_same_split(self, session: WorkoutSession) -> PreviousSessionOut | None:
        if session.split_id is None:
            return None
        sets = func.count(WorkoutSet.id)
        row = self.db.execute(
            select(WorkoutSession.id, WorkoutSession.local_date, _volume_sum(), sets)
            .join(WorkoutSet, WorkoutSet.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == self.user.id,
                WorkoutSet.user_id == self.user.id,
                WorkoutSession.split_id == session.split_id,
                WorkoutSession.intensity == session.intensity,
                WorkoutSession.id != session.id,
                WorkoutSession.started_at < session.started_at,
                _is_working(),
            )
            .group_by(WorkoutSession.id, WorkoutSession.local_date, WorkoutSession.started_at)
            .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc())
            .limit(1)
        ).first()
        if row is None:
            return None
        return PreviousSessionOut(
            session_id=row[0], local_date=row[1], volume_kg=_kg(row[2]), sets=int(row[3])
        )
