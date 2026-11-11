import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import log_event, request_id_var

logger = logging.getLogger("replog.errors")


class AppError(Exception):
    status_code = 400
    code = "requisicao_invalida"
    message = "Requisição inválida."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        fields: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.fields = fields
        super().__init__(self.message)


class NotFoundError(AppError):
    status_code = 404
    code = "nao_encontrado"
    message = "Registro não encontrado."


class ConflictError(AppError):
    status_code = 409
    code = "conflito"
    message = "Conflito com dados existentes."


class UnauthorizedError(AppError):
    status_code = 401
    code = "nao_autenticado"
    message = "Você precisa entrar na sua conta."


class ForbiddenError(AppError):
    status_code = 403
    code = "acesso_negado"
    message = "Você não tem permissão para esta ação."


class TooManyRequestsError(AppError):
    status_code = 429
    code = "muitas_tentativas"
    message = "Muitas tentativas. Aguarde alguns minutos e tente novamente."


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"codigo": code, "mensagem": message}
    if fields:
        body["campos"] = fields
    return {"erro": body}


_VALIDATION_MESSAGES = {
    "missing": "Campo obrigatório.",
    "string_too_short": "Texto muito curto.",
    "string_too_long": "Texto muito longo.",
    "value_error": "Valor inválido.",
    "int_parsing": "Informe um número inteiro.",
    "int_type": "Informe um número inteiro.",
    "decimal_parsing": "Informe um número válido.",
    "decimal_type": "Informe um número válido.",
    "float_parsing": "Informe um número válido.",
    "greater_than": "Valor muito baixo.",
    "greater_than_equal": "Valor muito baixo.",
    "less_than": "Valor muito alto.",
    "less_than_equal": "Valor muito alto.",
    "decimal_max_places": "Use no máximo 2 casas decimais.",
    "decimal_max_digits": "Número com dígitos demais.",
    "string_type": "Informe um texto.",
    "bool_parsing": "Valor verdadeiro/falso inválido.",
    "date_from_datetime_parsing": "Data inválida.",
    "date_parsing": "Data inválida.",
    "literal_error": "Opção inválida.",
    "enum": "Opção inválida.",
    "json_invalid": "JSON inválido.",
    "extra_forbidden": "Campo não permitido.",
    "list_type": "Informe uma lista.",
    "too_long": "Itens demais.",
    "too_short": "Itens de menos.",
    "dict_type": "Formato inválido.",
    "model_type": "Formato inválido.",
}


def _validation_fields(exc: RequestValidationError) -> dict[str, str]:
    fields: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path")]
        key = ".".join(loc) or "requisicao"
        err_type = str(err.get("type", ""))
        msg = _VALIDATION_MESSAGES.get(err_type, "Valor inválido.")
        if err_type == "value_error":
            ctx_error = (err.get("ctx") or {}).get("error")
            if ctx_error is not None:
                msg = str(ctx_error)
        fields.setdefault(key, msg)
    return fields


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.fields)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=error_body(
                "dados_invalidos", "Verifique os dados informados.", _validation_fields(exc)
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        messages = {
            404: ("nao_encontrado", "Recurso não encontrado."),
            405: ("metodo_nao_permitido", "Método não permitido."),
        }
        code, message = messages.get(exc.status_code, ("erro_http", "Não foi possível processar."))
        return JSONResponse(status_code=exc.status_code, content=error_body(code, message))

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception) -> JSONResponse:
        log_event(
            logger,
            "erro_inesperado",
            level=logging.ERROR,
            tipo=type(exc).__name__,
        )
        logger.exception("Exceção não tratada", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=error_body(
                "erro_interno",
                f"Ocorreu um erro inesperado. Código de referência: {request_id_var.get()}",
            ),
        )
