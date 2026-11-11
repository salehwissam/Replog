from app.db.session import SessionLocal
from app.seeds.exercises import seed_exercises


def main() -> None:
    with SessionLocal() as db:
        created = seed_exercises(db)
    print(f"Catálogo de exercícios: {created} novo(s) exercício(s) inserido(s).")


if __name__ == "__main__":
    main()
