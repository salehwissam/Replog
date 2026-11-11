import argparse
import sys

from sqlalchemy import select

from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models import User
from app.repositories.users import SessionRepository


def set_role(email: str, role: str) -> int:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            print(f"Nenhuma conta com o e-mail {email}.", file=sys.stderr)
            return 1
        if role == "admin" and not user.is_verified:
            print("A conta precisa ter o e-mail confirmado antes.", file=sys.stderr)
            return 1
        user.role = role
        SessionRepository(db).revoke_all_for_user(user.id, utcnow())
        db.commit()
    papel = "administrador" if role == "admin" else "usuário comum"
    print(f"{email} agora é {papel}. As sessões foram encerradas; entre novamente.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.cli", description="Administração do REPLOG"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("promover", "rebaixar"):
        p = sub.add_parser(name)
        p.add_argument("email")
    args = parser.parse_args(argv)
    return set_role(args.email, "admin" if args.cmd == "promover" else "user")


if __name__ == "__main__":
    raise SystemExit(main())
