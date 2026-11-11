from typing import Sequence, Union

from alembic import op


revision: str = 'b2d4f6a8c0e1'
down_revision: Union[str, Sequence[str], None] = 'a1c3e5f7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "DELETE FROM personal_records "
        "WHERE record_type IN ('max_set_volume', 'max_session_volume')"
    )


def downgrade() -> None:
    pass
