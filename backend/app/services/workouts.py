from collections import OrderedDict
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, ConflictError, NotFoundError
from app.db.base import utcnow
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet
from app.models.workout import DEFAULT_INTENSITY
from app.repositories.workouts import (
    ExerciseRepository,
    RecordRepository,
    SplitRepository,
    WorkoutRepository,
)
from app.schemas.workout import (
    ExerciseComparison,
    ExerciseSummary,
    RecordOut,
    SessionExerciseOut,
    SessionListItem,
    SessionOut,
    SessionStartIn,
    SessionUpdateIn,
    SetIn,
    SetOut,
    SetUpdateIn,
)
from app.services.catalog import exercise_out, split_out
from app.services.records import apply_new_set, epley_1rm, rebuild_exercise_records, set_volume
from app.services.set_rules import working_sets

MAX_SETS_PER_SESSION = 300


class ActiveSessionExistsError(AppError):
    status_code = 409
    code = "treino_em_andamento"
    message = "Você já tem um treino em andamento. Finalize-o antes de começar outro."


class SessionFinishedError(AppError):
    status_code = 409
    code = "treino_finalizado"
    message = "Este treino já foi finalizado. Você pode editar ou apagar as séries existentes."


def set_out(s: WorkoutSet) -> SetOut:
    weight = Decimal(s.weight_kg)
    e1rm = epley_1rm(weight, s.reps)
    return SetOut(
        id=s.id,
        exercise_id=s.exercise_id,
        set_number=s.set_number,
        reps=s.reps,
        weight_kg=float(weight),
        volume_kg=float(set_volume(weight, s.reps)),
        est_1rm=float(e1rm) if e1rm is not None else None,
        set_type=s.set_type,
        rpe=float(s.rpe) if s.rpe is not None else None,
        rest_seconds=s.rest_seconds,
        notes=s.notes,
        performed_at=s.performed_at,
    )


def record_out(r: PersonalRecord) -> RecordOut:
    return RecordOut(
        id=r.id,
        exercise_id=r.exercise_id,
        exercise_name=r.exercise.name,
        record_type=r.record_type,
        value=float(r.value),
        previous_value=float(r.previous_value) if r.previous_value is not None else None,
        set_id=r.set_id,
        session_id=r.session_id,
        achieved_at=r.achieved_at,
    )


def summarize(sets: Sequence[WorkoutSet]) -> ExerciseSummary:
    sets = working_sets(sets)
    e1rms = [v for s in sets if (v := epley_1rm(Decimal(s.weight_kg), s.reps)) is not None]
    return ExerciseSummary(
        sets=len(sets),
        total_reps=sum(s.reps for s in sets),
        top_weight_kg=float(max((Decimal(s.weight_kg) for s in sets), default=Decimal(0))),
        volume_kg=float(sum((set_volume(Decimal(s.weight_kg), s.reps) for s in sets), Decimal(0))),
        best_est_1rm=float(max(e1rms)) if e1rms else None,
    )


def session_volume(session: WorkoutSession) -> float:
    return float(
        sum(
            (set_volume(Decimal(s.weight_kg), s.reps) for s in working_sets(session.sets)),
            Decimal(0),
        )
    )


def duration_seconds(session: WorkoutSession) -> int | None:
    if session.finished_at is None:
        return None
    return max(0, int((session.finished_at - session.started_at).total_seconds()))


def list_item(session: WorkoutSession, records_count: int = 0) -> SessionListItem:
    names: list[str] = []
    for s in session.sets:
        if s.exercise.name not in names:
            names.append(s.exercise.name)
    return SessionListItem(
        id=session.id,
        local_date=session.local_date,
        started_at=session.started_at,
        finished_at=session.finished_at,
        timezone=session.timezone,
        split_letter=session.split.letter if session.split else None,
        split_name=session.split.name if session.split else None,
        intensity=session.intensity,
        exercise_names=names,
        total_sets=len(working_sets(session.sets)),
        volume_kg=session_volume(session),
        duration_seconds=duration_seconds(session),
        records_count=records_count,
    )


