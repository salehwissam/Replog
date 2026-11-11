from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.validators import PASSWORD_MAX, clean_name, validate_password, validate_timezone


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_max_length=2000)


class EmailField(StrictModel):
    email: EmailStr = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class NewPasswordFields(StrictModel):
    password: str = Field(max_length=PASSWORD_MAX)
    password_confirm: str = Field(max_length=PASSWORD_MAX)

    def _check_new_password(self, email: str | None = None) -> None:
        validate_password(self.password, email=email)
        if self.password != self.password_confirm:
            raise ValueError("As senhas não conferem.")


class RegisterIn(EmailField, NewPasswordFields):
    name: str = Field(min_length=2, max_length=80)
    timezone: str = Field(default="UTC", max_length=64)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return clean_name(v)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        return validate_timezone(v)

    @model_validator(mode="after")
    def _passwords(self) -> Self:
        self._check_new_password(email=self.email)
        return self


class LoginIn(EmailField):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)
    timezone: str | None = Field(default=None, max_length=64)


class EmailIn(EmailField):
    pass


class TokenIn(StrictModel):
    token: str = Field(min_length=20, max_length=128)


class VerifyEmailIn(TokenIn):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


class ResetPasswordIn(NewPasswordFields):
    token: str = Field(min_length=20, max_length=128)

    @model_validator(mode="after")
    def _passwords(self) -> Self:
        self._check_new_password()
        return self


class ChangePasswordIn(NewPasswordFields):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX)

    @model_validator(mode="after")
    def _passwords(self) -> Self:
        self._check_new_password()
        if self.password == self.current_password:
            raise ValueError("A nova senha deve ser diferente da atual.")
        return self


class UpdateProfileIn(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return clean_name(v) if v is not None else None

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        return validate_timezone(v) if v is not None else None


class DeleteAccountIn(StrictModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    timezone: str
    role: str
    created_at: datetime


class MessageOut(BaseModel):
    mensagem: str
