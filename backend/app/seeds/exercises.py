from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Exercise

MUSCLE_GROUPS = {
    "peito": "Peito",
    "costas": "Costas",
    "ombros": "Ombros",
    "biceps": "Bíceps",
    "triceps": "Tríceps",
    "antebraco": "Antebraço",
    "quadriceps": "Quadríceps",
    "posterior": "Posterior de coxa",
    "gluteos": "Glúteos",
    "panturrilha": "Panturrilha",
    "abdomen": "Abdômen",
    "corpo_inteiro": "Corpo inteiro",
}

EQUIPMENT = {
    "barra": "Barra",
    "halter": "Halter",
    "maquina": "Máquina",
    "polia": "Polia/Cabo",
    "peso_corporal": "Peso corporal",
    "smith": "Smith",
    "kettlebell": "Kettlebell",
    "outro": "Outro",
}

CATALOG: list[tuple[str, str, str, bool]] = [
    ("Supino reto com barra", "peito", "barra", False),
    ("Supino inclinado com barra", "peito", "barra", False),
    ("Supino declinado com barra", "peito", "barra", False),
    ("Supino reto com halteres", "peito", "halter", False),
    ("Supino inclinado com halteres", "peito", "halter", False),
    ("Supino na máquina", "peito", "maquina", False),
    ("Supino no Smith", "peito", "smith", False),
    ("Crucifixo com halteres", "peito", "halter", False),
    ("Crucifixo na máquina (peck deck)", "peito", "maquina", False),
    ("Crossover na polia", "peito", "polia", False),
    ("Flexão de braço", "peito", "peso_corporal", True),
    ("Paralelas (peito)", "peito", "peso_corporal", True),
    ("Barra fixa", "costas", "peso_corporal", True),
    ("Puxada frontal na polia", "costas", "polia", False),
    ("Puxada com triângulo", "costas", "polia", False),
    ("Remada curvada com barra", "costas", "barra", False),
    ("Remada unilateral com halter", "costas", "halter", False),
    ("Remada baixa na polia", "costas", "polia", False),
    ("Remada cavalinho", "costas", "barra", False),
    ("Remada na máquina", "costas", "maquina", False),
    ("Pulldown com braços estendidos", "costas", "polia", False),
    ("Levantamento terra", "costas", "barra", False),
    ("Hiperextensão lombar", "costas", "peso_corporal", True),
    ("Desenvolvimento com barra", "ombros", "barra", False),
    ("Desenvolvimento com halteres", "ombros", "halter", False),
    ("Desenvolvimento na máquina", "ombros", "maquina", False),
    ("Elevação lateral com halteres", "ombros", "halter", False),
    ("Elevação lateral na polia", "ombros", "polia", False),
    ("Elevação frontal", "ombros", "halter", False),
    ("Crucifixo invertido", "ombros", "halter", False),
    ("Face pull", "ombros", "polia", False),
    ("Remada alta", "ombros", "barra", False),
    ("Encolhimento com halteres", "ombros", "halter", False),
    ("Rosca direta com barra", "biceps", "barra", False),
    ("Rosca direta com barra W", "biceps", "barra", False),
    ("Rosca alternada com halteres", "biceps", "halter", False),
    ("Rosca martelo", "biceps", "halter", False),
    ("Rosca concentrada", "biceps", "halter", False),
    ("Rosca Scott", "biceps", "barra", False),
    ("Rosca na polia", "biceps", "polia", False),
    ("Rosca inclinada com halteres", "biceps", "halter", False),
    ("Tríceps na polia (barra)", "triceps", "polia", False),
    ("Tríceps na polia (corda)", "triceps", "polia", False),
    ("Tríceps testa", "triceps", "barra", False),
    ("Tríceps francês", "triceps", "halter", False),
    ("Tríceps coice", "triceps", "halter", False),
    ("Supino fechado", "triceps", "barra", False),
    ("Mergulho no banco", "triceps", "peso_corporal", True),
    ("Paralelas (tríceps)", "triceps", "peso_corporal", True),
    ("Rosca de punho", "antebraco", "barra", False),
    ("Rosca inversa", "antebraco", "barra", False),
    ("Agachamento livre", "quadriceps", "barra", False),
    ("Agachamento frontal", "quadriceps", "barra", False),
    ("Agachamento no Smith", "quadriceps", "smith", False),
    ("Agachamento búlgaro", "quadriceps", "halter", False),
    ("Agachamento goblet", "quadriceps", "kettlebell", False),
    ("Leg press 45°", "quadriceps", "maquina", False),
    ("Hack squat", "quadriceps", "maquina", False),
    ("Cadeira extensora", "quadriceps", "maquina", False),
    ("Afundo com halteres", "quadriceps", "halter", False),
    ("Passada", "quadriceps", "halter", False),
    ("Mesa flexora", "posterior", "maquina", False),
    ("Cadeira flexora", "posterior", "maquina", False),
    ("Flexora em pé", "posterior", "maquina", False),
    ("Stiff com barra", "posterior", "barra", False),
    ("Levantamento terra romeno", "posterior", "barra", False),
    ("Good morning", "posterior", "barra", False),
    ("Elevação pélvica (hip thrust)", "gluteos", "barra", False),
    ("Glúteo na polia", "gluteos", "polia", False),
    ("Cadeira abdutora", "gluteos", "maquina", False),
    ("Cadeira adutora", "gluteos", "maquina", False),
    ("Coice na máquina", "gluteos", "maquina", False),
    ("Panturrilha em pé", "panturrilha", "maquina", False),
    ("Panturrilha sentado", "panturrilha", "maquina", False),
    ("Panturrilha no leg press", "panturrilha", "maquina", False),
    ("Abdominal supra", "abdomen", "peso_corporal", True),
    ("Abdominal infra", "abdomen", "peso_corporal", True),
    ("Abdominal na polia", "abdomen", "polia", False),
    ("Elevação de pernas na barra", "abdomen", "peso_corporal", True),
    ("Abdominal na máquina", "abdomen", "maquina", False),
    ("Abdominal oblíquo", "abdomen", "peso_corporal", True),
    ("Kettlebell swing", "corpo_inteiro", "kettlebell", False),
    ("Arremesso (clean)", "corpo_inteiro", "barra", False),
    ("Burpee", "corpo_inteiro", "peso_corporal", True),
]


def seed_exercises(db: Session) -> int:
    existing = set(db.scalars(select(Exercise.name).where(Exercise.user_id.is_(None))))
    created = 0
    for name, group, equipment, bodyweight in CATALOG:
        if name in existing:
            continue
        db.add(
            Exercise(
                user_id=None,
                name=name,
                muscle_group=group,
                equipment=equipment,
                is_bodyweight=bodyweight,
            )
        )
        created += 1
    db.commit()
    return created
