import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get("REPLOG_API_PORT", "8000"))
DB = BACKEND / f"e2e-{PORT}.db"

os.environ.setdefault("REPLOG_ENVIRONMENT", "development")
os.environ["REPLOG_DATABASE_URL"] = f"sqlite:///{DB.as_posix()}"
os.environ.setdefault("REPLOG_SECRET_KEY", "chave-somente-para-testes-e2e-0123456789abcdef")
os.environ["REPLOG_RATE_LIMIT_PER_MINUTE"] = "5000"
os.environ.setdefault("REPLOG_EMAIL_BACKEND", "smtp")
sys.path.insert(0, str(BACKEND))


def main() -> None:
    for suffix in ("", "-wal", "-shm"):
        Path(f"{DB}{suffix}").unlink(missing_ok=True)

    from alembic.config import Config

    from alembic import command

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", os.environ["REPLOG_DATABASE_URL"])
    command.upgrade(cfg, "head")

    from app.db.session import SessionLocal
    from app.seeds.exercises import seed_exercises

    with SessionLocal() as db:
        seed_exercises(db)

    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
