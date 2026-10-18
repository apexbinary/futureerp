from django.apps import AppConfig


class CommsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.comms"
    label = "comms"
    verbose_name = "Communications (SMTP)"
