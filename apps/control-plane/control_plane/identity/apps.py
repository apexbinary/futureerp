from django.apps import AppConfig


class IdentityConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "control_plane.identity"
    label = "identity"
    verbose_name = "Platform Identity"
