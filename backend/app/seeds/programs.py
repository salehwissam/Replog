from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProgramExercise:
    name: str
    sets: int
    reps: str
    rest: int


@dataclass(frozen=True)
class ProgramSplit:
    letter: str
    name: str
    exercises: list[ProgramExercise] = field(default_factory=list)


@dataclass(frozen=True)
class Program:
    key: str
    name: str
    level: str
    days_per_week: str
    goal: str
    description: str
    splits: list[ProgramSplit]


def _e(name: str, sets: int, reps: str, rest: int) -> ProgramExercise:
    return ProgramExercise(name, sets, reps, rest)


PROGRAMS: list[Program] = [
    Program(
        key="corpo-inteiro",
        name="Corpo inteiro",
        level="iniciante",
        days_per_week="3 dias",
        goal="Aprender os movimentos e ganhar força geral",
        description=(
            "Dois treinos que trabalham o corpo todo. Alterne A e B em dias não seguidos "
            "(ex.: segunda A, quarta B, sexta A)."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Corpo inteiro A",
                [
                    _e("Agachamento goblet", 3, "10-12", 90),
                    _e("Supino reto com halteres", 3, "10-12", 90),
                    _e("Puxada frontal na polia", 3, "10-12", 90),
                    _e("Desenvolvimento com halteres", 3, "10-12", 75),
                    _e("Mesa flexora", 3, "12", 60),
                    _e("Abdominal supra", 3, "15", 45),
                ],
            ),
            ProgramSplit(
                "B",
                "Corpo inteiro B",
                [
                    _e("Leg press 45°", 3, "10-12", 90),
                    _e("Remada baixa na polia", 3, "10-12", 90),
                    _e("Supino inclinado com halteres", 3, "10-12", 90),
                    _e("Elevação pélvica (hip thrust)", 3, "10-12", 90),
                    _e("Elevação lateral com halteres", 3, "12-15", 60),
                    _e("Panturrilha em pé", 3, "12-15", 45),
                ],
            ),
        ],
    ),
    Program(
        key="abc",
        name="ABC clássico",
        level="intermediário",
        days_per_week="3 a 6 dias",
        goal="Hipertrofia com divisão por grupos musculares",
        description=(
            "A divisão mais popular das academias brasileiras: empurrar, puxar e pernas "
            "em três treinos. Faça em sequência e repita."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Peito, ombros e tríceps",
                [
                    _e("Supino reto com barra", 4, "8-10", 120),
                    _e("Supino inclinado com halteres", 3, "10-12", 90),
                    _e("Crucifixo na máquina (peck deck)", 3, "12", 60),
                    _e("Desenvolvimento com halteres", 3, "10", 90),
                    _e("Elevação lateral com halteres", 3, "12-15", 60),
                    _e("Tríceps na polia (corda)", 3, "12", 60),
                    _e("Tríceps francês", 3, "10-12", 60),
                ],
            ),
            ProgramSplit(
                "B",
                "Costas e bíceps",
                [
                    _e("Barra fixa", 4, "6-10", 120),
                    _e("Remada curvada com barra", 4, "8-10", 90),
                    _e("Puxada frontal na polia", 3, "10-12", 90),
                    _e("Remada unilateral com halter", 3, "10", 75),
                    _e("Face pull", 3, "15", 60),
                    _e("Rosca direta com barra", 3, "10", 60),
                    _e("Rosca martelo", 3, "12", 60),
                ],
            ),
            ProgramSplit(
                "C",
                "Pernas",
                [
                    _e("Agachamento livre", 4, "6-8", 150),
                    _e("Leg press 45°", 3, "10-12", 120),
                    _e("Cadeira extensora", 3, "12-15", 60),
                    _e("Mesa flexora", 3, "10-12", 60),
                    _e("Stiff com barra", 3, "10", 90),
                    _e("Panturrilha em pé", 4, "12-15", 45),
                ],
            ),
        ],
    ),
    Program(
        key="empurrar-puxar-pernas",
        name="Empurrar, puxar e pernas",
        level="intermediário",
        days_per_week="3 ou 6 dias",
        goal="Força e hipertrofia com movimentos compostos",
        description=(
            "Organiza o treino pelo padrão de movimento. Cada dia começa com um básico "
            "pesado (supino, terra ou agachamento) e termina com acessórios."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Empurrar",
                [
                    _e("Supino reto com barra", 4, "6-8", 150),
                    _e("Desenvolvimento com barra", 3, "8-10", 120),
                    _e("Supino inclinado com halteres", 3, "10", 90),
                    _e("Elevação lateral na polia", 3, "15", 60),
                    _e("Tríceps testa", 3, "10", 75),
                    _e("Tríceps na polia (barra)", 3, "12", 60),
                ],
            ),
            ProgramSplit(
                "B",
                "Puxar",
                [
                    _e("Levantamento terra", 3, "5", 180),
                    _e("Barra fixa", 3, "8", 120),
                    _e("Remada cavalinho", 3, "10", 90),
                    _e("Pulldown com braços estendidos", 3, "12", 60),
                    _e("Crucifixo invertido", 3, "15", 60),
                    _e("Rosca Scott", 3, "10", 60),
                    _e("Rosca inclinada com halteres", 3, "12", 60),
                ],
            ),
            ProgramSplit(
                "C",
                "Pernas",
                [
                    _e("Agachamento livre", 4, "6-8", 150),
                    _e("Levantamento terra romeno", 3, "8-10", 120),
                    _e("Agachamento búlgaro", 3, "10", 90),
                    _e("Cadeira flexora", 3, "12", 60),
                    _e("Cadeira abdutora", 3, "15", 45),
                    _e("Panturrilha sentado", 4, "15", 45),
                ],
            ),
        ],
    ),
    Program(
        key="superior-inferior",
        name="Superior e inferior",
        level="intermediário",
        days_per_week="4 dias",
        goal="Cada músculo treinado duas vezes por semana",
        description=(
            "Dois dias pesados (força) e dois dias de volume. Sugestão: segunda A, "
            "terça B, quinta C, sexta D."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Superior: força",
                [
                    _e("Supino reto com barra", 4, "5-6", 150),
                    _e("Remada curvada com barra", 4, "6-8", 120),
                    _e("Desenvolvimento com halteres", 3, "8", 90),
                    _e("Puxada com triângulo", 3, "10", 90),
                    _e("Rosca alternada com halteres", 2, "12", 60),
                    _e("Tríceps na polia (corda)", 2, "12", 60),
                ],
            ),
            ProgramSplit(
                "B",
                "Inferior: força",
                [
                    _e("Agachamento livre", 4, "5-6", 180),
                    _e("Levantamento terra romeno", 3, "8", 120),
                    _e("Leg press 45°", 3, "10", 120),
                    _e("Mesa flexora", 3, "10", 60),
                    _e("Panturrilha em pé", 4, "12", 45),
                ],
            ),
            ProgramSplit(
                "C",
                "Superior: volume",
                [
                    _e("Supino inclinado com halteres", 4, "10", 90),
                    _e("Remada baixa na polia", 4, "10", 90),
                    _e("Elevação lateral com halteres", 4, "15", 60),
                    _e("Crossover na polia", 3, "12-15", 60),
                    _e("Face pull", 3, "15", 60),
                    _e("Rosca direta com barra W", 3, "12", 60),
                    _e("Tríceps francês", 3, "12", 60),
                ],
            ),
            ProgramSplit(
                "D",
                "Inferior: volume",
                [
                    _e("Hack squat", 4, "10", 120),
                    _e("Elevação pélvica (hip thrust)", 4, "10", 90),
                    _e("Afundo com halteres", 3, "12", 90),
                    _e("Cadeira extensora", 3, "15", 60),
                    _e("Cadeira flexora", 3, "15", 60),
                    _e("Abdominal na polia", 3, "15", 45),
                ],
            ),
        ],
    ),
    Program(
        key="abcde",
        name="ABCDE",
        level="avançado",
        days_per_week="5 dias",
        goal="Volume alto por grupo muscular",
        description=(
            "Um grupo muscular por dia, com bastante volume. Indicado para quem já treina "
            "há mais de um ano e se recupera bem."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Peito",
                [
                    _e("Supino reto com barra", 4, "6-8", 150),
                    _e("Supino inclinado com barra", 4, "8-10", 120),
                    _e("Supino reto com halteres", 3, "10", 90),
                    _e("Crucifixo com halteres", 3, "12", 60),
                    _e("Crossover na polia", 3, "15", 60),
                    _e("Paralelas (peito)", 3, "8-12", 90),
                ],
            ),
            ProgramSplit(
                "B",
                "Costas",
                [
                    _e("Levantamento terra", 4, "5", 180),
                    _e("Barra fixa", 4, "8", 120),
                    _e("Remada curvada com barra", 4, "8-10", 90),
                    _e("Puxada frontal na polia", 3, "10-12", 90),
                    _e("Remada na máquina", 3, "12", 75),
                    _e("Pulldown com braços estendidos", 3, "15", 60),
                ],
            ),
            ProgramSplit(
                "C",
                "Pernas",
                [
                    _e("Agachamento livre", 5, "5", 180),
                    _e("Leg press 45°", 4, "10", 120),
                    _e("Cadeira extensora", 4, "12", 60),
                    _e("Mesa flexora", 4, "10", 60),
                    _e("Agachamento búlgaro", 3, "10", 90),
                    _e("Panturrilha em pé", 5, "12", 45),
                ],
            ),
            ProgramSplit(
                "D",
                "Ombros e abdômen",
                [
                    _e("Desenvolvimento com barra", 4, "6-8", 120),
                    _e("Elevação lateral com halteres", 4, "12-15", 60),
                    _e("Elevação frontal", 3, "12", 60),
                    _e("Crucifixo invertido", 3, "15", 60),
                    _e("Encolhimento com halteres", 4, "12", 60),
                    _e("Elevação de pernas na barra", 3, "12", 60),
                    _e("Abdominal oblíquo", 3, "15", 45),
                ],
            ),
            ProgramSplit(
                "E",
                "Braços",
                [
                    _e("Rosca direta com barra", 4, "8-10", 75),
                    _e("Supino fechado", 4, "8-10", 90),
                    _e("Rosca Scott", 3, "10", 60),
                    _e("Tríceps testa", 3, "10", 60),
                    _e("Rosca martelo", 3, "12", 60),
                    _e("Tríceps na polia (corda)", 3, "12", 60),
                    _e("Rosca de punho", 3, "15", 45),
                ],
            ),
        ],
    ),
    Program(
        key="pernas-e-gluteos",
        name="Pernas e glúteos em foco",
        level="intermediário",
        days_per_week="3 dias",
        goal="Prioridade para membros inferiores",
        description=(
            "Dois dias para pernas e glúteos (um com foco em quadríceps, outro em posterior) "
            "e um dia de superiores para manter o equilíbrio."
        ),
        splits=[
            ProgramSplit(
                "A",
                "Quadríceps",
                [
                    _e("Agachamento livre", 4, "8", 150),
                    _e("Leg press 45°", 4, "10-12", 120),
                    _e("Agachamento búlgaro", 3, "10", 90),
                    _e("Cadeira extensora", 3, "15", 60),
                    _e("Cadeira adutora", 3, "15", 45),
                    _e("Panturrilha em pé", 4, "15", 45),
                ],
            ),
            ProgramSplit(
                "B",
                "Superiores",
                [
                    _e("Supino reto com halteres", 3, "10", 90),
                    _e("Puxada frontal na polia", 3, "10", 90),
                    _e("Desenvolvimento na máquina", 3, "12", 75),
                    _e("Remada baixa na polia", 3, "12", 75),
                    _e("Elevação lateral com halteres", 3, "15", 60),
                    _e("Abdominal supra", 3, "20", 45),
                ],
            ),
            ProgramSplit(
                "C",
                "Posterior e glúteos",
                [
                    _e("Elevação pélvica (hip thrust)", 4, "8-10", 120),
                    _e("Levantamento terra romeno", 4, "8-10", 120),
                    _e("Mesa flexora", 3, "12", 60),
                    _e("Glúteo na polia", 3, "12-15", 60),
                    _e("Cadeira abdutora", 4, "15", 45),
                    _e("Coice na máquina", 3, "15", 45),
                ],
            ),
        ],
    ),
]

PROGRAMS_BY_KEY = {p.key: p for p in PROGRAMS}
