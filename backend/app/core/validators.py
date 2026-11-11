import unicodedata
from functools import lru_cache
from zoneinfo import available_timezones

_COMMON_PASSWORDS = {
    "1234567890",
    "12345678910",
    "0123456789",
    "1234512345",
    "1q2w3e4r5t",
    "qwertyuiop",
    "password123",
    "password1234",
    "senha12345",
    "senha123456",
    "mudar12345",
    "abc1234567",
    "abcdefghij",
    "iloveyou12",
    "123456789a",
    "a123456789",
    "qwerty1234",
    "1qaz2wsx3edc",
    "asdfghjkl1",
    "brasil1234",
    "flamengo123",
    "corinthians",
    "palmeiras123",
    "academia123",
    "replog1234",
    "minhasenha",
    "minhasenha1",
    "senhasenha",
    "passwordpassword",
    "aaaaaaaaaa",
    "1111111111",
    "0000000000",
    "9876543210",
    "trocarsenha",
    "admin12345",
    "administrador",
    "qwerty12345",
    "senhaforte",
    "senhaforte1",
}

PASSWORD_MIN = 10
PASSWORD_MAX = 128


@lru_cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def validate_timezone(value: str) -> str:
    value = value.strip()
    if value not in _timezones():
        raise ValueError("Fuso horário inválido.")
    return value


def validate_password(password: str, *, email: str | None = None) -> str:
    if len(password) < PASSWORD_MIN:
        raise ValueError(f"A senha deve ter pelo menos {PASSWORD_MIN} caracteres.")
    if len(password) > PASSWORD_MAX:
        raise ValueError(f"A senha deve ter no máximo {PASSWORD_MAX} caracteres.")
    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS or len(set(lowered)) <= 2:
        raise ValueError("Essa senha é muito comum. Escolha outra.")
    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local in lowered:
            raise ValueError("A senha não pode conter seu e-mail.")
    return password


def clean_text(
    value: str, *, field: str = "Texto", min_length: int = 1, multiline: bool = False
) -> str:
    value = unicodedata.normalize("NFC", value)
    allowed = "\n" if multiline else ""
    value = "".join(
        ch if unicodedata.category(ch)[0] != "C" or ch in allowed else " " for ch in value
    )
    if multiline:
        value = "\n".join(" ".join(line.split()) for line in value.strip().splitlines())
    else:
        value = " ".join(value.split())
    if not value:
        raise ValueError(f"{field} não pode ficar vazio.")
    if len(value) < min_length:
        raise ValueError(f"{field} muito curto.")
    return value


def clean_name(value: str) -> str:
    return " ".join(clean_text(value, field="Nome", min_length=2).split())
