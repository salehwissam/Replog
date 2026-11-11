FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.lock ./
RUN pip install -r requirements.lock

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY scripts/prestart.py ./scripts/prestart.py

RUN useradd --system --uid 10001 --no-create-home replog
USER replog

EXPOSE 8000

CMD ["sh", "-c", "python scripts/prestart.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${REPLOG_WORKERS:-2} --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
