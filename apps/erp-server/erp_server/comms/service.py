"""
Email sending service — builds a Django SMTP connection dynamically from an SmtpConfig,
enforces the per-config send limit, and writes an SmtpLog row for every attempt.
"""
from django.core.mail import EmailMessage, get_connection
from django.utils import timezone

from .models import SmtpConfig, SmtpLog


def verify_connection(
    *, host: str, port: int, username: str, password: str, use_tls: bool, use_ssl: bool
) -> tuple[bool, str]:
    """Open + authenticate an SMTP connection WITHOUT sending. Returns (ok, error)."""
    try:
        conn = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=host, port=port, username=username, password=password,
            use_tls=use_tls, use_ssl=use_ssl, fail_silently=False, timeout=15,
        )
        conn.open()   # performs the TLS/SSL handshake + LOGIN
        conn.close()
        return True, ""
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)[:500]


def usage_count(config: SmtpConfig) -> int:
    """
    Successful sends counted against the config's current limit window.
    DAY resets at local midnight (calendar day); MONTH resets on the 1st (calendar month);
    TOTAL is all-time. Counting is per-day from the SmtpLog rows.
    """
    qs = SmtpLog.objects.filter(smtp=config, status=SmtpLog.Status.SENT)
    today = timezone.localdate()
    if config.limit_period == SmtpConfig.LimitPeriod.DAY:
        qs = qs.filter(created_at__date=today)                       # resets daily at midnight
    elif config.limit_period == SmtpConfig.LimitPeriod.MONTH:
        qs = qs.filter(created_at__year=today.year, created_at__month=today.month)
    return qs.count()


def limit_reached(config: SmtpConfig) -> bool:
    if config.send_limit is None:
        return False
    return usage_count(config) >= config.send_limit


def send_email(
    *, config: SmtpConfig, to_email: str, subject: str, body: str, module_key: str = ""
) -> SmtpLog:
    """Send via `config`, logging the outcome. Never raises — returns the SmtpLog."""
    log = SmtpLog(
        tenant=config.tenant, smtp=config, smtp_label=config.label,
        module_key=module_key, to_email=to_email, subject=subject,
    )

    if not config.is_active:
        log.status = SmtpLog.Status.BLOCKED
        log.error = "SMTP config is inactive."
        log.save()
        return log

    if limit_reached(config):
        log.status = SmtpLog.Status.BLOCKED
        log.error = f"Send limit reached ({config.send_limit} {config.limit_period})."
        log.save()
        return log

    try:
        connection = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=config.host, port=config.port,
            username=config.username, password=config.password,
            use_tls=config.use_tls, use_ssl=config.use_ssl,
            fail_silently=False, timeout=15,
        )
        msg = EmailMessage(
            subject=subject, body=body,
            from_email=f'"{config.sender_name}" <{config.sender_email}>',
            to=[to_email], connection=connection,
        )
        msg.send(fail_silently=False)
        log.status = SmtpLog.Status.SENT
    except Exception as exc:  # noqa: BLE001 — record any transport error
        log.status = SmtpLog.Status.FAILED
        log.error = str(exc)[:2000]

    log.save()
    return log