def local_date_for(moment: datetime, tz: str) -> datetime:
    return moment.astimezone(ZoneInfo(tz))


class WorkoutService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.repo = WorkoutRepository(db)
        self.exercises = ExerciseRepository(db)
        self.records = RecordRepository(db)

    def _session(self, session_id: int) -> WorkoutSession:
        session = self.repo.get_session(self.user.id, session_id)
        if session is None:
            raise NotFoundError("Treino não encontrado.")
        return session

    def start(self, data: SessionStartIn) -> WorkoutSession:
        self.repo.lock_user(self.user.id)
        if self.repo.get_active(self.user.id) is not None:
            raise ActiveSessionExistsError()
        split_id = None
        if data.split_id is not None:
            split = SplitRepository(self.db).get(self.user.id, data.split_id)
            if split is None:
                raise NotFoundError("Divisão não encontrada.")
            split_id = split.id
        now = utcnow()
        tz = self.user.timezone or "UTC"
        local_date = local_date_for(now, tz).date()
        session = WorkoutSession(
            user_id=self.user.id,
            split_id=split_id,
            started_at=now,
            timezone=tz,
            local_date=local_date,
            notes=data.notes,
            intensity=data.intensity or self._week_intensity(local_date),
        )
        self.db.add(session)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise ActiveSessionExistsError() from None
        return self._session(session.id)

    def active(self) -> WorkoutSession | None:
        active = self.repo.get_active(self.user.id)
        return self._session(active.id) if active else None

    def _week_intensity(self, local_date: date) -> str:
        monday = local_date - timedelta(days=local_date.weekday())
        latest = self.repo.latest_session_since(self.user.id, monday)
        return latest.intensity if latest is not None else DEFAULT_INTENSITY

    def update(self, session_id: int, data: SessionUpdateIn) -> WorkoutSession:
        session = self._session(session_id)
        if "notes" in data.model_fields_set:
            session.notes = data.notes
        if "intensity" in data.model_fields_set and data.intensity is not None:
            session.intensity = data.intensity
        self.db.commit()
        return session

    def finish(self, session_id: int) -> WorkoutSession:
        session = self._session(session_id)
        if session.finished_at is None:
            session.finished_at = utcnow()
            self.db.commit()
        return session

    def delete(self, session_id: int) -> None:
        self.repo.lock_user(self.user.id)
        session = self._session(session_id)
        exercise_ids = {s.exercise_id for s in session.sets}
        self.db.delete(session)
        self.db.flush()
        for exercise_id in exercise_ids:
            rebuild_exercise_records(self.db, self.user.id, exercise_id)
        self.db.commit()

    def add_set(self, session_id: int, data: SetIn) -> tuple[WorkoutSet, list[PersonalRecord]]:
        for attempt in range(3):
            try:
                return self._add_set_once(session_id, data)
            except IntegrityError:
                self.db.rollback()
                if attempt == 2:
                    raise ConflictError(
                        "Não foi possível registrar a série agora. Tente novamente."
                    ) from None
        raise AssertionError("inalcançável")  # pragma: no cover

    def _add_set_once(
        self, session_id: int, data: SetIn
    ) -> tuple[WorkoutSet, list[PersonalRecord]]:
        self.repo.lock_user(self.user.id)
        session = self._session(session_id)
        if session.finished_at is not None:
            raise SessionFinishedError()
        if self.repo.count_sets_in_session(session.id) >= MAX_SETS_PER_SESSION:
            raise AppError(
                f"Limite de {MAX_SETS_PER_SESSION} séries por treino atingido.",
                code="limite_series",
            )
        exercise = self.exercises.get_visible(self.user.id, data.exercise_id)
        if exercise is None:
            raise NotFoundError("Exercício não encontrado.")
        new_set = WorkoutSet(
            session_id=session.id,
            user_id=self.user.id,
            exercise_id=exercise.id,
            set_number=self.repo.next_set_number(session.id, exercise.id),
            reps=data.reps,
            weight_kg=data.weight_kg,
            set_type=data.set_type,
            rpe=data.rpe,
            rest_seconds=data.rest_seconds,
            notes=data.notes,
            performed_at=utcnow(),
        )
        self.db.add(new_set)
        self.db.flush()
        apply_new_set(self.db, new_set)
        self.db.commit()
        new_records = [
            r
            for r in self.records.for_session(self.user.id, session.id)
            if r.exercise_id == exercise.id
            and r.set_id == new_set.id
            and r.achieved_at >= new_set.performed_at
        ]
        return new_set, new_records

    def update_set(self, session_id: int, set_id: int, data: SetUpdateIn) -> WorkoutSet:
        self.repo.lock_user(self.user.id)
        workout_set = self.repo.get_set(self.user.id, session_id, set_id)
        if workout_set is None:
            raise NotFoundError("Série não encontrada.")
        workout_set.reps = data.reps
        workout_set.weight_kg = data.weight_kg
        workout_set.rest_seconds = data.rest_seconds
        workout_set.notes = data.notes
        if data.set_type is not None:
            workout_set.set_type = data.set_type
        if "rpe" in data.model_fields_set:
            workout_set.rpe = data.rpe
        self.db.flush()
        rebuild_exercise_records(self.db, self.user.id, workout_set.exercise_id)
        self.db.commit()
        return workout_set

    def delete_set(self, session_id: int, set_id: int) -> None:
        self.repo.lock_user(self.user.id)
        workout_set = self.repo.get_set(self.user.id, session_id, set_id)
        if workout_set is None:
            raise NotFoundError("Série não encontrada.")
        exercise_id = workout_set.exercise_id
        self.db.delete(workout_set)
        self.db.flush()
        session = self._session(session_id)
        self.db.refresh(session)
        remaining = [s for s in session.sets if s.exercise_id == exercise_id]
        for number, s in enumerate(sorted(remaining, key=lambda x: (x.performed_at, x.id)), 1):
            s.set_number = number
        rebuild_exercise_records(self.db, self.user.id, exercise_id)
        self.db.commit()

    def detail(self, session_id: int) -> SessionOut:
        session = self._session(session_id)
        grouped: OrderedDict[int, list[WorkoutSet]] = OrderedDict()
        exercises: dict[int, Exercise] = {}
        for s in sorted(session.sets, key=lambda x: (x.performed_at, x.id)):
            grouped.setdefault(s.exercise_id, []).append(s)
            exercises[s.exercise_id] = s.exercise

        blocks: list[SessionExerciseOut] = []
        for exercise_id, sets in grouped.items():
            summary = summarize(sets)
            comparison = None
            prev = self.repo.previous_session_with_exercise(self.user.id, exercise_id, session)
            if prev is not None:
                prev_summary = summarize([s for s in prev.sets if s.exercise_id == exercise_id])
                comparison = ExerciseComparison(
                    previous_session_id=prev.id,
                    previous_date=prev.local_date,
                    previous=prev_summary,
                    delta_top_weight_kg=round(
                        summary.top_weight_kg - prev_summary.top_weight_kg, 2
                    ),
                    delta_total_reps=summary.total_reps - prev_summary.total_reps,
                    delta_volume_kg=round(summary.volume_kg - prev_summary.volume_kg, 2),
                )
            blocks.append(
                SessionExerciseOut(
                    exercise=exercise_out(exercises[exercise_id]),
                    sets=[set_out(s) for s in sets],
                    summary=summary,
                    comparison=comparison,
                )
            )

        counted = working_sets(session.sets)
        return SessionOut(
            id=session.id,
            split=split_out(session.split) if session.split else None,
            intensity=session.intensity,
            started_at=session.started_at,
            finished_at=session.finished_at,
            timezone=session.timezone,
            local_date=session.local_date,
            notes=session.notes,
            duration_seconds=duration_seconds(session),
            total_sets=len(counted),
            total_reps=sum(s.reps for s in counted),
            volume_kg=session_volume(session),
            exercises=blocks,
            records=[record_out(r) for r in self.records.for_session(self.user.id, session.id)],
        )
