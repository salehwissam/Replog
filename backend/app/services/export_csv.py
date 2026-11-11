import csv
import io
from collections.abc import Iterator, Sequence
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise, User, WorkoutSession, WorkoutSet, WorkoutSplit

CSV_FILENAME = "replog-series.csv"
CSV_HEADER = (
    "data",
    "hora",
    "treino",
    "exercicio",
    "serie",
    "tipo",
    "repeticoes",
    "carga_kg",
    "rpe",
    "descanso_s",
    "observacoes",
)
BOM = "﻿"
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
FREE_WORKOUT = "Treino livre"
_BATCH = 500


def neutralize(value: str) -> str:
    return "'" + value if value.startswith(FORMULA_PREFIXES) else value


def decimal_br(value: Decimal | None) -> str:
    if value is None:
        return ""
    text = format(Decimal(value).normalize(), "f")
    return text.replace(".", ",")


def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _workout_label(letter: str | None, name: str | None) -> str:
    if letter is None:
        return FREE_WORKOUT
    return f"Treino {letter} – {name}" if name else f"Treino {letter}"


def _fetch_rows(db: Session, user_id: int) -> Sequence[Any]:
    return db.execute(
        select(
            WorkoutSession.local_date,
            WorkoutSession.timezone,
            WorkoutSplit.letter,
            WorkoutSplit.name,
            Exercise.name,
            WorkoutSet.set_number,
            WorkoutSet.set_type,
            WorkoutSet.reps,
            WorkoutSet.weight_kg,
            WorkoutSet.rpe,
            WorkoutSet.rest_seconds,
            WorkoutSet.notes,
            WorkoutSet.performed_at,
        )
        .join(WorkoutSession, WorkoutSession.id == WorkoutSet.session_id)
        .join(Exercise, Exercise.id == WorkoutSet.exercise_id)
        .outerjoin(WorkoutSplit, WorkoutSplit.id == WorkoutSession.split_id)
        .where(WorkoutSet.user_id == user_id, WorkoutSession.user_id == user_id)
        .order_by(WorkoutSet.performed_at, WorkoutSet.id)
    ).all()


def _format_row(row: Any) -> list[str]:
    (
        local_date,
        tz,
        letter,
        split_name,
        exercise,
        set_number,
        set_type,
        reps,
        weight,
        rpe,
        rest,
        notes,
        performed_at,
    ) = row
    d: date = local_date
    moment: datetime = performed_at.astimezone(_zone(tz))
    cells = [
        d.strftime("%d/%m/%Y"),
        moment.strftime("%H:%M"),
        _workout_label(letter, split_name),
        exercise,
        str(set_number),
        set_type,
        str(reps),
        decimal_br(weight),
        decimal_br(rpe),
        "" if rest is None else str(rest),
        notes or "",
    ]
    return [neutralize(c) for c in cells]


def _chunks(rows: Sequence[Any]) -> Iterator[bytes]:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    buffer.write(BOM)
    writer.writerow(CSV_HEADER)
    for i, row in enumerate(rows, start=1):
        writer.writerow(_format_row(row))
        if i % _BATCH == 0:
            yield buffer.getvalue().encode("utf-8")
            buffer.seek(0)
            buffer.truncate()
    yield buffer.getvalue().encode("utf-8")


def export_sets_csv(db: Session, user: User) -> Iterator[bytes]:
    return _chunks(_fetch_rows(db, user.id))
