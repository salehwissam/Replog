from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '6eaeeff674ee'
down_revision: Union[str, Sequence[str], None] = '4e8eb19ddd9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('set_type', sa.String(length=16), server_default='normal', nullable=False))
        batch_op.add_column(sa.Column('rpe', sa.Numeric(precision=3, scale=1), nullable=True))
        batch_op.create_check_constraint(
            op.f('ck_workout_sets_set_type_valid'),
            "set_type IN ('normal', 'aquecimento', 'drop', 'falha')",
        )
        batch_op.create_check_constraint(
            op.f('ck_workout_sets_rpe_range'),
            'rpe IS NULL OR (rpe >= 1 AND rpe <= 10)',
        )


def downgrade() -> None:
    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_workout_sets_rpe_range'), type_='check')
        batch_op.drop_constraint(op.f('ck_workout_sets_set_type_valid'), type_='check')
        batch_op.drop_column('rpe')
        batch_op.drop_column('set_type')
