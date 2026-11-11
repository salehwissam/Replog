from datetime import date, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models import PersonalRecord, User
from app.repositories.workouts import ExerciseRepository, RecordRepository, WorkoutRepository
from app.schemas.workout import (
    CalendarOut,
    DashboardOut,
    ExerciseRecordsOut,
    ProgressPoint,
    RecordOut,
    VolumeBucket,
    WeekSession,
)
from app.services.catalog import exercise_out
from app.services.records import RECORD_TYPES, set_volume
from app.services.set_rules import working_sets
from app.services.workouts import list_item, record_out, summarize

MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


class StatsService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.workouts = WorkoutRepository(db)
        self.records = RecordRepository(db)
        self.exercises = ExerciseRepository(db)

    def today(self) -> date:
        return utcnow().astimezone(ZoneInfo(self.user.timezone or "UTC")).date()

    def buckets(self, period: str, count: int) -> list[VolumeBucket]:
        today = self.today()
        if period == "week":
            starts = [week_start(today) - timedelta(weeks=i) for i in reversed(range(count))]
            end_of = [s + timedelta(days=6) for s in starts]
        else:
            first = month_start(today)
            starts = [add_months(first, -i) for i in reversed(range(count))]
            end_of = [add_months(s, 1) - timedelta(days=1) for s in starts]

        sessions = self.workouts.sessions_between(self.user.id, starts[0], end_of[-1])
        result: list[VolumeBucket] = []
        for start, end in zip(starts, end_of, strict=True):
            in_bucket = [s for s in sessions if start <= s.local_date <= end]
            volume = sum(
                (
                    set_volume(Decimal(st.weight_kg), st.reps)
                    for sess in in_bucket
                    for st in working_sets(sess.sets)
                ),
                Decimal(0),
            )
            label = (
                f"{start.day:02d}/{start.month:02d}"
                if period == "week"
                else f"{MONTHS[start.month - 1]}/{str(start.year)[2:]}"
            )
            result.append(
                VolumeBucket(
                    start=start,
                    label=label,
                    volume_kg=float(volume),
                    workouts=len(in_bucket),
                    sets=sum(len(working_sets(s.sets)) for s in in_bucket),
                )
            )
        return result

    def streak_weeks(self) -> int:
        weeks = {week_start(d) for d in self.workouts.session_dates(self.user.id)}
        current = week_start(self.today())
        if current not in weeks:
            current -= timedelta(weeks=1)
        streak = 0
        while current in weeks:
            streak += 1
            current -= timedelta(weeks=1)
        return streak

    def calendar(self, year: int, month: int) -> CalendarOut:
        start = date(year, month, 1)
        end = add_months(start, 1) - timedelta(days=1)
        sessions = self.workouts.sessions_between(self.user.id, start, end)
        days = sorted({s.local_date for s in sessions})
        return CalendarOut(month=f"{year:04d}-{month:02d}", days=days)

    def dashboard(self) -> DashboardOut:
        weekly = self.buckets("week", 8)
        this_week = weekly[-1]
        items, total = self.workouts.list_sessions(self.user.id, limit=1)
        last = items[0] if items else None
        active = self.workouts.get_active(self.user.id)
        counts = self.records.count_by_session(self.user.id, [last.id] if last else [])
        week = self.workouts.sessions_between(self.user.id, this_week.start, self.today())
        return DashboardOut(
            week_sessions=[
                WeekSession(
                    id=s.id,
                    local_date=s.local_date,
                    split_letter=s.split.letter if s.split else None,
                    finished=s.finished_at is not None,
                )
                for s in week
            ],
            week_workouts=this_week.workouts,
            week_volume_kg=this_week.volume_kg,
            week_sets=this_week.sets,
            total_workouts=total,
            streak_weeks=self.streak_weeks(),
            last_session=list_item(last, counts.get(last.id, 0)) if last else None,
            active_session_id=active.id if active else None,
            recent_records=self.recent_records(6),
            weekly=weekly,
        )

    def records_per_month(self, count: int) -> list[VolumeBucket]:
        tz = ZoneInfo(self.user.timezone or "UTC")
        first = month_start(self.today())
        starts = [add_months(first, -i) for i in reversed(range(count))]
        counts = dict.fromkeys(starts, 0)
        for rec in self.records.all_current(self.user.id):
            if rec.previous_value is None:
                continue
            key = month_start(rec.achieved_at.astimezone(tz).date())
            if key in counts:
                counts[key] += 1
        return [
            VolumeBucket(
                start=s,
                label=f"{MONTHS[s.month - 1]}/{str(s.year)[2:]}",
                volume_kg=0,
                workouts=counts[s],
                sets=0,
            )
            for s in starts
        ]

    def recent_records(self, limit: int) -> list[RecordOut]:
        return [record_out(r) for r in self.records.recent(self.user.id, limit, only_beaten=True)]

    def records_overview(self) -> list[ExerciseRecordsOut]:
        current: dict[int, dict[str, PersonalRecord]] = {}
        for rec in self.records.all_current(self.user.id):
            current.setdefault(rec.exercise_id, {})[rec.record_type] = rec
        out: list[ExerciseRecordsOut] = []
        for by_type in current.values():
            exercise = next(iter(by_type.values())).exercise
            fields = {t: (record_out(by_type[t]) if t in by_type else None) for t in RECORD_TYPES}
            out.append(ExerciseRecordsOut(exercise=exercise_out(exercise), **fields))
        out.sort(key=lambda r: r.exercise.name)
        return out

    def exercise_record_history(self, exercise_id: int) -> list[RecordOut]:
        self._ensure_exercise(exercise_id)
        return [record_out(r) for r in self.records.for_exercise(self.user.id, exercise_id)]

    def exercise_progress(self, exercise_id: int) -> list[ProgressPoint]:
        self._ensure_exercise(exercise_id)
        points: list[ProgressPoint] = []
        for session in self.workouts.sessions_with_exercise(self.user.id, exercise_id):
            summary = summarize([s for s in session.sets if s.exercise_id == exercise_id])
            points.append(
                ProgressPoint(
                    session_id=session.id,
                    local_date=session.local_date,
                    top_weight_kg=summary.top_weight_kg,
                    best_est_1rm=summary.best_est_1rm,
                    volume_kg=summary.volume_kg,
                    total_reps=summary.total_reps,
                )
            )
        return points

    def _ensure_exercise(self, exercise_id: int) -> None:
        if self.exercises.get_visible_including_archived(self.user.id, exercise_id) is None:
            raise NotFoundError("Exercício não encontrado.")
