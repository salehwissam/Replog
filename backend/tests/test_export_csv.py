import csv
import io
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise, WorkoutSession, WorkoutSet, WorkoutSplit
from app.seeds.exercises import seed_exercises
from app.services.export_csv import decimal_br, neutralize
from tests.helpers import create_logged_user, post

URL = "/api/users/me/export.csv"
BOM = "﻿"
HEADER = "data;hora;treino;exercicio;serie;tipo;repeticoes;carga_kg;rpe;descanso_s;observacoes"
SUPINO = "Supino reto com barra"


@pytest.fixture(autouse=True)
def _seed(db: Session) -> None:
    seed_exercises(db)


def ex_id(db: Session, name: str) -> int:
    value = db.scalar(select(Exercise.id).where(Exercise.name == name, Exercise.user_id.is_(None)))
    assert value is not None
    return value


def download(client: TestClient) -> tuple[str, list[list[str]]]:
    r = client.get(URL)
    assert r.status_code == 200, r.text
    text = r.content.decode("utf-8")
    assert text.startswith(BOM)
    rows = list(csv.reader(io.StringIO(text[1:], newline=""), delimiter=";"))
    return text, rows


def add_set(client: TestClient, session_id: int, **data: Any) -> dict[str, Any]:
    r = post(client, f"/api/workouts/{session_id}/sets", data)
    assert r.status_code == 201, r.text
    result: dict[str, Any] = r.json()["set"]
    return result


def test_requires_login(client: TestClient) -> None:
    assert client.get(URL).status_code == 401


def test_headers_and_empty_file(client: TestClient) -> None:
    create_logged_user(client)
    r = client.get(URL)
    assert r.status_code == 200
    assert r.headers["content-type"] == "text/csv; charset=utf-8"
    assert r.headers["content-disposition"] == 'attachment; filename="replog-series.csv"'
    assert r.content == (BOM + HEADER + "\r\n").encode("utf-8")
    assert r.content.startswith(b"\xef\xbb\xbf")


def test_json_export_route_still_works(client: TestClient) -> None:
    create_logged_user(client)
    r = client.get("/api/users/me/export")
    assert r.status_code == 200
    assert "replog-meus-dados.json" in r.headers["content-disposition"]


def test_rows_format_warmup_decimal_and_escaping(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    session = post(client, "/api/workouts", {}).json()
    add_set(
        client, session["id"], exercise_id=supino, reps=15, weight_kg=20, set_type="aquecimento"
    )
    add_set(
        client,
        session["id"],
        exercise_id=supino,
        reps=8,
        weight_kg=62.5,
        rpe=7.5,
        rest_seconds=90,
        notes='disse "boa"; foi',
    )
    text, rows = download(client)
    assert text.splitlines()[0] == BOM + HEADER
    assert rows[0] == HEADER.split(";")
    assert len(rows) == 3

    warmup, work = rows[1], rows[2]
    assert len(warmup) == len(work) == 11
    assert warmup[2] == "Treino livre"
    assert warmup[3] == SUPINO
    assert (warmup[4], warmup[5], warmup[6], warmup[7], warmup[8]) == (
        "1", "aquecimento", "15", "20", "",
    )  # fmt: skip
    assert (work[4], work[5], work[6], work[7], work[8], work[9]) == (
        "2", "normal", "8", "62,5", "7,5", "90",
    )  # fmt: skip
    assert work[10] == 'disse "boa"; foi'
    assert '"disse ""boa""; foi"' in text


def test_formula_injection_is_neutralized(client: TestClient, db: Session) -> None:
    create_logged_user(client)
    r = post(
        client,
        "/api/exercises",
        {"name": '=HYPERLINK("http://x")', "muscle_group": "peito", "equipment": "barra"},
    )
    assert r.status_code == 201, r.text
    evil = r.json()["id"]
    session = post(client, "/api/workouts", {}).json()
    add_set(client, session["id"], exercise_id=evil, reps=5, weight_kg=10, notes="@SOMA(1;2)")
    add_set(client, session["id"], exercise_id=evil, reps=5, weight_kg=10, notes="+1-2")
    add_set(client, session["id"], exercise_id=evil, reps=5, weight_kg=10, notes="-3")

    _, rows = download(client)
    assert rows[1][3] == '\'=HYPERLINK("http://x")'
    assert rows[1][10] == "'@SOMA(1;2)"
    assert rows[2][10] == "'+1-2"
    assert rows[3][10] == "'-3"
    for row in rows[1:]:
        for cell in row:
            assert not cell.startswith(("=", "+", "-", "@", "\t", "\r"))


def test_neutralize_and_decimal_helpers() -> None:
    for dangerous in ("=1+1", "+1", "-1", "@SOMA(1)", "\tx", "\rx"):
        assert neutralize(dangerous) == "'" + dangerous
    assert neutralize("Supino") == "Supino"
    assert neutralize("") == ""
    assert decimal_br(Decimal("60.00")) == "60"
    assert decimal_br(Decimal("62.50")) == "62,5"
    assert decimal_br(Decimal("0.00")) == "0"
    assert decimal_br(Decimal("102.25")) == "102,25"
    assert decimal_br(Decimal("100")) == "100"
    assert decimal_br(None) == ""


def test_local_time_split_label_and_order(client: TestClient, db: Session) -> None:
    user = create_logged_user(client)
    supino = ex_id(db, SUPINO)
    split = WorkoutSplit(user_id=user["id"], letter="A", name="Peito; tríceps")
    db.add(split)
    db.flush()

    def workout(started: datetime, tz: str, split_id: int | None) -> int:
        s = WorkoutSession(
            user_id=user["id"],
            split_id=split_id,
            started_at=started,
            finished_at=started,
            timezone=tz,
            local_date=started.astimezone(ZoneInfo(tz)).date(),
        )
        db.add(s)
        db.flush()
        db.add(
            WorkoutSet(
                session_id=s.id,
                user_id=user["id"],
                exercise_id=supino,
                set_number=1,
                reps=10,
                weight_kg=Decimal("100.25"),
                performed_at=started,
            )
        )
        return s.id

    workout(datetime(2026, 11, 10, 12, 0, tzinfo=UTC), "Asia/Tokyo", None)
    workout(datetime(2026, 11, 9, 23, 30, tzinfo=UTC), "America/Sao_Paulo", split.id)
    db.commit()

    _, rows = download(client)
    assert rows[1][:4] == ["09/11/2026", "20:30", "Treino A – Peito; tríceps", SUPINO]
    assert rows[1][7] == "100,25"
    assert rows[2][:3] == ["10/11/2026", "21:00", "Treino livre"]


def test_only_own_data(client: TestClient, make_client: Any, db: Session) -> None:
    create_logged_user(client)
    supino = ex_id(db, SUPINO)
    session = post(client, "/api/workouts", {}).json()
    add_set(client, session["id"], exercise_id=supino, reps=10, weight_kg=50, notes="da Ana")

    other = make_client()
    create_logged_user(other, "bia@exemplo.com")
    _, rows = download(other)
    assert rows == [HEADER.split(";")]

    _, rows = download(client)
    assert len(rows) == 2
    assert rows[1][10] == "da Ana"
