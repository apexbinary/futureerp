from django.apps import AppConfig


class RbacConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "erp_server.rbac"
    label = "rbac"
    verbose_name = "RBAC"
