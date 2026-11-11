from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.middleware.security import (
    BodySizeLimitMiddleware,
    CSRFMiddleware,
    RateLimiter,
    RateLimitMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
    UnhandledErrorMiddleware,
)
from app.routes import api_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)

    app = FastAPI(
        title="REPLOG API",
        version="0.1.0",
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )
    app.state.settings = settings

    register_exception_handlers(app)

    allowed_origins = sorted({*settings.cors_origin_list, settings.frontend_url})

    app.add_middleware(UnhandledErrorMiddleware)
    app.add_middleware(
        CSRFMiddleware,
        cookie_name=settings.csrf_cookie,
        allowed_origins=allowed_origins,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=64 * 1024)
    app.add_middleware(
        RateLimitMiddleware, limiter=RateLimiter(settings.rate_limit_per_minute, 60.0)
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    app.add_middleware(RequestIdMiddleware)

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
