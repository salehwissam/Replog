import os

os.environ["REPLOG_ENVIRONMENT"] = "test"
os.environ["REPLOG_DATABASE_URL"] = "sqlite://"
os.environ["REPLOG_EMAIL_BACKEND"] = "memory"
os.environ["REPLOG_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["REPLOG_SECRET_KEY"] = "chave-de-teste-com-tamanho-suficiente-123"

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

import app.models
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import build_engine, get_db
from app.email.sender import OUTBOX
from app.main import create_app


@pytest.fixture
def engine() -> Iterator[Engine]:
    eng = build_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def db(db_factory: sessionmaker[Session]) -> Iterator[Session]:
    session = db_factory()
    yield session
    session.close()


@pytest.fixture
def app(db_factory: sessionmaker[Session]):  # type: ignore[no-untyped-def]
    application = create_app(get_settings())

    def _get_db() -> Iterator[Session]:
        session = db_factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = _get_db
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    with TestClient(app, base_url="http://testserver") as c:
        yield c


@pytest.fixture
def make_client(app):  # type: ignore[no-untyped-def]
    clients: list[TestClient] = []

    def _make() -> TestClient:
        c = TestClient(app, base_url="http://testserver")
        clients.append(c)
        return c

    yield _make
    for c in clients:
        c.close()


@pytest.fixture(autouse=True)
def _clear_outbox() -> Iterator[None]:
    OUTBOX.clear()
    yield
    OUTBOX.clear()
