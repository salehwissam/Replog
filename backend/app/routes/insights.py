from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID
from app.db.session import get_db
from app.models import User
from app.routes.deps import get_current_user
from app.schemas.insights import SuggestionOut
from app.schemas.workout import Intensity
from app.services.suggestions import SuggestionService

router = APIRouter(prefix="/exercises", tags=["sugestoes"])

TARGET_REPS_PATTERN = r"^\d{1,3}(-\d{1,3})?$"


@router.get("/{exercise_id}/suggestion", response_model=SuggestionOut)
def exercise_suggestion(
    exercise_id: int = Path(gt=0, le=MAX_ID),
    target_reps: str | None = Query(default=None, max_length=7, pattern=TARGET_REPS_PATTERN),
    intensity: Intensity | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestionOut:
    return SuggestionService(db, user).suggest(exercise_id, target_reps, intensity)
