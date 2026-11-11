from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, NotFoundError
from app.models import Exercise, WorkoutSplit
from app.schemas.program import ProgramExerciseOut, ProgramOut, ProgramSplitOut
from app.schemas.workout import SplitExerciseIn, SplitIn
from app.seeds.programs import PROGRAMS, PROGRAMS_BY_KEY, Program
from app.services.catalog import SplitService


class SplitsExistError(AppError):
    status_code = 409
    code = "divisoes_existentes"
    message = "Você já tem divisões montadas. Confirme para substituí-las por este programa."


def _catalog_ids(db: Session) -> dict[str, Exercise]:
    rows = db.scalars(
        select(Exercise).where(Exercise.user_id.is_(None), Exercise.archived_at.is_(None))
    )
    return {e.name: e for e in rows}


def program_out(program: Program, catalog: dict[str, Exercise]) -> ProgramOut:
    return ProgramOut(
        key=program.key,
        name=program.name,
        level=program.level,
        days_per_week=program.days_per_week,
        goal=program.goal,
        description=program.description,
        splits=[
            ProgramSplitOut(
                letter=s.letter,
                name=s.name,
                exercises=[
                    ProgramExerciseOut(
                        exercise_id=catalog[e.name].id if e.name in catalog else None,
                        name=e.name,
                        muscle_group=catalog[e.name].muscle_group if e.name in catalog else None,
                        target_sets=e.sets,
                        target_reps=e.reps,
                        rest_seconds=e.rest,
                    )
                    for e in s.exercises
                ],
            )
            for s in program.splits
        ],
    )


def list_programs(db: Session) -> list[ProgramOut]:
    catalog = _catalog_ids(db)
    return [program_out(p, catalog) for p in PROGRAMS]


def apply_program(
    db: Session, user_id: int, key: str, replace_existing: bool
) -> Sequence[WorkoutSplit]:
    program = PROGRAMS_BY_KEY.get(key)
    if program is None:
        raise NotFoundError("Programa não encontrado.")
    service = SplitService(db, user_id)
    existing = list(service.list())
    if existing and not replace_existing:
        raise SplitsExistError()

    catalog = _catalog_ids(db)
    program_letters = {s.letter for s in program.splits}
    for current in existing:
        if current.letter not in program_letters:
            service.delete(current.letter)

    for template in program.splits:
        service.upsert(
            template.letter,
            SplitIn(
                name=template.name,
                description=f"Programa {program.name}",
                exercises=[
                    SplitExerciseIn(
                        exercise_id=catalog[e.name].id,
                        target_sets=e.sets,
                        target_reps=e.reps,
                        rest_seconds=e.rest,
                    )
                    for e in template.exercises
                    if e.name in catalog
                ],
            ),
        )
    return service.list()
