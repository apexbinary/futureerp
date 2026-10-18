"""
Dynamic SMTP.

- SmtpConfig: a user-created mail account (host/port/creds/tls/ssl/sender + a send limit).
- EmailModule: catalog of features that can send email (seeded, not user-creatable) —
  each is bound to a default SmtpConfig via `default_smtp`.
- SmtpLog: one row per send attempt (audit + usage counting against the limit).

Everything is tenant-scoped.
"""
import uuid

from django.db import models


class SmtpConfig(models.Model):
    class LimitPeriod(models.TextChoices):
        DAY = "day", "Per day"
        MONTH = "month", "Per month"
        TOTAL = "total", "Total"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="smtp_configs")

    label = models.CharField(max_length=96)                 # "Primary Gmail"
    sender_name = models.CharField(max_length=96)           # display label / From name
    sender_email = models.EmailField()                      # From address
    host = models.CharField(max_length=128)                 # smtp.gmail.com
    port = models.PositiveIntegerField(default=587)
    username = models.CharField(max_length=255)             # login (often == sender_email)
    password = models.CharField(max_length=255)             # write-only via API; encrypt-at-rest TODO
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)

    send_limit = models.PositiveIntegerField(null=True, blank=True)  # null = unlimited
    # Default DAY: the quota resets every calendar day at local midnight.
    limit_period = models.CharField(max_length=8, choices=LimitPeriod.choices, default=LimitPeriod.DAY)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "smtp_config"
        ordering = ["label"]

    def __str__(self) -> str:
        return f"{self.label} <{self.sender_email}>"


class EmailModule(models.Model):
    """A feature that sends email (e.g. user invite). Seeded; bound to a default SmtpConfig."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="email_modules")
    key = models.SlugField(max_length=96)                   # identity.user_invite
    name = models.CharField(max_length=96)                  # "User invitation"
    description = models.CharField(max_length=200, blank=True)
    default_smtp = models.ForeignKey(
        SmtpConfig, null=True, blank=True, on_delete=models.SET_NULL, related_name="modules"
    )

    class Meta:
        db_table = "smtp_email_module"
        ordering = ["name"]
        unique_together = [("tenant", "key")]

    def __str__(self) -> str:
        return self.name


class SmtpLog(models.Model):
    class Status(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        BLOCKED = "blocked", "Blocked (limit reached)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey("identity.Tenant", on_delete=models.CASCADE, related_name="smtp_logs")
    smtp = models.ForeignKey(SmtpConfig, null=True, on_delete=models.SET_NULL, related_name="logs")
    smtp_label = models.CharField(max_length=96, blank=True)   # snapshot (survives config deletion)
    module_key = models.CharField(max_length=96, blank=True)
    to_email = models.EmailField()
    subject = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "smtp_log"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.to_email} [{self.status}]"
