import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def wait_for_database(attempts: int = 30) -> None:
    from sqlalchemy import text

    from app.db.session import engine

    for i in range(attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except Exception:
            print(f"Aguardando o banco de dados ({i + 1}/{attempts})...", flush=True)
            time.sleep(2)
    raise SystemExit("Banco de dados indisponível.")


def main() -> None:
    wait_for_database()

    from alembic.config import Config

    from alembic import command

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    command.upgrade(cfg, "head")

    from app.db.session import SessionLocal
    from app.seeds.exercises import seed_exercises

    with SessionLocal() as db:
        created = seed_exercises(db)
    print(f"Migrações aplicadas. Catálogo: {created} exercício(s) novo(s).", flush=True)


if __name__ == "__main__":
    main()
