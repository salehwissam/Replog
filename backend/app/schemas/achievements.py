from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Tier = Literal["bronze", "prata", "ouro"]


class AchievementOut(BaseModel):
    key: str
    title: str
    description: str
    icon: str
    tier: Tier
    unlocked: bool
    unlocked_at: datetime | None
    progress: float = Field(ge=0, le=1)
    current: float
    target: float
