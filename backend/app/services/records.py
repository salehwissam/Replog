from collections import OrderedDict
from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.models import PersonalRecord, WorkoutSet
from app.repositories.workouts import RecordRepository, WorkoutRepository
from app.services.set_rules import is_working_set, working_sets

RECORD_TYPES = ("max_weight", "max_reps", "max_est_1rm")
EPLEY_MAX_REPS = 12
TWO_PLACES = Decimal("0.01")


def epley_1rm(weight: Decimal, reps: int) -> Decimal | None:
    if weight <= 0 or reps < 1 or reps > EPLEY_MAX_REPS:
        return None
    if reps == 1:
        return weight.quantize(TWO_PLACES)
    value = weight * (Decimal(1) + Decimal(reps) / Decimal(30))
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def set_volume(weight: Decimal, reps: int) -> Decimal:
    return (weight * reps).quantize(TWO_PLACES)


def _set_metrics(s: WorkoutSet) -> dict[str, Decimal | None]:
    weight = Decimal(s.weight_kg)
    return {
        "max_weight": weight if weight > 0 else None,
        "max_reps": Decimal(s.reps),
        "max_est_1rm": epley_1rm(weight, s.reps),
    }


def apply_new_set(db: Session, new_set: WorkoutSet) -> None:
    if not is_working_set(new_set):
        return
    user_id, exercise_id, session_id = new_set.user_id, new_set.exercise_id, new_set.session_id
    best = RecordRepository(db).best_values(user_id, exercise_id)

    for rtype, value in _set_metrics(new_set).items():
        if value is None:
            continue
        current = best.get(rtype)
        if current is None or value > current:
            db.add(
                PersonalRecord(
                    user_id=user_id,
                    exercise_id=exercise_id,
                    record_type=rtype,
                    value=value,
                    previous_value=current,
                    set_id=new_set.id,
                    session_id=session_id,
                    achieved_at=new_set.performed_at,
                )
            )

    db.flush()


def rebuild_exercise_records(db: Session, user_id: int, exercise_id: int) -> None:
    records = RecordRepository(db)
    records.delete_for_exercise(user_id, exercise_id)
    sets = working_sets(WorkoutRepository(db).sets_for_exercise(user_id, exercise_id))
    for rec in _replay(user_id, exercise_id, sets):
        db.add(rec)
    db.flush()


def _replay(user_id: int, exercise_id: int, sets: Iterable[WorkoutSet]) -> list[PersonalRecord]:
    best: dict[str, Decimal | None] = dict.fromkeys(RECORD_TYPES)
    out: list[PersonalRecord] = []

    by_session: OrderedDict[int, list[WorkoutSet]] = OrderedDict()
    for s in sets:
        by_session.setdefault(s.session_id, []).append(s)

    for session_id, session_sets in by_session.items():
        for s in session_sets:
            for rtype, value in _set_metrics(s).items():
                if value is None:
                    continue
                current = best[rtype]
                if current is None or value > current:
                    out.append(
                        PersonalRecord(
                            user_id=user_id,
                            exercise_id=exercise_id,
                            record_type=rtype,
                            value=value,
                            previous_value=current,
                            set_id=s.id,
                            session_id=session_id,
                            achieved_at=s.performed_at,
                        )
                    )
                    best[rtype] = value

    return out
