from django.apps import AppConfig


class FinanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.finance"
    label = "finance"
    verbose_name = "Finance (FI)"
