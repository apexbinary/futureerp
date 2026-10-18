from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.finance.models import JournalEntry, JournalEntryLine
from erp_server.rbac.permissions import HasTenant

from ..models import CostCenter
from .serializers import CostCenterSerializer

ZERO = Decimal("0.00")


class CostCenterViewSet(ArchiveViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.co"
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer

    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class CostCenterReportView(APIView):
    """Net posted spend per cost center (debits − credits on tagged lines)."""
    permission_classes = [IsAuthenticated, HasTenant]

    def get(self, request):
        tenant = request.user.tenant
        lines = JournalEntryLine.objects.filter(
            tenant=tenant, cost_center__isnull=False,
            journal_entry__status__in=[JournalEntry.Status.POSTED, JournalEntry.Status.REVERSED],
        )
        agg = lines.values("cost_center", "cost_center__code", "cost_center__name").annotate(
            d=Sum("amount", filter=Q(debit_credit="D")),
            c=Sum("amount", filter=Q(debit_credit="C")),
        )
        rows, total = [], ZERO
        for r in agg:
            net = (r["d"] or ZERO) - (r["c"] or ZERO)
            rows.append({"cost_center": r["cost_center"], "code": r["cost_center__code"],
                         "name": r["cost_center__name"], "amount": str(net)})
            total += net
        rows.sort(key=lambda x: x["code"])
        return Response({"rows": rows, "total": str(total)})
