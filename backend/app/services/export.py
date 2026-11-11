from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.base import utcnow
from app.models import Exercise, PersonalRecord, User, WorkoutSession, WorkoutSet
from app.repositories.workouts import SplitRepository
from app.services.catalog import split_out


def export_user_data(db: Session, user: User) -> dict[str, Any]:
    sessions = db.scalars(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .options(selectinload(WorkoutSession.sets).selectinload(WorkoutSet.exercise))
        .order_by(WorkoutSession.started_at)
    ).all()
    custom = db.scalars(select(Exercise).where(Exercise.user_id == user.id)).all()
    records = db.scalars(
        select(PersonalRecord)
        .where(PersonalRecord.user_id == user.id)
        .options(selectinload(PersonalRecord.exercise))
        .order_by(PersonalRecord.achieved_at)
    ).all()
    return {
        "gerado_em": utcnow().isoformat(),
        "perfil": {
            "nome": user.name,
            "email": user.email,
            "fuso_horario": user.timezone,
            "criado_em": user.created_at.isoformat(),
        },
        "exercicios_personalizados": [
            {
                "id": e.id,
                "nome": e.name,
                "grupo_muscular": e.muscle_group,
                "equipamento": e.equipment,
            }
            for e in custom
        ],
        "divisoes": [
            split_out(s).model_dump(mode="json") for s in SplitRepository(db).list(user.id)
        ],
        "treinos": [
            {
                "id": s.id,
                "data": s.local_date.isoformat(),
                "inicio": s.started_at.isoformat(),
                "fim": s.finished_at.isoformat() if s.finished_at else None,
                "fuso_horario": s.timezone,
                "observacoes": s.notes,
                "series": [
                    {
                        "exercicio": st.exercise.name,
                        "serie": st.set_number,
                        "tipo": st.set_type,
                        "repeticoes": st.reps,
                        "carga_kg": float(st.weight_kg),
                        "rpe": float(st.rpe) if st.rpe is not None else None,
                        "descanso_s": st.rest_seconds,
                        "observacoes": st.notes,
                        "horario": st.performed_at.isoformat(),
                    }
                    for st in s.sets
                ],
            }
            for s in sessions
        ],
        "recordes": [
            {
                "exercicio": r.exercise.name,
                "tipo": r.record_type,
                "valor": float(r.value),
                "valor_anterior": float(r.previous_value) if r.previous_value is not None else None,
                "data": r.achieved_at.isoformat(),
            }
            for r in records
        ],
    }
