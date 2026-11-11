from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1c3e5f7b9d2'
down_revision: Union[str, Sequence[str], None] = '6eaeeff674ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('intensity', sa.String(length=16), server_default='normal', nullable=False)
        )
        batch_op.create_check_constraint(
            op.f('ck_workout_sessions_intensity_valid'),
            "intensity IN ('normal', 'pesado', 'leve')",
        )


def downgrade() -> None:
    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_workout_sessions_intensity_valid'), type_='check')
        batch_op.drop_column('intensity')
