import logging
import smtplib
import ssl
from email.message import EmailMessage as MimeMessage

from app.core.config import get_settings
from app.core.logging import log_event
from app.email.templates import EmailMessage

logger = logging.getLogger("replog.email")

OUTBOX: list[EmailMessage] = []


def _mime(msg: EmailMessage, sender: str) -> MimeMessage:
    mime = MimeMessage()
    mime["From"] = sender
    mime["To"] = msg.to
    mime["Subject"] = msg.subject
    mime.set_content(msg.text)
    mime.add_alternative(msg.html, subtype="html")
    return mime


def send_email(msg: EmailMessage) -> None:
    settings = get_settings()
    backend = settings.email_backend
    try:
        if backend == "memory":
            OUTBOX.append(msg)
        elif backend == "console":
            logger.info("E-mail (console) para %s: %s\n%s", msg.to, msg.subject, msg.text)
        else:
            mime = _mime(msg, settings.email_from)
            context = ssl.create_default_context()
            smtp: smtplib.SMTP
            if settings.smtp_ssl:
                smtp = smtplib.SMTP_SSL(
                    settings.smtp_host, settings.smtp_port, timeout=15, context=context
                )
            else:
                smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
            with smtp:
                if settings.smtp_starttls and not settings.smtp_ssl:
                    smtp.starttls(context=context)
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(mime)
        log_event(logger, "email_enviado", assunto=msg.subject)
    except (OSError, smtplib.SMTPException) as exc:
        log_event(logger, "falha_envio_email", level=logging.ERROR, tipo=type(exc).__name__)
