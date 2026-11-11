import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_SENSITIVE_KEYS = {"password", "senha", "token", "cookie", "authorization", "csrf", "secret"}


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[REMOVIDO]" if any(s in k.lower() for s in _SENSITIVE_KEYS) else _scrub(v))
            for k, v in value.items()
        }
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        extra = getattr(record, "extra_data", None)
        if isinstance(extra, dict):
            payload.update(_scrub(extra))
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        extra = getattr(record, "extra_data", None)
        suffix = f" {_scrub(extra)}" if isinstance(extra, dict) else ""
        return f"{base} [req={request_id_var.get()}]{suffix}"


def configure_logging(level: str = "INFO", as_json: bool = False) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JsonFormatter()
        if as_json
        else TextFormatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def log_event(logger: logging.Logger, msg: str, level: int = logging.INFO, **data: Any) -> None:
    logger.log(level, msg, extra={"extra_data": data})
