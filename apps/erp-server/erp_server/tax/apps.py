from django.apps import AppConfig


class TaxConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.tax"
    label = "tax"
    verbose_name = "Tax Engine"
