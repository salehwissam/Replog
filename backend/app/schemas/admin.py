from datetime import datetime

from pydantic import BaseModel

from app.schemas.auth import StrictModel


class AdminStatsOut(BaseModel):
    users_total: int
    users_verified: int
    users_inactive: int
    users_active_7d: int
    new_users_7d: int
    workouts_total: int
    workouts_7d: int
    sets_total: int


class AdminUserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_seen_at: datetime | None
    workouts: int


class AdminUserPage(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class AdminUserUpdateIn(StrictModel):
    is_active: bool
