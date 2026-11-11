from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3cfb291f139'
down_revision: Union[str, Sequence[str], None] = 'ba8be4cb7991'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('email_tokens', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pending_password_hash', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('pending_name', sa.String(length=80), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('email_tokens', schema=None) as batch_op:
        batch_op.drop_column('pending_name')
        batch_op.drop_column('pending_password_hash')

