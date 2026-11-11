from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import User
from app.routes.deps import get_current_user
from app.schemas.program import ApplyProgramIn, ProgramOut
from app.schemas.workout import SplitOut
from app.services.catalog import split_out
from app.services.programs import apply_program, list_programs

router = APIRouter(prefix="/programs", tags=["programas"])


@router.get("", response_model=list[ProgramOut])
def programs(
    _: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[ProgramOut]:
    return list_programs(db)


@router.post("/{key}/apply", response_model=list[SplitOut])
def apply(
    data: ApplyProgramIn,
    key: str = Path(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SplitOut]:
    return [split_out(s) for s in apply_program(db, user.id, key, data.replace_existing)]
