from django.apps import AppConfig


class ApConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.ap"
    label = "ap"
    verbose_name = "Accounts Payable"
