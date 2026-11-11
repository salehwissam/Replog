from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models import Exercise, User, WorkoutSession, WorkoutSet
from app.models.workout import DEFAULT_INTENSITY, LIGHT_INTENSITY, WARMUP_SET_TYPE
from app.repositories.workouts import ExerciseRepository, SplitRepository, WorkoutRepository
from app.schemas.insights import LastSetOut, SuggestionDetail, SuggestionOut
from app.services.records import epley_1rm
from app.services.set_rules import working_sets

DEFAULT_INCREMENT = Decimal("2.5")
INCREMENTS = {"halter": Decimal("2"), "kettlebell": Decimal("4")}
REDUCTION_FACTOR = Decimal("0.9")
WELL_BELOW_MARGIN = 2
MAX_WEIGHT = Decimal("1500")
MAX_REPS = 1000
INVALID_RANGE = "Use uma faixa como 8-12 (início menor ou igual ao fim, a partir de 1)."


class InvalidTargetRepsError(AppError):
    status_code = 422
    code = "dados_invalidos"
    message = "Verifique os dados informados."


@dataclass(frozen=True)
class RepRange:
    low: int
    high: int


DEFAULT_RANGE = RepRange(8, 12)
HEAVY_RANGE = RepRange(3, 6)
HEAVY_INTENSITY = "pesado"
LIGHT_FACTOR = Decimal("0.6")


@dataclass(frozen=True)
class Progression:
    weight_kg: Decimal
    reps: int
    reason: str


class _SetLike(Protocol):
    @property
    def reps(self) -> int: ...
    @property
    def weight_kg(self) -> Decimal: ...
    @property
    def set_type(self) -> str: ...


def parse_rep_range(value: str | None) -> RepRange | None:
    if not value:
        return None
    parts = value.strip().split("-")
    if len(parts) > 2 or not all(p.isdigit() for p in parts):
        return None
    low, high = int(parts[0]), int(parts[-1])
    if low < 1 or low > high or high > MAX_REPS:
        return None
    return RepRange(low, high)


def format_kg(value: Decimal) -> str:
    text = f"{value.quantize(Decimal('0.01')):.2f}".rstrip("0").rstrip(".")
    return f"{text.replace('.', ',')} kg"


def increment_for(equipment: str) -> Decimal:
    return INCREMENTS.get(equipment, DEFAULT_INCREMENT)


def _to_step(value: Decimal, step: Decimal, rounding: str) -> Decimal:
    return (value / step).quantize(Decimal(1), rounding=rounding) * step


def increased_weight(current: Decimal, step: Decimal) -> Decimal:
    new = _to_step(current + step, step, ROUND_FLOOR)
    if new <= current:
        new += step
    return min(new, MAX_WEIGHT)


def reduced_weight(current: Decimal, step: Decimal) -> Decimal | None:
    new = _to_step(current * REDUCTION_FACTOR, step, ROUND_HALF_UP)
    if new >= current:
        new = current - step
    return new if new > 0 else None


def _reps_text(n: int) -> str:
    return f"{n} repetição" if n == 1 else f"{n} repetições"


def progress(
    sets: Sequence[_SetLike], rep_range: RepRange, equipment: str, is_bodyweight: bool
) -> Progression | None:
    work = working_sets(sets)
    if not work:
        return None
    top = max(Decimal(s.weight_kg) for s in work)
    top_reps = [s.reps for s in work if Decimal(s.weight_kg) == top]
    worst, best = min(top_reps), max(top_reps)
    low, high = rep_range.low, rep_range.high

    if top == 0:
        target = min(worst + 1, MAX_REPS)
        with_what = "com o peso do corpo" if is_bodyweight else "sem carga"
        return Progression(
            Decimal(0),
            target,
            f"Você fez pelo menos {_reps_text(worst)} em todas as séries {with_what}: "
            f"busque {target}.",
        )

    load = format_kg(top)

    if worst >= high:
        new = increased_weight(top, increment_for(equipment))
        return Progression(
            new,
            low,
            f"Você fez {high} repetições ou mais em todas as séries com {load}: "
            f"suba para {format_kg(new)} e recomece com {low}.",
        )

    if worst >= low:
        target = min(worst + 1, high)
        done = f"{worst}" if worst == best else f"de {worst} a {best}"
        return Progression(
            top,
            target,
            f"Você fez {done} repetições com {load}: mantenha a carga e busque "
            f"{target} em todas as séries.",
        )

    if best < low - WELL_BELOW_MARGIN:
        new_weight = reduced_weight(top, increment_for(equipment))
        if new_weight is not None:
            return Progression(
                new_weight,
                low,
                f"Com {load} você ficou bem abaixo de {_reps_text(low)}: "
                f"reduza para {format_kg(new_weight)} e busque {low}.",
            )

    return Progression(
        top,
        low,
        f"Com {load} você ficou abaixo de {_reps_text(low)}: mantenha a carga e "
        f"busque {low} em todas as séries.",
    )


def _top_set(sets: Sequence[_SetLike]) -> tuple[Decimal, int, int] | None:
    work = working_sets(sets)
    if not work:
        return None
    top = max(Decimal(s.weight_kg) for s in work)
    reps = [s.reps for s in work if Decimal(s.weight_kg) == top]
    return top, min(reps), max(reps)


