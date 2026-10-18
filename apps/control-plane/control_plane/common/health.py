"""Public health-check endpoint (no auth) for load balancers / uptime checks."""
from django.http import HttpRequest, JsonResponse


def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok", "service": "control-plane"})
