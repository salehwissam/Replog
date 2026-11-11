from datetime import date

from pydantic import BaseModel

from app.schemas.workout import Intensity, SetType


class LastSetOut(BaseModel):
    reps: int
    weight_kg: float
    set_type: SetType


class SuggestionDetail(BaseModel):
    weight_kg: float
    reps: int
    reason: str


class SuggestionOut(BaseModel):
    exercise_id: int
    intensity: Intensity
    based_on_session_id: int | None
    based_on_intensity: Intensity | None
    last_date: date | None
    last_sets: list[LastSetOut]
    suggestion: SuggestionDetail | None
