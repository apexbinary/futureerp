"""Reference-data (enum/choice) registry for the control plane. See erp-server's for the pattern."""
from control_plane.identity.models import PlatformUser


def _choices(choices) -> list[dict]:
    return [{"value": v, "label": lbl} for v, lbl in choices]


def registry() -> dict[str, list[dict]]:
    return {
        "platform_user_role": _choices(PlatformUser.Role.choices),
    }
