from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import get_db
from app.models import User
from app.routes.deps import clear_session_cookies, client_ip, get_current_user, settings_dep
from app.schemas.auth import DeleteAccountIn, UpdateProfileIn, UserOut
from app.services.auth import AuthService
from app.services.export import export_user_data

router = APIRouter(prefix="/users", tags=["usuarios"])


@router.patch("/me", response_model=UserOut)
def update_profile(
    data: UpdateProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    if data.name is not None:
        user.name = data.name
    if data.timezone is not None:
        user.timezone = data.timezone
    db.commit()
    return UserOut.model_validate(user)


@router.get("/me/export")
def export_data(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> JSONResponse:
    return JSONResponse(
        content=export_user_data(db, user),
        headers={"Content-Disposition": 'attachment; filename="replog-meus-dados.json"'},
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    data: DeleteAccountIn,
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> None:
    AuthService(db, settings).delete_account(user, data.password, client_ip(request))
    clear_session_cookies(response, settings)
