from pydantic import BaseModel

from app.schemas.auth import StrictModel


class ProgramExerciseOut(BaseModel):
    exercise_id: int | None
    name: str
    muscle_group: str | None
    target_sets: int
    target_reps: str
    rest_seconds: int


class ProgramSplitOut(BaseModel):
    letter: str
    name: str
    exercises: list[ProgramExerciseOut]


class ProgramOut(BaseModel):
    key: str
    name: str
    level: str
    days_per_week: str
    goal: str
    description: str
    splits: list[ProgramSplitOut]


class ApplyProgramIn(StrictModel):
    replace_existing: bool = False
