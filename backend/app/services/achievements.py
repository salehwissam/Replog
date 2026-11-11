from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.db.base import UTCDateTime
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet, WorkoutSplit
from app.models.workout import WARMUP_SET_TYPE
from app.schemas.achievements import AchievementOut, Tier

WORKOUT_TARGETS = (1, 10, 50, 100)
STREAK_TARGETS = (4, 12)
RECORD_TARGETS = (1, 10, 50)
SETS_TARGETS = (100, 500, 2_000)
REPS_TARGET = 1_000
EARLY_BIRD_HOURS = range(4, 7)
NIGHT_OWL_START_HOUR = 22
LONG_WORKOUT_MINUTES = 90
VARIETY_EXERCISES = 5
EXPLORER_EXERCISES = 15
HEAVY_LIFT_KG = 100
HEAVY_LIFTS = ("Supino reto com barra", "Agachamento livre", "Levantamento terra")
MIN_SPLITS_FOR_FULL_WEEK = 2


@dataclass
class _Workout:
    id: int
    started_at: datetime
    timezone: str
    local_date: date
    split_id: int | None
    first_at: datetime
    last_at: datetime
    exercise_firsts: list[datetime] = field(default_factory=list)


@dataclass
class _Progress:
    current: float
    target: float
    unlocked_at: datetime | None


@dataclass(frozen=True)
class _Definition:
    key: str
    title: str
    description: str
    icon: str
    tier: Tier
    compute: Callable[["_Data"], _Progress]


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _local_hour(moment: datetime, tz: str) -> int:
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        zone = ZoneInfo("UTC")
    return moment.astimezone(zone).hour


def _nth(moments: Sequence[datetime], n: int) -> datetime | None:
    return moments[n - 1] if len(moments) >= n else None


