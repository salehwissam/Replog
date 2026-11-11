from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID, SEARCH_PATTERN
from app.db.session import get_db
from app.models import User
from app.routes.deps import get_current_user
from app.schemas.workout import (
    ExerciseIn,
    ExerciseMetaOut,
    ExerciseOut,
    MuscleGroup,
    ProgressPoint,
    RecordOut,
    SplitIn,
    SplitOut,
)
from app.seeds.exercises import EQUIPMENT, MUSCLE_GROUPS
from app.services.catalog import ExerciseService, SplitService, exercise_out, split_out
from app.services.stats import StatsService

exercises_router = APIRouter(prefix="/exercises", tags=["exercicios"])
splits_router = APIRouter(prefix="/splits", tags=["divisoes"])

Letter = Literal["A", "B", "C", "D", "E"]


@exercises_router.get("/meta", response_model=ExerciseMetaOut)
def exercise_meta(_: User = Depends(get_current_user)) -> ExerciseMetaOut:
    return ExerciseMetaOut(muscle_groups=MUSCLE_GROUPS, equipment=EQUIPMENT)


@exercises_router.get("", response_model=list[ExerciseOut])
def list_exercises(
    q: str | None = Query(default=None, max_length=80, pattern=SEARCH_PATTERN),
    group: MuscleGroup | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExerciseOut]:
    return [exercise_out(e) for e in ExerciseService(db, user.id).list(q, group)]


@exercises_router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(
    data: ExerciseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ExerciseOut:
    return exercise_out(ExerciseService(db, user.id).create(data))


@exercises_router.put("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    data: ExerciseIn,
    exercise_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExerciseOut:
    return exercise_out(ExerciseService(db, user.id).update(exercise_id, data))


@exercises_router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_exercise(
    exercise_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    ExerciseService(db, user.id).archive(exercise_id)


@exercises_router.get("/{exercise_id}/progress", response_model=list[ProgressPoint])
def exercise_progress(
    exercise_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ProgressPoint]:
    return StatsService(db, user).exercise_progress(exercise_id)


@exercises_router.get("/{exercise_id}/records", response_model=list[RecordOut])
def exercise_records(
    exercise_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecordOut]:
    return StatsService(db, user).exercise_record_history(exercise_id)


@splits_router.get("", response_model=list[SplitOut])
def list_splits(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SplitOut]:
    return [split_out(s) for s in SplitService(db, user.id).list()]


@splits_router.put("/{letter}", response_model=SplitOut)
def save_split(
    data: SplitIn,
    letter: Letter,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SplitOut:
    return split_out(SplitService(db, user.id).upsert(letter, data))


@splits_router.delete("/{letter}", status_code=status.HTTP_204_NO_CONTENT)
def delete_split(
    letter: Letter, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    SplitService(db, user.id).delete(letter)
