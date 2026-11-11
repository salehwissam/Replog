from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UTCDateTime, utcnow

SET_TYPES = ("normal", "aquecimento", "drop", "falha")
WARMUP_SET_TYPE = "aquecimento"
_SET_TYPES_SQL = ", ".join(f"'{t}'" for t in SET_TYPES)

INTENSITIES = ("normal", "pesado", "leve")
DEFAULT_INTENSITY = "normal"
LIGHT_INTENSITY = "leve"
_INTENSITIES_SQL = ", ".join(f"'{t}'" for t in INTENSITIES)


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_exercises_user_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None
    )
    name: Mapped[str] = mapped_column(String(80))
    muscle_group: Mapped[str] = mapped_column(String(32))
    equipment: Mapped[str] = mapped_column(String(32), default="outro")
    is_bodyweight: Mapped[bool] = mapped_column(Boolean, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class WorkoutSplit(Base):
    __tablename__ = "workout_splits"
    __table_args__ = (
        UniqueConstraint("user_id", "letter", name="uq_workout_splits_user_letter"),
        CheckConstraint("letter IN ('A','B','C','D','E')", name="letter_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    letter: Mapped[str] = mapped_column(String(1))
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(280), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    exercises: Mapped[list["SplitExercise"]] = relationship(
        back_populates="split",
        cascade="all, delete-orphan",
        order_by="SplitExercise.position",
        passive_deletes=True,
    )


class SplitExercise(Base):
    __tablename__ = "split_exercises"
    __table_args__ = (
        CheckConstraint("target_sets BETWEEN 1 AND 20", name="target_sets_range"),
        CheckConstraint("rest_seconds BETWEEN 0 AND 1800", name="rest_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    split_id: Mapped[int] = mapped_column(
        ForeignKey("workout_splits.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    target_reps: Mapped[str | None] = mapped_column(String(20), default=None)
    rest_seconds: Mapped[int] = mapped_column(Integer, default=90)

    split: Mapped[WorkoutSplit] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        Index("ix_workout_sessions_user_date", "user_id", "local_date"),
        Index(
            "uq_workout_sessions_one_active",
            "user_id",
            unique=True,
            sqlite_where=text("finished_at IS NULL"),
            postgresql_where=text("finished_at IS NULL"),
        ),
        CheckConstraint(f"intensity IN ({_INTENSITIES_SQL})", name="intensity_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    split_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_splits.id", ondelete="SET NULL"), default=None
    )
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    timezone: Mapped[str] = mapped_column(String(64))
    local_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    intensity: Mapped[str] = mapped_column(
        String(16), default=DEFAULT_INTENSITY, server_default=DEFAULT_INTENSITY
    )

    split: Mapped[WorkoutSplit | None] = relationship()
    sets: Mapped[list["WorkoutSet"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="WorkoutSet.performed_at",
        passive_deletes=True,
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("reps BETWEEN 1 AND 1000", name="reps_range"),
        CheckConstraint("weight_kg >= 0 AND weight_kg <= 1500", name="weight_range"),
        CheckConstraint(f"set_type IN ({_SET_TYPES_SQL})", name="set_type_valid"),
        CheckConstraint("rpe IS NULL OR (rpe >= 1 AND rpe <= 10)", name="rpe_range"),
        Index("ix_workout_sets_user_exercise", "user_id", "exercise_id"),
        UniqueConstraint("session_id", "exercise_id", "set_number", name="uq_workout_sets_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    set_number: Mapped[int] = mapped_column(Integer)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    set_type: Mapped[str] = mapped_column(String(16), default="normal", server_default="normal")
    rpe: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), default=None)
    rest_seconds: Mapped[int | None] = mapped_column(Integer, default=None)
    notes: Mapped[str | None] = mapped_column(String(280), default=None)
    performed_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
    exercise: Mapped[Exercise] = relationship()


class PersonalRecord(Base):
    __tablename__ = "personal_records"
    __table_args__ = (
        Index("ix_personal_records_user_exercise_type", "user_id", "exercise_id", "record_type"),
        Index("ix_personal_records_user_achieved", "user_id", "achieved_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"))
    record_type: Mapped[str] = mapped_column(String(32))
    value: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    previous_value: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), default=None)
    set_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_sets.id", ondelete="CASCADE"), default=None
    )
    session_id: Mapped[int] = mapped_column(ForeignKey("workout_sessions.id", ondelete="CASCADE"))
    achieved_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    exercise: Mapped[Exercise] = relationship()
