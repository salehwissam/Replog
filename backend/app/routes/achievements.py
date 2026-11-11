from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User
from app.routes.deps import get_current_user
from app.schemas.achievements import AchievementOut
from app.services.achievements import list_achievements
from app.services.export_csv import CSV_FILENAME, export_sets_csv

router = APIRouter(prefix="/achievements", tags=["conquistas"])
export_router = APIRouter(prefix="/users", tags=["usuarios"])


@router.get("", response_model=list[AchievementOut])
def get_achievements(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[AchievementOut]:
    return list_achievements(db, user)


@export_router.get("/me/export.csv", response_class=StreamingResponse)
def export_csv(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> StreamingResponse:
    return StreamingResponse(
        export_sets_csv(db, user),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{CSV_FILENAME}"'},
    )
