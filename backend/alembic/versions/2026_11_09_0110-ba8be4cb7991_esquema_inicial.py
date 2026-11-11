from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ba8be4cb7991'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('login_attempts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('ip', sa.String(length=45), nullable=False),
    sa.Column('success', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_login_attempts'))
    )
    with op.batch_alter_table('login_attempts', schema=None) as batch_op:
        batch_op.create_index('ix_login_attempts_email_created', ['email', 'created_at'], unique=False)
        batch_op.create_index('ix_login_attempts_ip_created', ['ip', 'created_at'], unique=False)

    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users'))
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('email_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('purpose', sa.String(length=32), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_email_tokens_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_email_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_email_tokens_token_hash'))
    )
    with op.batch_alter_table('email_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_email_tokens_user_id'), ['user_id'], unique=False)

    op.create_table('exercises',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('muscle_group', sa.String(length=32), nullable=False),
    sa.Column('equipment', sa.String(length=32), nullable=False),
    sa.Column('is_bodyweight', sa.Boolean(), nullable=False),
    sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_exercises_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_exercises')),
    sa.UniqueConstraint('user_id', 'name', name='uq_exercises_user_name')
    )
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_exercises_user_id'), ['user_id'], unique=False)

    op.create_table('sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('csrf_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ip', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=255), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_sessions_token_hash'))
    )
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sessions_user_id'), ['user_id'], unique=False)

    op.create_table('workout_splits',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('letter', sa.String(length=1), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('description', sa.String(length=280), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("letter IN ('A','B','C','D','E')", name=op.f('ck_workout_splits_letter_valid')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_workout_splits_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_splits')),
    sa.UniqueConstraint('user_id', 'letter', name='uq_workout_splits_user_letter')
    )
    with op.batch_alter_table('workout_splits', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_workout_splits_user_id'), ['user_id'], unique=False)

    op.create_table('split_exercises',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('split_id', sa.Integer(), nullable=False),
    sa.Column('exercise_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('target_sets', sa.Integer(), nullable=False),
    sa.Column('target_reps', sa.String(length=20), nullable=True),
    sa.Column('rest_seconds', sa.Integer(), nullable=False),
    sa.CheckConstraint('rest_seconds BETWEEN 0 AND 1800', name=op.f('ck_split_exercises_rest_range')),
    sa.CheckConstraint('target_sets BETWEEN 1 AND 20', name=op.f('ck_split_exercises_target_sets_range')),
    sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], name=op.f('fk_split_exercises_exercise_id_exercises'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['split_id'], ['workout_splits.id'], name=op.f('fk_split_exercises_split_id_workout_splits'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_split_exercises'))
    )
    with op.batch_alter_table('split_exercises', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_split_exercises_split_id'), ['split_id'], unique=False)

    op.create_table('workout_sessions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('split_id', sa.Integer(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('local_date', sa.Date(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['split_id'], ['workout_splits.id'], name=op.f('fk_workout_sessions_split_id_workout_splits'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_workout_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_sessions'))
    )
    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.create_index('ix_workout_sessions_user_date', ['user_id', 'local_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_workout_sessions_user_id'), ['user_id'], unique=False)

    op.create_table('workout_sets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('session_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('exercise_id', sa.Integer(), nullable=False),
    sa.Column('set_number', sa.Integer(), nullable=False),
    sa.Column('reps', sa.Integer(), nullable=False),
    sa.Column('weight_kg', sa.Numeric(precision=6, scale=2), nullable=False),
    sa.Column('rest_seconds', sa.Integer(), nullable=True),
    sa.Column('notes', sa.String(length=280), nullable=True),
    sa.Column('performed_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('reps BETWEEN 1 AND 1000', name=op.f('ck_workout_sets_reps_range')),
    sa.CheckConstraint('weight_kg >= 0 AND weight_kg <= 1500', name=op.f('ck_workout_sets_weight_range')),
    sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], name=op.f('fk_workout_sets_exercise_id_exercises'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['session_id'], ['workout_sessions.id'], name=op.f('fk_workout_sets_session_id_workout_sessions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_workout_sets_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_workout_sets'))
    )
    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_workout_sets_session_id'), ['session_id'], unique=False)
        batch_op.create_index('ix_workout_sets_user_exercise', ['user_id', 'exercise_id'], unique=False)

    op.create_table('personal_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('exercise_id', sa.Integer(), nullable=False),
    sa.Column('record_type', sa.String(length=32), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('previous_value', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('set_id', sa.Integer(), nullable=True),
    sa.Column('session_id', sa.Integer(), nullable=False),
    sa.Column('achieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], name=op.f('fk_personal_records_exercise_id_exercises'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['session_id'], ['workout_sessions.id'], name=op.f('fk_personal_records_session_id_workout_sessions'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['set_id'], ['workout_sets.id'], name=op.f('fk_personal_records_set_id_workout_sets'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_personal_records_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_personal_records'))
    )
    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.create_index('ix_personal_records_user_achieved', ['user_id', 'achieved_at'], unique=False)
        batch_op.create_index('ix_personal_records_user_exercise_type', ['user_id', 'exercise_id', 'record_type'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('personal_records', schema=None) as batch_op:
        batch_op.drop_index('ix_personal_records_user_exercise_type')
        batch_op.drop_index('ix_personal_records_user_achieved')

    op.drop_table('personal_records')
    with op.batch_alter_table('workout_sets', schema=None) as batch_op:
        batch_op.drop_index('ix_workout_sets_user_exercise')
        batch_op.drop_index(batch_op.f('ix_workout_sets_session_id'))

    op.drop_table('workout_sets')
    with op.batch_alter_table('workout_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_workout_sessions_user_id'))
        batch_op.drop_index('ix_workout_sessions_user_date')

    op.drop_table('workout_sessions')
    with op.batch_alter_table('split_exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_split_exercises_split_id'))

    op.drop_table('split_exercises')
    with op.batch_alter_table('workout_splits', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_workout_splits_user_id'))

    op.drop_table('workout_splits')
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sessions_user_id'))

    op.drop_table('sessions')
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_exercises_user_id'))

    op.drop_table('exercises')
    with op.batch_alter_table('email_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_email_tokens_user_id'))

    op.drop_table('email_tokens')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
    with op.batch_alter_table('login_attempts', schema=None) as batch_op:
        batch_op.drop_index('ix_login_attempts_ip_created')
        batch_op.drop_index('ix_login_attempts_email_created')

    op.drop_table('login_attempts')
