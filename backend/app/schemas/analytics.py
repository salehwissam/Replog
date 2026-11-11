import datetime as dt

from pydantic import BaseModel


class FavoriteExerciseOut(BaseModel):
    id: int
    name: str
    sessions: int


class HeaviestSetOut(BaseModel):
    exercise_id: int
    name: str
    weight_kg: float
    reps: int
    date: dt.date


class AnalyticsSummaryOut(BaseModel):
    total_workouts: int
    total_sets: int
    total_reps: int
    total_volume_kg: float
    records_beaten: int
    current_streak_weeks: int
    best_streak_weeks: int
    first_workout_date: dt.date | None
    favorite_exercise: FavoriteExerciseOut | None
    heaviest_set: HeaviestSetOut | None


class MuscleVolumeOut(BaseModel):
    muscle_group: str
    label: str
    sets: int
    volume_kg: float


class HeatmapDayOut(BaseModel):
    date: dt.date
    volume_kg: float
    workouts: int
    sets: int


class MuscleSetsOut(BaseModel):
    muscle_group: str
    label: str
    sets: int


class PreviousSessionOut(BaseModel):
    session_id: int
    local_date: dt.date
    volume_kg: float
    sets: int


class SessionSummaryOut(BaseModel):
    session_id: int
    volume_kg: float
    sets: int
    reps: int
    duration_seconds: int | None
    records_beaten: int
    muscle_groups: list[MuscleSetsOut]
    previous_same_split: PreviousSessionOut | None
    delta_volume_kg: float | None
