from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_token
from app.db.base import utcnow
from app.db.session import get_db
from app.email.sender import send_email
from app.email.templates import EmailMessage
from app.repositories.users import SessionRepository
from app.routes.deps import (
    CurrentAuth,
    clear_session_cookies,
    client_ip,
    get_current_auth,
    set_csrf_cookie,
    set_session_cookies,
    settings_dep,
)
from app.schemas.auth import (
    ChangePasswordIn,
    EmailIn,
    LoginIn,
    MessageOut,
    RegisterIn,
    ResetPasswordIn,
    UserOut,
    VerifyEmailIn,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["autenticacao"])

MSG_REGISTER = (
    "Cadastro recebido! Enviamos um link de confirmação para o seu e-mail. "
    "Abra o link para ativar a conta."
)
MSG_FORGOT = (
    "Se existir uma conta com este e-mail, você receberá um link para redefinir a senha "
    "em alguns minutos."
)
MSG_RESEND = "Se a conta existir e ainda não estiver confirmada, enviaremos um novo link."


def _service(db: Session, settings: Settings) -> AuthService:
    return AuthService(db, settings)


def _queue(tasks: BackgroundTasks, message: EmailMessage | None) -> None:
    if message is not None:
        tasks.add_task(send_email, message)


@router.get("/csrf", status_code=status.HTTP_204_NO_CONTENT)
def csrf(request: Request, response: Response, settings: Settings = Depends(settings_dep)) -> None:
    if not request.cookies.get(settings.csrf_cookie):
        set_csrf_cookie(response, settings)


@router.post("/register", status_code=status.HTTP_202_ACCEPTED, response_model=MessageOut)
def register(
    data: RegisterIn,
    tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    _queue(tasks, _service(db, settings).register(data))
    return MessageOut(mensagem=MSG_REGISTER)


@router.post("/verify-email", response_model=MessageOut)
def verify_email(
    data: VerifyEmailIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    _service(db, settings).verify_email(data.token, data.password)
    return MessageOut(mensagem="E-mail confirmado! Agora você já pode entrar.")


@router.post(
    "/resend-verification", status_code=status.HTTP_202_ACCEPTED, response_model=MessageOut
)
def resend_verification(
    data: EmailIn,
    tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    _queue(tasks, _service(db, settings).resend_verification(data.email))
    return MessageOut(mensagem=MSG_RESEND)


@router.post("/login", response_model=UserOut)
def login(
    data: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> UserOut:
    user, new = _service(db, settings).login(
        data.email,
        data.password,
        client_ip(request),
        request.headers.get("user-agent"),
        data.timezone,
        previous_session_token=request.cookies.get(settings.session_cookie),
    )
    set_session_cookies(response, settings, new.token, new.csrf_token)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> None:
    token = request.cookies.get(settings.session_cookie)
    if token and len(token) <= 128:
        session = SessionRepository(db).get_active_by_token_hash(hash_token(token), utcnow())
        if session is not None:
            _service(db, settings).logout(session)
    clear_session_cookies(response, settings)


@router.post("/logout-others", response_model=MessageOut)
def logout_others(
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    count = _service(db, settings).logout_others(auth.user, auth.session)
    return MessageOut(mensagem=f"{count} outra(s) sessão(ões) encerrada(s).")


@router.get("/me", response_model=UserOut)
def me(auth: CurrentAuth = Depends(get_current_auth)) -> UserOut:
    return UserOut.model_validate(auth.user)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED, response_model=MessageOut)
def forgot_password(
    data: EmailIn,
    tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    _queue(tasks, _service(db, settings).forgot_password(data.email))
    return MessageOut(mensagem=MSG_FORGOT)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(
    data: ResetPasswordIn,
    tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    _queue(tasks, _service(db, settings).reset_password(data.token, data.password))
    clear_session_cookies(response, settings)
    return MessageOut(mensagem="Senha redefinida! Entre com a nova senha.")


@router.post("/change-password", response_model=MessageOut)
def change_password(
    data: ChangePasswordIn,
    request: Request,
    response: Response,
    tasks: BackgroundTasks,
    auth: CurrentAuth = Depends(get_current_auth),
    db: Session = Depends(get_db),
    settings: Settings = Depends(settings_dep),
) -> MessageOut:
    new, message = _service(db, settings).change_password(
        auth.user, auth.session, data.current_password, data.password, client_ip(request)
    )
    set_session_cookies(response, settings, new.token, new.csrf_token)
    _queue(tasks, message)
    return MessageOut(mensagem="Senha alterada. As outras sessões foram encerradas.")
