from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID
from app.db.session import get_db
from app.models import User
from app.routes.deps import get_current_user
from app.schemas.analytics import (
    AnalyticsSummaryOut,
    HeatmapDayOut,
    MuscleVolumeOut,
    SessionSummaryOut,
)
from app.services.analytics import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["analises"])


@router.get("/summary", response_model=AnalyticsSummaryOut)
def summary(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AnalyticsSummaryOut:
    return AnalyticsService(db, user).summary()


@router.get("/muscles", response_model=list[MuscleVolumeOut])
def muscles(
    weeks: int = Query(default=4, ge=1, le=52),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[MuscleVolumeOut]:
    return AnalyticsService(db, user).muscles(weeks)


@router.get("/heatmap", response_model=list[HeatmapDayOut])
def heatmap(
    days: int = Query(default=182, ge=7, le=366),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[HeatmapDayOut]:
    return AnalyticsService(db, user).heatmap(days)


@router.get("/sessions/{session_id}/summary", response_model=SessionSummaryOut)
def session_summary(
    session_id: int = Path(gt=0, le=MAX_ID),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionSummaryOut:
    return AnalyticsService(db, user).session_summary(session_id)
