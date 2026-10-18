"""Public health-check endpoint (no auth)."""
from django.http import HttpRequest, JsonResponse


def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok", "service": "erp-server"})
