from datetime import date

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.finance.models import CompanyCode
from erp_server.rbac.permissions import HasTenant

from ..models import DepreciationEntry, FixedAsset
from ..service import run_depreciation
from .serializers import DepreciationEntrySerializer, FixedAssetSerializer


class FixedAssetViewSet(ArchiveViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.aa"
    queryset = FixedAsset.objects.all()
    serializer_class = FixedAssetSerializer

    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        asset = self.get_object()
        entries = asset.dep_entries.select_related("journal_entry").all()
        return Response(DepreciationEntrySerializer(entries, many=True).data)


class RunDepreciationView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]

    def post(self, request):
        tenant = request.user.tenant
        cc = CompanyCode.objects.filter(tenant=tenant).first()
        if not cc:
            return Response({"detail": "No company code."}, status=status.HTTP_400_BAD_REQUEST)
        period = request.data.get("period_date")
        try:
            pd = date.fromisoformat(period) if period else date.today()
        except ValueError:
            return Response({"detail": "Bad period_date (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(run_depreciation(tenant, cc, pd))
