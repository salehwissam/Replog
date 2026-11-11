from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from alembic import command
from app.models import Exercise, User, WorkoutSession, WorkoutSet, WorkoutSplit
from app.seeds.exercises import CATALOG, seed_exercises

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _user(db: Session, email: str = "ana@exemplo.com") -> User:
    u = User(name="Ana", email=email, password_hash="x", timezone="America/Sao_Paulo")
    db.add(u)
    db.commit()
    return u


def test_migrations_upgrade_and_downgrade(tmp_path: Path) -> None:
    url = f"sqlite:///{(tmp_path / 'mig.db').as_posix()}"
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {"users", "sessions", "workout_sets", "personal_records"} <= tables
    command.downgrade(cfg, "base")
    assert set(inspect(create_engine(url)).get_table_names()) <= {"alembic_version"}


def test_seed_is_idempotent(db: Session) -> None:
    assert seed_exercises(db) == len(CATALOG)
    assert seed_exercises(db) == 0
    names = list(db.scalars(select(Exercise.name)))
    assert len(names) == len(set(names))


def test_email_must_be_unique(db: Session) -> None:
    _user(db)
    db.add(User(name="Outra", email="ana@exemplo.com", password_hash="x"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_datetimes_are_stored_and_returned_in_utc(db: Session) -> None:
    u = _user(db)
    brt = timezone(timedelta(hours=-3))
    u.email_verified_at = datetime(2026, 1, 1, 21, 0, tzinfo=brt)
    db.commit()
    db.expire_all()
    loaded = db.get(User, u.id)
    assert loaded is not None
    assert loaded.email_verified_at == datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    assert loaded.email_verified_at.tzinfo is not None


def test_naive_datetime_is_rejected(db: Session) -> None:
    u = _user(db)
    u.email_verified_at = datetime(2026, 1, 1, 12, 0)
    with pytest.raises(StatementError):
        db.commit()


def test_set_constraints_reject_invalid_values(db: Session) -> None:
    seed_exercises(db)
    u = _user(db)
    ex = db.scalars(select(Exercise)).first()
    assert ex is not None
    s = WorkoutSession(user_id=u.id, timezone="UTC", local_date=date(2026, 1, 1))
    db.add(s)
    db.commit()
    db.add(
        WorkoutSet(
            session_id=s.id,
            user_id=u.id,
            exercise_id=ex.id,
            set_number=1,
            reps=0,
            weight_kg=Decimal("20"),
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
    db.add(
        WorkoutSet(
            session_id=s.id,
            user_id=u.id,
            exercise_id=ex.id,
            set_number=1,
            reps=10,
            weight_kg=Decimal("-5"),
        )
    )
    with pytest.raises(IntegrityError):
        db.commit()


def test_split_letter_must_be_a_to_e(db: Session) -> None:
    u = _user(db)
    db.add(WorkoutSplit(user_id=u.id, letter="F", name="Inválido"))
    with pytest.raises(IntegrityError):
        db.commit()


def test_deleting_user_cascades_to_their_data(db: Session) -> None:
    seed_exercises(db)
    u = _user(db)
    ex = db.scalars(select(Exercise)).first()
    assert ex is not None
    s = WorkoutSession(user_id=u.id, timezone="UTC", local_date=date(2026, 1, 1))
    db.add(s)
    db.flush()
    db.add(
        WorkoutSet(
            session_id=s.id,
            user_id=u.id,
            exercise_id=ex.id,
            set_number=1,
            reps=10,
            weight_kg=Decimal("20"),
        )
    )
    db.commit()
    db.delete(u)
    db.commit()
    assert db.scalars(select(WorkoutSet)).all() == []
    assert db.scalars(select(WorkoutSession)).all() == []
    assert db.scalars(select(Exercise)).first() is not None
