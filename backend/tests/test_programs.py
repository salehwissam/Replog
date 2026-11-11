import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.seeds.exercises import CATALOG, seed_exercises
from app.seeds.programs import PROGRAMS
from tests.helpers import create_logged_user, post, put


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def test_every_program_exercise_exists_in_catalog() -> None:
    names = {name for name, *_ in CATALOG}
    for program in PROGRAMS:
        letters = [s.letter for s in program.splits]
        assert letters == sorted(letters) and letters[0] == "A", program.key
        for split in program.splits:
            assert split.exercises, f"{program.key}/{split.letter} vazio"
            for ex in split.exercises:
                assert ex.name in names, f"{program.key}: '{ex.name}' fora do catálogo"


def test_list_programs_requires_login(client: TestClient) -> None:
    assert client.get("/api/programs").status_code == 401
    create_logged_user(client)
    data = client.get("/api/programs").json()
    assert len(data) == len(PROGRAMS)
    first = data[0]["splits"][0]["exercises"][0]
    assert first["exercise_id"] is not None and first["muscle_group"]


def test_apply_program_creates_splits(client: TestClient) -> None:
    create_logged_user(client)
    r = post(client, "/api/programs/abc/apply", {})
    assert r.status_code == 200, r.text
    splits = r.json()
    assert [s["letter"] for s in splits] == ["A", "B", "C"]
    assert splits[0]["name"] == "Peito, ombros e tríceps"
    assert splits[0]["exercises"][0]["exercise"]["name"] == "Supino reto com barra"
    assert splits[0]["exercises"][0]["target_reps"] == "8-10"
    session = post(client, "/api/workouts", {"split_id": splits[0]["id"]}).json()
    assert session["split"]["letter"] == "A"


def test_apply_over_existing_splits_needs_confirmation(client: TestClient) -> None:
    create_logged_user(client)
    put(client, "/api/splits/E", {"name": "Meu treino E"})
    r = post(client, "/api/programs/abc/apply", {})
    assert r.status_code == 409
    assert r.json()["erro"]["codigo"] == "divisoes_existentes"
    r = post(client, "/api/programs/abc/apply", {"replace_existing": True})
    assert r.status_code == 200
    assert [s["letter"] for s in client.get("/api/splits").json()] == ["A", "B", "C"]


def test_apply_unknown_or_invalid_program(client: TestClient) -> None:
    create_logged_user(client)
    assert post(client, "/api/programs/nao-existe/apply", {}).status_code == 404
    assert post(client, "/api/programs/..%2Fadmin/apply", {}).status_code in (404, 422)
    assert post(client, "/api/programs/abc/apply", {"user_id": 2}).status_code == 422
