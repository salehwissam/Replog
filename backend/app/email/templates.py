from dataclasses import dataclass
from html import escape


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


def _layout(title: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f2f1ed;font-family:Arial,sans-serif;color:#1d2024">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:22px;font-weight:800;letter-spacing:1px">REPLOG</p>
<h1 style="margin:0 0 16px;font-size:20px">{escape(title)}</h1>
{body_html}
<p style="margin:32px 0 0;font-size:12px;color:#5b616a">Registre cada repetição. Supere cada recorde.</p>
</td></tr></table></td></tr></table></body></html>"""


def _button(url: str, label: str) -> str:
    return (
        f'<p style="margin:24px 0"><a href="{escape(url, quote=True)}" '
        'style="background:#2a66c9;color:#ffffff;padding:12px 20px;border-radius:8px;'
        f'text-decoration:none;font-weight:600;display:inline-block">{escape(label)}</a></p>'
        f'<p style="font-size:12px;color:#5b616a;word-break:break-all">'
        f"Se o botão não funcionar, copie este endereço no navegador:<br>{escape(url)}</p>"
    )


def verify_email(to: str, url: str, hours: int) -> EmailMessage:
    subject = "Confirme seu e-mail no REPLOG"
    text = (
        f"Olá!\n\nPara ativar sua conta no REPLOG, acesse o link abaixo:\n{url}\n\n"
        f"O link expira em {hours} horas. Se você não criou esta conta, ignore este e-mail."
    )
    html = _layout(
        "Confirme seu e-mail",
        "<p>Olá!</p><p>Falta pouco para começar a registrar seus treinos.</p>"
        + _button(url, "Confirmar e-mail")
        + f"<p style='font-size:14px'>O link expira em {hours} horas. "
        "Se você não criou esta conta, ignore este e-mail.</p>",
    )
    return EmailMessage(to, subject, text, html)


def account_exists(to: str, name: str, login_url: str, reset_url: str) -> EmailMessage:
    subject = "Tentativa de cadastro no REPLOG"
    text = (
        f"Olá, {name}!\n\nAlguém tentou criar uma conta no REPLOG com este e-mail, "
        f"mas você já tem uma conta.\n\nEntrar: {login_url}\nEsqueceu a senha? {reset_url}\n\n"
        "Se não foi você, pode ignorar este e-mail com segurança."
    )
    html = _layout(
        "Você já tem uma conta",
        f"<p>Olá, {escape(name)}!</p><p>Alguém tentou criar uma conta no REPLOG com este "
        "e-mail, mas ele já está cadastrado.</p>"
        + _button(login_url, "Entrar no REPLOG")
        + f"<p style='font-size:14px'>Esqueceu a senha? "
        f"<a href='{escape(reset_url, quote=True)}'>Redefina aqui</a>.</p>"
        "<p style='font-size:14px'>Se não foi você, pode ignorar este e-mail com segurança.</p>",
    )
    return EmailMessage(to, subject, text, html)


def reset_password(to: str, name: str, url: str, minutes: int) -> EmailMessage:
    subject = "Redefinição de senha do REPLOG"
    text = (
        f"Olá, {name}!\n\nRecebemos um pedido para redefinir sua senha. Acesse:\n{url}\n\n"
        f"O link expira em {minutes} minutos e só pode ser usado uma vez. "
        "Se você não pediu, ignore este e-mail: sua senha continua a mesma."
    )
    html = _layout(
        "Redefinir senha",
        f"<p>Olá, {escape(name)}!</p><p>Recebemos um pedido para redefinir sua senha.</p>"
        + _button(url, "Criar nova senha")
        + f"<p style='font-size:14px'>O link expira em {minutes} minutos e só pode ser usado "
        "uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.</p>",
    )
    return EmailMessage(to, subject, text, html)


def password_changed(to: str, name: str, reset_url: str) -> EmailMessage:
    subject = "Sua senha do REPLOG foi alterada"
    text = (
        f"Olá, {name}!\n\nA senha da sua conta foi alterada e as outras sessões foram "
        f"encerradas.\n\nSe não foi você, redefina a senha agora: {reset_url}"
    )
    html = _layout(
        "Senha alterada",
        f"<p>Olá, {escape(name)}!</p><p>A senha da sua conta foi alterada e as outras sessões "
        "foram encerradas.</p><p>Se não foi você, redefina a senha agora:</p>"
        + _button(reset_url, "Redefinir senha"),
    )
    return EmailMessage(to, subject, text, html)
