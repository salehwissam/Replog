from fastapi import APIRouter, Depends, Path, Query, status
from sqlalchemy.orm import Session

from app.core.limits import MAX_ID, SEARCH_PATTERN
from app.db.session import get_db
from app.models import User
from app.routes.deps import require_admin
from app.schemas.admin import AdminStatsOut, AdminUserOut, AdminUserPage, AdminUserUpdateIn
from app.schemas.workout import ExerciseIn, ExerciseOut
from app.services.admin import AdminService
from app.services.catalog import exercise_out

router = APIRouter(prefix="/admin", tags=["administracao"])


@router.get("/stats", response_model=AdminStatsOut)
def stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminStatsOut:
    return AdminService(db, admin).stats()


@router.get("/users", response_model=AdminUserPage)
def list_users(
    q: str | None = Query(default=None, max_length=100, pattern=SEARCH_PATTERN),
    page: int = Query(default=1, ge=1, le=10_000),
    page_size: int = Query(default=25, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminUserPage:
    return AdminService(db, admin).list_users(q, page, page_size)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    data: AdminUserUpdateIn,
    user_id: int = Path(gt=0, le=MAX_ID),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminUserOut:
    service = AdminService(db, admin)
    user = service.set_active(user_id, data.is_active)
    return service.describe([user])[0]


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_global_exercise(
    data: ExerciseIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> ExerciseOut:
    return exercise_out(AdminService(db, admin).create_global_exercise(data))


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_global_exercise(
    exercise_id: int = Path(gt=0, le=MAX_ID),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    AdminService(db, admin).archive_global_exercise(exercise_id)