class _Data:
    def __init__(self, db: Session, user_id: int) -> None:
        self.workouts, first_seen = self._load_workouts(db, user_id)
        explorer = sorted(first_seen.values())
        self.distinct_exercises = len(explorer)
        self.explorer_moment = _nth(explorer, EXPLORER_EXERCISES)
        self.total_sets, self.total_reps, self.sets_moments, self.reps_moment = (
            self._load_running_totals(db, user_id)
        )
        self.records_beaten, self.record_moments = self._load_records(db, user_id)
        self.heavy_max, self.heavy_moment = self._load_heavy_lifts(db, user_id)
        self.split_ids = set(
            db.scalars(select(WorkoutSplit.id).where(WorkoutSplit.user_id == user_id))
        )

    @staticmethod
    def _load_workouts(db: Session, user_id: int) -> tuple[list[_Workout], dict[int, datetime]]:
        first = func.min(WorkoutSet.performed_at)
        last = func.max(WorkoutSet.performed_at)
        rows = db.execute(
            select(
                WorkoutSession.id,
                WorkoutSession.started_at,
                WorkoutSession.timezone,
                WorkoutSession.local_date,
                WorkoutSession.split_id,
                WorkoutSet.exercise_id,
                first,
                last,
            )
            .join(WorkoutSet, WorkoutSet.session_id == WorkoutSession.id)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSet.user_id == user_id,
                WorkoutSet.set_type != WARMUP_SET_TYPE,
            )
            .group_by(
                WorkoutSession.id,
                WorkoutSession.started_at,
                WorkoutSession.timezone,
                WorkoutSession.local_date,
                WorkoutSession.split_id,
                WorkoutSet.exercise_id,
            )
        ).all()
        by_id: dict[int, _Workout] = {}
        first_seen: dict[int, datetime] = {}
        for sid, started, tz, local_date, split_id, exercise_id, ex_first, ex_last in rows:
            seen = first_seen.get(exercise_id)
            first_seen[exercise_id] = ex_first if seen is None else min(seen, ex_first)
            w = by_id.get(sid)
            if w is None:
                w = by_id[sid] = _Workout(sid, started, tz, local_date, split_id, ex_first, ex_last)
            w.first_at = min(w.first_at, ex_first)
            w.last_at = max(w.last_at, ex_last)
            w.exercise_firsts.append(ex_first)
        for w in by_id.values():
            w.exercise_firsts.sort()
        return sorted(by_id.values(), key=lambda w: (w.first_at, w.id)), first_seen

    @staticmethod
    def _load_running_totals(
        db: Session, user_id: int
    ) -> tuple[int, int, dict[int, datetime | None], datetime | None]:
        order = (WorkoutSet.performed_at, WorkoutSet.id)
        sub = (
            select(
                WorkoutSet.performed_at.label("at"),
                func.count(WorkoutSet.id).over(order_by=order).label("sets"),
                func.sum(WorkoutSet.reps).over(order_by=order).label("reps"),
            )
            .where(WorkoutSet.user_id == user_id, WorkoutSet.set_type != WARMUP_SET_TYPE)
            .subquery()
        )
        crossed = [
            func.min(case((sub.c.sets >= target, sub.c.at)), type_=UTCDateTime())
            for target in SETS_TARGETS
        ]
        reps_crossed = func.min(case((sub.c.reps >= REPS_TARGET, sub.c.at)), type_=UTCDateTime())
        row = db.execute(
            select(func.max(sub.c.sets), func.max(sub.c.reps), reps_crossed, *crossed)
        ).one()
        total_sets = int(row[0] or 0)
        total_reps = int(row[1] or 0)
        moments = {t: row[3 + i] for i, t in enumerate(SETS_TARGETS)}
        return total_sets, total_reps, moments, row[2]

    @staticmethod
    def _load_records(db: Session, user_id: int) -> tuple[int, dict[int, datetime | None]]:
        rn = func.row_number().over(order_by=(PersonalRecord.achieved_at, PersonalRecord.id))
        sub = (
            select(PersonalRecord.achieved_at.label("at"), rn.label("rn"))
            .where(PersonalRecord.user_id == user_id, PersonalRecord.previous_value.is_not(None))
            .subquery()
        )
        nth = [
            func.min(case((sub.c.rn == target, sub.c.at)), type_=UTCDateTime())
            for target in RECORD_TARGETS
        ]
        row = db.execute(select(func.count(), *nth).select_from(sub)).one()
        return int(row[0]), {t: row[1 + i] for i, t in enumerate(RECORD_TARGETS)}

    @staticmethod
    def _load_heavy_lifts(db: Session, user_id: int) -> tuple[float, datetime | None]:
        row = db.execute(
            select(
                func.max(WorkoutSet.weight_kg),
                func.min(
                    case((WorkoutSet.weight_kg >= HEAVY_LIFT_KG, WorkoutSet.performed_at)),
                    type_=UTCDateTime(),
                ),
            )
            .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
            .where(
                WorkoutSet.user_id == user_id,
                WorkoutSet.set_type != WARMUP_SET_TYPE,
                Exercise.user_id.is_(None),
                Exercise.name.in_(HEAVY_LIFTS),
            )
        ).one()
        return float(Decimal(row[0] or 0)), row[1]


def _workouts(target: int) -> Callable[[_Data], _Progress]:
    def compute(d: _Data) -> _Progress:
        moments = [w.first_at for w in d.workouts]
        return _Progress(len(moments), target, _nth(moments, target))

    return compute


def _streak(target: int) -> Callable[[_Data], _Progress]:
    def compute(d: _Data) -> _Progress:
        week_first: dict[date, datetime] = {}
        for w in d.workouts:
            week_first.setdefault(_week_start(w.local_date), w.first_at)
        best = run = 0
        unlocked: datetime | None = None
        previous: date | None = None
        for week in sorted(week_first):
            run = run + 1 if previous is not None and week - previous == timedelta(weeks=1) else 1
            previous = week
            best = max(best, run)
            if run == target and unlocked is None:
                unlocked = week_first[week]
        return _Progress(best, target, unlocked)

    return compute


