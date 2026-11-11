from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4e8eb19ddd9c'
down_revision: Union[str, Sequence[str], None] = 'e3cfb291f139'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.alter_column('value',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               type_=sa.Numeric(precision=14, scale=2),
               existing_nullable=False)
        batch_op.alter_column('previous_value',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               type_=sa.Numeric(precision=14, scale=2),
               existing_nullable=True)

    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.create_index('uq_workout_sessions_one_active', ['user_id'], unique=True, sqlite_where=sa.text('finished_at IS NULL'), postgresql_where=sa.text('finished_at IS NULL'))

    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_workout_sets_number', ['session_id', 'exercise_id', 'set_number'])


def downgrade() -> None:
    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.drop_constraint('uq_workout_sets_number', type_='unique')

    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.drop_index('uq_workout_sessions_one_active', sqlite_where=sa.text('finished_at IS NULL'), postgresql_where=sa.text('finished_at IS NULL'))

    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.alter_column('previous_value',
               existing_type=sa.Numeric(precision=14, scale=2),
               type_=sa.NUMERIC(precision=10, scale=2),
               existing_nullable=True)
        batch_op.alter_column('value',
               existing_type=sa.Numeric(precision=14, scale=2),
               type_=sa.NUMERIC(precision=10, scale=2),
               existing_nullable=False)

