"""Utility endpoints shared across the app (not tenant data)."""
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .date_ranges import all_presets, resolve, PRESETS
from .options import registry


@extend_schema(tags=["Utilities"])
class DatePresetsView(APIView):
    """GET /api/util/date-presets/ → all presets resolved to concrete from/to (today-relative)."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response({"today": timezone.localdate().isoformat(), "presets": all_presets(timezone.localdate())})


@extend_schema(tags=["Utilities"])
class DateRangeView(APIView):
    """GET /api/util/date-range/?preset=last_7_days → {key,label,from,to} for one preset."""
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        key = request.query_params.get("preset", "")
        today = timezone.localdate()
        rng = resolve(key, today)
        if not rng:
            return Response({"detail": f"Unknown preset '{key}'.", "available": list(PRESETS)}, status=400)
        return Response({"key": key, "label": PRESETS[key], "from": rng[0].isoformat(), "to": rng[1].isoformat()})


@extend_schema(tags=["Utilities"])
class OptionsView(APIView):
    """
    GET /api/util/options/            → all option sets
    GET /api/util/options/?set=user_status → just that set
    Reference data for dropdowns (statuses, periods, …). FE caches these ~1h.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        reg = registry()
        key = request.query_params.get("set")
        if key:
            if key not in reg:
                return Response({"detail": f"Unknown option set '{key}'.", "available": list(reg)}, status=400)
            return Response({"set": key, "options": reg[key]})
        return Response(reg)
