from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app.core.limits import MAX_ID
from app.core.validators import clean_text
from app.models.workout import INTENSITIES, SET_TYPES
from app.schemas.auth import StrictModel
from app.seeds.exercises import EQUIPMENT, MUSCLE_GROUPS

MuscleGroup = Literal[
    "peito", "costas", "ombros", "biceps", "triceps", "antebraco", "quadriceps",
    "posterior", "gluteos", "panturrilha", "abdomen", "corpo_inteiro",
]  # fmt: skip
Equipment = Literal[
    "barra", "halter", "maquina", "polia", "peso_corporal", "smith", "kettlebell", "outro"
]
SplitLetter = Literal["A", "B", "C", "D", "E"]
RecordType = Literal["max_weight", "max_reps", "max_est_1rm"]

SetType = Literal["normal", "aquecimento", "drop", "falha"]
Intensity = Literal["normal", "pesado", "leve"]

if set(get_args(MuscleGroup)) != set(MUSCLE_GROUPS) or set(get_args(Equipment)) != set(EQUIPMENT):
    raise RuntimeError("Grupos musculares/equipamentos divergentes entre schema e catálogo")
if get_args(Intensity) != INTENSITIES:
    raise RuntimeError("Intensity e INTENSITIES estão diferentes.")
if get_args(SetType) != SET_TYPES:
    raise RuntimeError("Tipos de série divergentes entre schema e model")

RPE_STEP_MESSAGE = "Use valores de 0,5 em 0,5 (ex.: 7,5)."


def _rpe_half_step(v: Decimal) -> Decimal:
    if (v * 2) % 1 != 0:
        raise ValueError(RPE_STEP_MESSAGE)
    return v.quantize(Decimal("0.1"))


Rpe = Annotated[Decimal, Field(ge=1, le=10), AfterValidator(_rpe_half_step)]


def _optional_text(v: str | None, field: str) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return clean_text(v, field=field, multiline=True) if v else None


class ExerciseIn(StrictModel):
    name: str = Field(min_length=2, max_length=80)
    muscle_group: MuscleGroup
    equipment: Equipment = "outro"
    is_bodyweight: bool = False

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return clean_text(v, field="Nome", min_length=2)


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str
    equipment: str
    is_bodyweight: bool
    is_custom: bool


class ExerciseMetaOut(BaseModel):
    muscle_groups: dict[str, str]
    equipment: dict[str, str]


class SplitExerciseIn(StrictModel):
    exercise_id: int = Field(gt=0, le=MAX_ID)
    target_sets: int = Field(default=3, ge=1, le=20)
    target_reps: str | None = Field(default=None, max_length=20, pattern=r"^\d{1,3}(-\d{1,3})?$")
    rest_seconds: int = Field(default=90, ge=0, le=1800)


class SplitIn(StrictModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=280)
    exercises: list[SplitExerciseIn] = Field(default_factory=list, max_length=30)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return clean_text(v, field="Nome")

    @field_validator("description")
    @classmethod
    def _desc(cls, v: str | None) -> str | None:
        return _optional_text(v, "Descrição")


class SplitExerciseOut(BaseModel):
    exercise: ExerciseOut
    target_sets: int
    target_reps: str | None
    rest_seconds: int


class SplitOut(BaseModel):
    id: int
    letter: str
    name: str
    description: str | None
    exercises: list[SplitExerciseOut]


class SessionStartIn(StrictModel):
    split_id: int | None = Field(default=None, gt=0, le=MAX_ID)
    intensity: Intensity | None = None
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return _optional_text(v, "Observações")


class SessionUpdateIn(StrictModel):
    notes: str | None = Field(default=None, max_length=1000)
    intensity: Intensity | None = None

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return _optional_text(v, "Observações")


class SetIn(StrictModel):
    exercise_id: int = Field(gt=0, le=MAX_ID)
    reps: int = Field(ge=1, le=1000)
    weight_kg: Decimal = Field(ge=0, le=1500, max_digits=6, decimal_places=2)
    set_type: SetType = "normal"
    rpe: Rpe | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    notes: str | None = Field(default=None, max_length=280)

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return _optional_text(v, "Observações")


class SetUpdateIn(StrictModel):
    reps: int = Field(ge=1, le=1000)
    weight_kg: Decimal = Field(ge=0, le=1500, max_digits=6, decimal_places=2)
    set_type: SetType | None = None
    rpe: Rpe | None = None
    rest_seconds: int | None = Field(default=None, ge=0, le=3600)
    notes: str | None = Field(default=None, max_length=280)

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str | None) -> str | None:
        return _optional_text(v, "Observações")


class SetOut(BaseModel):
    id: int
    exercise_id: int
    set_number: int
    reps: int
    weight_kg: float
    volume_kg: float
    est_1rm: float | None
    set_type: SetType
    rpe: float | None
    rest_seconds: int | None
    notes: str | None
    performed_at: datetime


class RecordOut(BaseModel):
    id: int
    exercise_id: int
    exercise_name: str
    record_type: RecordType
    value: float
    previous_value: float | None
    set_id: int | None
    session_id: int
    achieved_at: datetime


class SetCreatedOut(BaseModel):
    set: SetOut
    new_records: list[RecordOut]


class ExerciseSummary(BaseModel):
    sets: int
    total_reps: int
    top_weight_kg: float
    volume_kg: float
    best_est_1rm: float | None


class ExerciseComparison(BaseModel):
    previous_session_id: int
    previous_date: date
    previous: ExerciseSummary
    delta_top_weight_kg: float
    delta_total_reps: int
    delta_volume_kg: float


class SessionExerciseOut(BaseModel):
    exercise: ExerciseOut
    sets: list[SetOut]
    summary: ExerciseSummary
    comparison: ExerciseComparison | None


class SessionOut(BaseModel):
    id: int
    split: SplitOut | None
    intensity: Intensity
    started_at: datetime
    finished_at: datetime | None
    timezone: str
    local_date: date
    notes: str | None
    duration_seconds: int | None
    total_sets: int
    total_reps: int
    volume_kg: float
    exercises: list[SessionExerciseOut]
    records: list[RecordOut]


class SessionListItem(BaseModel):
    id: int
    local_date: date
    started_at: datetime
    finished_at: datetime | None
    timezone: str
    split_letter: str | None
    split_name: str | None
    intensity: Intensity
    exercise_names: list[str]
    total_sets: int
    volume_kg: float
    duration_seconds: int | None
    records_count: int


class SessionPage(BaseModel):
    items: list[SessionListItem]
    total: int
    page: int
    page_size: int


class ExerciseRecordsOut(BaseModel):
    exercise: ExerciseOut
    max_weight: RecordOut | None
    max_reps: RecordOut | None
    max_est_1rm: RecordOut | None


class ProgressPoint(BaseModel):
    session_id: int
    local_date: date
    top_weight_kg: float
    best_est_1rm: float | None
    volume_kg: float
    total_reps: int


class VolumeBucket(BaseModel):
    start: date
    label: str
    volume_kg: float
    workouts: int
    sets: int


class DashboardOut(BaseModel):
    week_workouts: int
    week_volume_kg: float
    week_sets: int
    total_workouts: int
    streak_weeks: int
    last_session: SessionListItem | None
    active_session_id: int | None
    recent_records: list[RecordOut]
    weekly: list[VolumeBucket]
    week_sessions: list["WeekSession"]


class WeekSession(BaseModel):
    id: int
    local_date: date
    split_letter: str | None
    finished: bool


class CalendarOut(BaseModel):
    month: str
    days: list[date]