def _records(target: int) -> Callable[[_Data], _Progress]:
    def compute(d: _Data) -> _Progress:
        return _Progress(d.records_beaten, target, d.record_moments[target])

    return compute


def _sets(target: int) -> Callable[[_Data], _Progress]:
    def compute(d: _Data) -> _Progress:
        return _Progress(d.total_sets, target, d.sets_moments[target])

    return compute


def _reps(d: _Data) -> _Progress:
    return _Progress(d.total_reps, REPS_TARGET, d.reps_moment)


def _by_start_hour(predicate: Callable[[int], bool]) -> Callable[[_Data], _Progress]:
    def compute(d: _Data) -> _Progress:
        hits = [w.first_at for w in d.workouts if predicate(_local_hour(w.started_at, w.timezone))]
        return _Progress(len(hits), 1, _nth(hits, 1))

    return compute


def _long_workout(d: _Data) -> _Progress:
    limit = timedelta(minutes=LONG_WORKOUT_MINUTES)
    best = timedelta(0)
    unlocked: datetime | None = None
    for w in d.workouts:
        active = w.last_at - w.started_at
        best = max(best, active)
        if active >= limit:
            moment = w.started_at + limit
            unlocked = moment if unlocked is None else min(unlocked, moment)
    return _Progress(int(best.total_seconds() // 60), LONG_WORKOUT_MINUTES, unlocked)


def _variety(d: _Data) -> _Progress:
    best = 0
    unlocked: datetime | None = None
    for w in d.workouts:
        best = max(best, len(w.exercise_firsts))
        moment = _nth(w.exercise_firsts, VARIETY_EXERCISES)
        if moment is not None and (unlocked is None or moment < unlocked):
            unlocked = moment
    return _Progress(best, VARIETY_EXERCISES, unlocked)


def _explorer(d: _Data) -> _Progress:
    return _Progress(d.distinct_exercises, EXPLORER_EXERCISES, d.explorer_moment)


def _full_week(d: _Data) -> _Progress:
    target = max(len(d.split_ids), MIN_SPLITS_FOR_FULL_WEEK)
    covered: dict[date, set[int]] = {}
    best = 0
    unlocked: datetime | None = None
    for w in d.workouts:
        if w.split_id is None or w.split_id not in d.split_ids:
            continue
        seen = covered.setdefault(_week_start(w.local_date), set())
        seen.add(w.split_id)
        best = max(best, len(seen))
        if len(seen) >= target and unlocked is None:
            unlocked = w.first_at
    return _Progress(best, target, unlocked)


def _heavy(d: _Data) -> _Progress:
    return _Progress(d.heavy_max, HEAVY_LIFT_KG, d.heavy_moment)


DEFINITIONS: tuple[_Definition, ...] = (
    _Definition(
        "primeiro-treino",
        "Primeiro treino",
        "Registre seu primeiro treino. Todo progresso começa com a primeira série!",
        "dumbbell",
        "bronze",
        _workouts(1),
    ),
    _Definition(
        "treinos-10",
        "Pegando o ritmo",
        "Complete 10 treinos. O hábito já está nascendo.",
        "calendar-check",
        "bronze",
        _workouts(10),
    ),
    _Definition(
        "treinos-50",
        "Rotina de ferro",
        "Complete 50 treinos. Disciplina virou rotina.",
        "medal",
        "prata",
        _workouts(50),
    ),
    _Definition(
        "treinos-100",
        "Centenário",
        "Complete 100 treinos. Poucos chegam até aqui!",
        "crown",
        "ouro",
        _workouts(100),
    ),
    _Definition(
        "sequencia-4-semanas",
        "Um mês sem falhar",
        "Treine pelo menos uma vez por semana durante 4 semanas seguidas.",
        "flame",
        "bronze",
        _streak(4),
    ),
    _Definition(
        "sequencia-12-semanas",
        "Trimestre imbatível",
        "Treine pelo menos uma vez por semana durante 12 semanas seguidas.",
        "zap",
        "ouro",
        _streak(12),
    ),
    _Definition(
        "semana-completa",
        "Semana completa",
        "Treine todas as suas divisões (A, B, C…) na mesma semana. Vale a partir de 2 divisões.",
        "calendar-range",
        "prata",
        _full_week,
    ),
    _Definition(
        "primeiro-recorde",
        "Superação",
        "Supere um recorde pessoal pela primeira vez. Você é mais forte do que ontem!",
        "trophy",
        "bronze",
        _records(1),
    ),
    _Definition(
        "recordes-10",
        "Caçador de recordes",
        "Supere 10 recordes pessoais.",
        "award",
        "prata",
        _records(10),
    ),
    _Definition(
        "recordes-50",
        "Lenda dos recordes",
        "Supere 50 recordes pessoais. Evolução de verdade!",
        "star",
        "ouro",
        _records(50),
    ),
    _Definition(
        "clube-100kg",
        "Clube dos 100 kg",
        "Levante 100 kg ou mais em uma série de supino reto com barra, "
        "agachamento livre ou levantamento terra.",
        "biceps-flexed",
        "prata",
        _heavy,
    ),
    _Definition(
        "series-100",
        "Cem séries",
        "Complete 100 séries de trabalho (aquecimento não conta).",
        "weight",
        "bronze",
        _sets(SETS_TARGETS[0]),
    ),
    _Definition(
        "series-500",
        "Quinhentas séries",
        "Complete 500 séries de trabalho. Constância de verdade!",
        "mountain",
        "prata",
        _sets(SETS_TARGETS[1]),
    ),
    _Definition(
        "series-2000",
        "Duas mil séries",
        "Complete 2.000 séries de trabalho. Força de outro planeta!",
        "rocket",
        "ouro",
        _sets(SETS_TARGETS[2]),
    ),
    _Definition(
        "repeticoes-1000",
        "Mil repetições",
        "Some 1.000 repetições em séries de trabalho.",
        "repeat",
        "bronze",
        _reps,
    ),
    _Definition(
        "madrugador",
        "Madrugador",
        "Comece um treino entre 4h e 7h da manhã. O dia é de quem acorda cedo!",
        "sunrise",
        "bronze",
        _by_start_hour(lambda h: h in EARLY_BIRD_HOURS),
    ),
    _Definition(
        "coruja",
        "Coruja",
        "Comece um treino depois das 22h. Nada para você!",
        "moon",
        "bronze",
        _by_start_hour(lambda h: h >= NIGHT_OWL_START_HOUR or h < EARLY_BIRD_HOURS.start),
    ),
    _Definition(
        "treino-longo",
        "Maratonista",
        "Treine por 90 minutos ou mais em um único treino (do início até a última série).",
        "timer",
        "prata",
        _long_workout,
    ),
    _Definition(
        "treino-variado",
        "Treino variado",
        "Faça 5 exercícios diferentes em um mesmo treino.",
        "target",
        "bronze",
        _variety,
    ),
    _Definition(
        "explorador",
        "Explorador",
        "Experimente 15 exercícios diferentes ao longo dos seus treinos.",
        "compass",
        "prata",
        _explorer,
    ),
)


def list_achievements(db: Session, user: User) -> list[AchievementOut]:
    data = _Data(db, user.id)
    out: list[AchievementOut] = []
    for definition in DEFINITIONS:
        p = definition.compute(data)
        unlocked = p.current >= p.target
        out.append(
            AchievementOut(
                key=definition.key,
                title=definition.title,
                description=definition.description,
                icon=definition.icon,
                tier=definition.tier,
                unlocked=unlocked,
                unlocked_at=p.unlocked_at if unlocked else None,
                progress=round(min(p.current / p.target, 1.0), 4),
                current=p.current,
                target=p.target,
            )
        )
    return out