def deload(
    sets: Sequence[_SetLike], rep_range: RepRange, equipment: str, is_bodyweight: bool
) -> Progression | None:
    top_set = _top_set(sets)
    if top_set is None:
        return None
    top, worst, _ = top_set
    if top == 0:
        target = max(1, int((Decimal(worst) * LIGHT_FACTOR).to_integral_value(ROUND_HALF_UP)))
        with_what = "com o peso do corpo" if is_bodyweight else "sem carga"
        return Progression(
            Decimal(0),
            target,
            f"Semana leve: cerca de 60% das repetições de sempre ({_reps_text(target)} "
            f"{with_what}). Capriche na técnica e saia descansado.",
        )
    step = increment_for(equipment)
    new = min(max(_to_step(top * LIGHT_FACTOR, step, ROUND_FLOOR), step), top)
    return Progression(
        new,
        rep_range.low,
        f"Semana leve: cerca de 60% da carga de {format_kg(top)}. "
        f"Faça {format_kg(new)} × {rep_range.low}, capriche na técnica e saia descansado.",
    )


def convert(
    sets: Sequence[_SetLike], rep_range: RepRange, equipment: str, label: str
) -> Progression | None:
    top_set = _top_set(sets)
    if top_set is None:
        return None
    top, _, best = top_set
    one_rm = epley_1rm(top, best)
    if top == 0 or one_rm is None:
        return None
    step = increment_for(equipment)
    target = rep_range.high
    estimate = one_rm / (Decimal(1) + Decimal(target) / Decimal(30))
    new = min(max(_to_step(estimate, step, ROUND_FLOOR), step), MAX_WEIGHT)
    return Progression(
        new,
        target,
        f"Primeiro treino {label}: com {format_kg(top)} × {best} seu máximo estimado é "
        f"{format_kg(one_rm)}. Comece com {format_kg(new)} × {target}.",
    )


class SuggestionService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.workouts = WorkoutRepository(db)

    def _exercise(self, exercise_id: int) -> Exercise:
        exercise = ExerciseRepository(self.db).get_visible(self.user.id, exercise_id)
        if exercise is None:
            raise NotFoundError("Exercício não encontrado.")
        return exercise

    def _last_finished_session(
        self, exercise_id: int, intensity: str | None = None, exclude: str | None = None
    ) -> WorkoutSession | None:
        with_working_sets = select(WorkoutSet.session_id).where(
            WorkoutSet.user_id == self.user.id,
            WorkoutSet.exercise_id == exercise_id,
            WorkoutSet.set_type != WARMUP_SET_TYPE,
        )
        stmt = select(WorkoutSession).where(
            WorkoutSession.user_id == self.user.id,
            WorkoutSession.finished_at.is_not(None),
            WorkoutSession.id.in_(with_working_sets),
        )
        if intensity is not None:
            stmt = stmt.where(WorkoutSession.intensity == intensity)
        if exclude is not None:
            stmt = stmt.where(WorkoutSession.intensity != exclude)
        return self.db.scalar(
            stmt.order_by(WorkoutSession.started_at.desc(), WorkoutSession.id.desc()).limit(1)
        )

    def _base_session(self, exercise_id: int, intensity: str) -> WorkoutSession | None:
        if intensity != LIGHT_INTENSITY:
            same = self._last_finished_session(exercise_id, intensity=intensity)
            if same is not None:
                return same
        return self._last_finished_session(
            exercise_id, exclude=LIGHT_INTENSITY
        ) or self._last_finished_session(exercise_id)

    def _today_intensity(self, requested: str | None) -> str:
        if requested is not None:
            return requested
        active = self.workouts.get_active(self.user.id)
        return active.intensity if active is not None else DEFAULT_INTENSITY

    def _split_range(self, session: WorkoutSession, exercise_id: int) -> RepRange | None:
        if session.split_id is None:
            return None
        split = SplitRepository(self.db).get(self.user.id, session.split_id)
        if split is None:
            return None
        for item in split.exercises:
            if item.exercise_id == exercise_id:
                return parse_rep_range(item.target_reps)
        return None

    def suggest(
        self, exercise_id: int, target_reps: str | None, intensity: str | None = None
    ) -> SuggestionOut:
        requested: RepRange | None = None
        if target_reps is not None:
            requested = parse_rep_range(target_reps)
            if requested is None:
                raise InvalidTargetRepsError(fields={"target_reps": INVALID_RANGE})

        exercise = self._exercise(exercise_id)
        today = self._today_intensity(intensity)
        session = self._base_session(exercise.id, today)
        if session is None:
            return SuggestionOut(
                exercise_id=exercise.id,
                intensity=today,
                based_on_session_id=None,
                based_on_intensity=None,
                last_date=None,
                last_sets=[],
                suggestion=None,
            )

        sets = self.workouts.sets_in_session(self.user.id, session.id, exercise.id)
        if today == HEAVY_INTENSITY:
            rep_range = HEAVY_RANGE
        else:
            rep_range = requested or self._split_range(session, exercise.id) or DEFAULT_RANGE
        base = session.intensity
        if today == LIGHT_INTENSITY and base != LIGHT_INTENSITY:
            result = deload(sets, rep_range, exercise.equipment, exercise.is_bodyweight)
        elif today != base and base != LIGHT_INTENSITY:
            label = "pesado" if today == HEAVY_INTENSITY else "normal"
            result = convert(sets, rep_range, exercise.equipment, label) or progress(
                sets, rep_range, exercise.equipment, exercise.is_bodyweight
            )
        else:
            result = progress(sets, rep_range, exercise.equipment, exercise.is_bodyweight)
        return SuggestionOut(
            exercise_id=exercise.id,
            intensity=today,
            based_on_session_id=session.id,
            based_on_intensity=base,
            last_date=session.local_date,
            last_sets=[
                LastSetOut(reps=s.reps, weight_kg=float(s.weight_kg), set_type=s.set_type)
                for s in sets
            ],
            suggestion=(
                SuggestionDetail(
                    weight_kg=float(result.weight_kg), reps=result.reps, reason=result.reason
                )
                if result is not None
                else None
            ),
        )
