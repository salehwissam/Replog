from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.limits import MAX_ID
from app.db.session import get_db
from app.models import User
from app.repositories.workouts import RecordRepository, WorkoutRepository
from app.routes.deps import get_current_user
from app.schemas.workout import (
    CalendarOut,
    DashboardOut,
    ExerciseRecordsOut,
    RecordOut,
    SessionOut,
    SessionPage,
    SessionStartIn,
    SessionUpdateIn,
    SetCreatedOut,
    SetIn,
    SetOut,
    SetUpdateIn,
    VolumeBucket,
)
from app.services.stats import StatsService
from app.services.workouts import WorkoutService, list_item, record_out, set_out

workouts_router = APIRouter(prefix="/workouts", tags=["treinos"])
records_router = APIRouter(prefix="/records", tags=["recordes"])
stats_router = APIRouter(prefix="/stats", tags=["estatisticas"])

SessionId = Path(gt=0, le=MAX_ID)


@workouts_router.get("", response_model=SessionPage)
def list_workouts(
    date_from: date | None = None,
    date_to: date | None = None,
    exercise_id: int | None = Query(default=None, gt=0, le=MAX_ID),
    split_id: int | None = Query(default=None, gt=0, le=MAX_ID),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionPage:
    if date_from and date_to and date_from > date_to:
        raise AppError(
            "A data inicial deve ser anterior à final.",
            fields={"date_from": "A data inicial deve ser anterior à final."},
        )
    items, total = WorkoutRepository(db).list_sessions(
        user.id,
        date_from=date_from,
        date_to=date_to,
        exercise_id=exercise_id,
        split_id=split_id,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    counts = RecordRepository(db).count_by_session(user.id, [s.id for s in items])
    return SessionPage(
        items=[list_item(s, counts.get(s.id, 0)) for s in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@workouts_router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_workout(
    data: SessionStartIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SessionOut:
    service = WorkoutService(db, user)
    return service.detail(service.start(data).id)


@workouts_router.get("/active", response_model=SessionOut | None)
def active_workout(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SessionOut | None:
    service = WorkoutService(db, user)
    active = service.active()
    return service.detail(active.id) if active else None


@workouts_router.get("/calendar", response_model=CalendarOut)
def calendar(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarOut:
    year, mon = (int(p) for p in month.split("-"))
    if not 2000 <= year <= 2100:
        raise AppError("Mês inválido.", fields={"month": "Mês inválido."})
    return StatsService(db, user).calendar(year, mon)


@workouts_router.get("/{session_id}", response_model=SessionOut)
def get_workout(
    session_id: int = SessionId,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    return WorkoutService(db, user).detail(session_id)


@workouts_router.patch("/{session_id}", response_model=SessionOut)
def update_workout(
    data: SessionUpdateIn,
    session_id: int = SessionId,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    service = WorkoutService(db, user)
    service.update(session_id, data)
    return service.detail(session_id)


@workouts_router.post("/{session_id}/finish", response_model=SessionOut)
def finish_workout(
    session_id: int = SessionId,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    service = WorkoutService(db, user)
    service.finish(session_id)
    return service.detail(session_id)


@workouts_router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(
    session_id: int = SessionId,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    WorkoutService(db, user).delete(session_id)


@workouts_router.post(
    "/{session_id}/sets", response_model=SetCreatedOut, status_code=status.HTTP_201_CREATED
)
def add_set(
    data: SetIn,
    session_id: int = SessionId,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SetCreatedOut:
    new_set, records = WorkoutService(db, user).add_set(session_id, data)
    return SetCreatedOut(set=set_out(new_set), new_records=[record_out(r) for r in records])


@workouts_router.put("/{session_id}/sets/{set_id}", response_model=SetOut)
def update_set(
    data: SetUpdateIn,
    session_id: int = SessionId,
    set_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SetOut:
    return set_out(WorkoutService(db, user).update_set(session_id, set_id, data))


@workouts_router.delete("/{session_id}/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    session_id: int = SessionId,
    set_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    WorkoutService(db, user).delete_set(session_id, set_id)


@records_router.get("", response_model=list[ExerciseRecordsOut])
def records_overview(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ExerciseRecordsOut]:
    return StatsService(db, user).records_overview()


@records_router.get("/per-month", response_model=list[VolumeBucket])
def records_per_month(
    count: int = Query(default=12, ge=1, le=36),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VolumeBucket]:
    return StatsService(db, user).records_per_month(count)


@records_router.get("/recent", response_model=list[RecordOut])
def recent_records(
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecordOut]:
    return StatsService(db, user).recent_records(limit)


@stats_router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DashboardOut:
    return StatsService(db, user).dashboard()


@stats_router.get("/volume", response_model=list[VolumeBucket])
def volume(
    period: Literal["week", "month"] = "week",
    count: int = Query(default=12, ge=1, le=52),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VolumeBucket]:
    return StatsService(db, user).buckets(period, count)
