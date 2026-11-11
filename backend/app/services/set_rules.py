from collections.abc import Iterable
from typing import Protocol

from app.models.workout import SET_TYPES, WARMUP_SET_TYPE

__all__ = ["SET_TYPES", "WARMUP_SET_TYPE", "is_working_set", "working_sets"]


class _HasSetType(Protocol):
    @property
    def set_type(self) -> str: ...


def is_working_set(s: _HasSetType) -> bool:
    return s.set_type != WARMUP_SET_TYPE


def working_sets[T: _HasSetType](sets: Iterable[T]) -> list[T]:
    return [s for s in sets if is_working_set(s)]
