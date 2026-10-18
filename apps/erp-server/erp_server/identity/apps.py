from django.apps import AppConfig


class IdentityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.identity"
    label = "identity"
    verbose_name = "Tenant Identity"
