"""
Reference-data (enum/choice) registry. The frontend fetches these instead of
hardcoding option lists, so labels/values stay in one place (the models).

Each set is [{value, label}]. Add a set here → it's instantly available to every
dropdown in the app via /api/util/options/.
"""
from erp_server.comms.models import SmtpConfig, SmtpLog
from erp_server.identity.models import Tenant, User


def _choices(choices) -> list[dict]:
    return [{"value": v, "label": lbl} for v, lbl in choices]


def registry() -> dict[str, list[dict]]:
    return {
        "smtp_log_status": _choices(SmtpLog.Status.choices),
        "smtp_limit_period": _choices(SmtpConfig.LimitPeriod.choices),
        "user_status": _choices(User.Status.choices),
        "user_role": _choices(User.Role.choices),
        "tenant_status": _choices(Tenant.Status.choices),
        "tenant_deployment": _choices(Tenant.Deployment.choices),
    }
