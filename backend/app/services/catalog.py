from collections.abc import Sequence

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.db.base import utcnow
from app.models import Exercise, SplitExercise, WorkoutSplit
from app.repositories.workouts import ExerciseRepository, SplitRepository
from app.schemas.workout import (
    ExerciseIn,
    ExerciseOut,
    SplitExerciseOut,
    SplitIn,
    SplitOut,
)


def _name_conflict() -> ConflictError:
    return ConflictError(
        "Já existe um exercício com esse nome.",
        fields={"name": "Já existe um exercício com esse nome."},
    )


def exercise_out(e: Exercise) -> ExerciseOut:
    return ExerciseOut(
        id=e.id,
        name=e.name,
        muscle_group=e.muscle_group,
        equipment=e.equipment,
        is_bodyweight=e.is_bodyweight,
        is_custom=e.user_id is not None,
    )


def split_out(s: WorkoutSplit) -> SplitOut:
    return SplitOut(
        id=s.id,
        letter=s.letter,
        name=s.name,
        description=s.description,
        exercises=[
            SplitExerciseOut(
                exercise=exercise_out(se.exercise),
                target_sets=se.target_sets,
                target_reps=se.target_reps,
                rest_seconds=se.rest_seconds,
            )
            for se in s.exercises
        ],
    )


class ExerciseService:
    def __init__(self, db: Session, user_id: int) -> None:
        self.db = db
        self.user_id = user_id
        self.repo = ExerciseRepository(db)

    def list(self, query: str | None, group: str | None) -> Sequence[Exercise]:
        return self.repo.list_visible(self.user_id, query, group)

    def create(self, data: ExerciseIn) -> Exercise:
        if self.repo.name_taken(self.user_id, data.name):
            raise _name_conflict()
        archived = self.repo.get_own_archived_by_name(self.user_id, data.name)
        if archived is not None:
            archived.archived_at = None
            for key, value in data.model_dump().items():
                setattr(archived, key, value)
            self.db.commit()
            return archived
        exercise = Exercise(user_id=self.user_id, **data.model_dump())
        self._commit_or_conflict(exercise)
        return exercise

    def update(self, exercise_id: int, data: ExerciseIn) -> Exercise:
        exercise = self.repo.get_own(self.user_id, exercise_id)
        if exercise is None or exercise.archived_at is not None:
            raise NotFoundError("Exercício não encontrado.")
        archived_twin = self.repo.get_own_archived_by_name(self.user_id, data.name)
        if self.repo.name_taken(self.user_id, data.name, exclude_id=exercise.id) or (
            archived_twin is not None and archived_twin.id != exercise.id
        ):
            raise _name_conflict()
        for key, value in data.model_dump().items():
            setattr(exercise, key, value)
        self._commit_or_conflict(exercise)
        return exercise

    def _commit_or_conflict(self, exercise: Exercise) -> None:
        try:
            self.db.add(exercise)
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise _name_conflict() from None

    def archive(self, exercise_id: int) -> None:
        exercise = self.repo.get_own(self.user_id, exercise_id)
        if exercise is None or exercise.archived_at is not None:
            raise NotFoundError("Exercício não encontrado.")
        exercise.archived_at = utcnow()
        self.db.commit()


class SplitService:
    def __init__(self, db: Session, user_id: int) -> None:
        self.db = db
        self.user_id = user_id
        self.repo = SplitRepository(db)
        self.exercises = ExerciseRepository(db)

    def list(self) -> Sequence[WorkoutSplit]:
        return self.repo.list(self.user_id)

    def upsert(self, letter: str, data: SplitIn) -> WorkoutSplit:
        ids = [item.exercise_id for item in data.exercises]
        if len(ids) != len(set(ids)):
            raise ConflictError(
                "Um exercício aparece duas vezes na divisão.",
                fields={"exercises": "Remova exercícios repetidos."},
            )
        for exercise_id in ids:
            if self.exercises.get_visible(self.user_id, exercise_id) is None:
                raise NotFoundError("Exercício não encontrado.")

        split = self.repo.get_by_letter(self.user_id, letter)
        if split is None:
            split = WorkoutSplit(user_id=self.user_id, letter=letter, name=data.name)
            self.db.add(split)
        split.name = data.name
        split.description = data.description
        split.exercises.clear()
        self.db.flush()
        for position, item in enumerate(data.exercises):
            split.exercises.append(
                SplitExercise(
                    exercise_id=item.exercise_id,
                    position=position,
                    target_sets=item.target_sets,
                    target_reps=item.target_reps,
                    rest_seconds=item.rest_seconds,
                )
            )
        self.db.commit()
        self.db.expire_all()
        result = self.repo.get_by_letter(self.user_id, letter)
        if result is None:
            raise NotFoundError("Divisão não encontrada.")
        return result

    def delete(self, letter: str) -> None:
        split = self.repo.get_by_letter(self.user_id, letter)
        if split is None:
            raise NotFoundError("Divisão não encontrada.")
        self.db.delete(split)
        self.db.commit()
