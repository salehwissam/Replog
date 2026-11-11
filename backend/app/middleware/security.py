import ipaddress
import logging
import threading
import time
import uuid
from collections import OrderedDict, deque
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_body
from app.core.logging import log_event, request_id_var
from app.core.security import tokens_equal

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_errors_logger = logging.getLogger("replog.errors")
CSRF_HEADER = "x-csrf-token"


class UnhandledErrorMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except _BodyTooLargeError:
            raise
        except Exception as exc:
            if started:
                raise
            log_event(_errors_logger, "erro_inesperado", level=40, tipo=type(exc).__name__)
            _errors_logger.error("Exceção não tratada", exc_info=exc)
            response = JSONResponse(
                status_code=500,
                content=error_body(
                    "erro_interno",
                    f"Ocorreu um erro inesperado. Código de referência: {request_id_var.get()}",
                ),
            )
            await response(scope, receive, send)


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rid = uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message).append("X-Request-ID", rid)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_id_var.reset(token)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
                headers["Cross-Origin-Opener-Policy"] = "same-origin"
                headers["Cross-Origin-Resource-Policy"] = "same-origin"
                headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
                headers["Cache-Control"] = "no-store"
                if self.hsts:
                    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
            await send(message)

        await self.app(scope, receive, send_wrapper)


class RateLimiter:
    PRUNE_EVERY = 1_000
    MAX_KEYS = 100_000

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()
        self._calls = 0

    def _prune(self, now: float) -> None:
        while self._hits:
            key, hits = next(iter(self._hits.items()))
            if hits and now - hits[-1] <= self.window:
                break
            del self._hits[key]

    def allow(self, key: str) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            self._calls += 1
            if self._calls % self.PRUNE_EVERY == 0:
                self._prune(now)
            if key not in self._hits and len(self._hits) >= self.MAX_KEYS:
                self._hits.popitem(last=False)
            hits = self._hits.setdefault(key, deque())
            self._hits.move_to_end(key)
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry = int(self.window - (now - hits[0])) + 1
                return False, retry
            hits.append(now)
            return True, 0

    def __len__(self) -> int:
        return len(self._hits)


def rate_limit_key(host: str | None) -> str:
    if not host:
        return "desconhecido"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host[:64]
    if ip.version == 6:
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, *, limiter: RateLimiter) -> None:
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        allowed, retry = self.limiter.allow(rate_limit_key(client[0] if client else None))
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content=error_body(
                    "muitas_requisicoes",
                    "Muitas requisições em pouco tempo. Aguarde um instante.",
                ),
                headers={"Retry-After": str(retry)},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        too_large = JSONResponse(
            status_code=413,
            content=error_body("requisicao_grande", "Os dados enviados são grandes demais."),
        )
        declared = Headers(scope=scope).get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > self.max_bytes):
            await too_large(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLargeError
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLargeError:
            await too_large(scope, receive, send)


class _BodyTooLargeError(Exception):
    pass


class CSRFMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        cookie_name: str,
        allowed_origins: list[str],
        exempt_paths: set[str] | None = None,
    ) -> None:
        self.app = app
        self.cookie_name = cookie_name
        self.allowed_origins = set(allowed_origins)
        self.exempt_paths = exempt_paths or set()

    def _reject(self, message: str) -> Callable[..., Any]:
        return JSONResponse(status_code=403, content=error_body("csrf_invalido", message))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] not in UNSAFE_METHODS
            or scope["path"] in self.exempt_paths
        ):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if (
            origin is not None
            and origin not in self.allowed_origins
            and not _same_origin(origin, headers.get("host"))
        ):
            await self._reject("Origem da requisição não permitida.")(scope, receive, send)
            return

        cookie_token = _read_cookie(headers.get("cookie", ""), self.cookie_name)
        header_token = headers.get(CSRF_HEADER, "")
        if not cookie_token or not header_token or not tokens_equal(cookie_token, header_token):
            await self._reject("Sessão de segurança expirada. Recarregue a página.")(
                scope, receive, send
            )
            return

        await self.app(scope, receive, send)


def _same_origin(origin: str, host: str | None) -> bool:
    if not host or origin == "null":
        return False
    parsed = urlsplit(origin)
    return parsed.scheme in ("http", "https") and parsed.netloc.lower() == host.lower()


def _read_cookie(cookie_header: str, name: str) -> str | None:
    for part in cookie_header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None
