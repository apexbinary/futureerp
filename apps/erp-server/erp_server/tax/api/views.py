"""
Tax Engine API — tenant-scoped, full CRUD + Archive/Unarchive on config entities.

  • /regimes/{id}/matrix/  GET → slab × location × component grid (for the wizard/config)
                           PUT → bulk-save percentages
  • /preview/              POST → live tax computation
  • every config viewset:  create/update/list + /archive/ + /unarchive/ (+ ?archived=)
"""
from decimal import Decimal

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.rbac.permissions import HasTenant

from ..models import TaxComponent, TaxLocation, TaxRate, TaxRateSlab, TaxRegime
from ..service import preview_tax
from .serializers import (
    TaxComponentSerializer,
    TaxLocationSerializer,
    TaxRateSerializer,
    TaxRateSlabSerializer,
    TaxRegimeSerializer,
)


class _TenantScoped(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.tax"

    def get_queryset(self):
        return self.queryset.filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class TaxRegimeViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = TaxRegime.objects.all()
    serializer_class = TaxRegimeSerializer

    @action(detail=True, methods=["get", "put"])
    def matrix(self, request, pk=None):
        """Grid: slabs × locations × components with percentages.

        GET  → { regime, locations, components, slabs, rates: {"slab|location|component": pct} }
        PUT  → body { entries: [{slab, location, component, percentage}, ...] }
        """
        regime = self.get_object()
        tenant = request.user.tenant

        if request.method == "PUT":
            for e in request.data.get("entries", []):
                pct = e.get("percentage")
                key = dict(tenant=tenant, slab_id=e["slab"], location_id=e["location"], component_id=e["component"])
                if pct in (None, "", "0", 0) and Decimal(str(pct or 0)) == 0:
                    TaxRate.objects.filter(**key).delete()
                else:
                    TaxRate.objects.update_or_create(**key, defaults={"percentage": Decimal(str(pct))})

        active = dict(tenant=tenant, is_archived=False)
        locations = TaxLocation.objects.filter(regime=regime, **active).order_by("sequence", "code")
        components = TaxComponent.objects.filter(regime=regime, **active).order_by("sequence", "code")
        slabs = TaxRateSlab.objects.filter(regime=regime, **active).order_by("sequence", "total_rate")
        rates = TaxRate.objects.filter(tenant=tenant, slab__regime=regime)
        grid = {f"{r.slab_id}|{r.location_id}|{r.component_id}": str(r.percentage) for r in rates}

        return Response({
            "regime": regime.id,
            "locations": TaxLocationSerializer(locations, many=True).data,
            "components": TaxComponentSerializer(components, many=True).data,
            "slabs": TaxRateSlabSerializer(slabs, many=True).data,
            "rates": grid,
        })


class _RegimeScoped(ArchiveViewSetMixin, _TenantScoped):
    def get_queryset(self):
        qs = super().get_queryset()
        regime = self.request.query_params.get("regime")
        return qs.filter(regime_id=regime) if regime else qs


class TaxLocationViewSet(_RegimeScoped):
    queryset = TaxLocation.objects.all()
    serializer_class = TaxLocationSerializer


class TaxComponentViewSet(_RegimeScoped):
    queryset = TaxComponent.objects.select_related("output_account", "input_account").all()
    serializer_class = TaxComponentSerializer


class TaxRateSlabViewSet(_RegimeScoped):
    queryset = TaxRateSlab.objects.all()
    serializer_class = TaxRateSlabSerializer


class TaxRateViewSet(_TenantScoped):
    queryset = TaxRate.objects.select_related("component", "slab", "location").all()
    serializer_class = TaxRateSerializer


class TaxPreviewView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]

    def post(self, request):
        try:
            slab = TaxRateSlab.objects.get(pk=request.data["slab"], tenant=request.user.tenant)
        except (TaxRateSlab.DoesNotExist, KeyError):
            return Response({"detail": "Unknown slab."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(preview_tax(
            slab, request.data.get("supplier_state", ""),
            request.data.get("customer_state", ""), request.data.get("base_amount", 0),
        ))
