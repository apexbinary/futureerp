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

from ..models import CostCenter, ProfitCenter
from .serializers import CostCenterSerializer, ProfitCenterSerializer

ZERO = Decimal("0.00")


class _COScoped(ArchiveViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.co"

    def get_queryset(self):
        return super().get_queryset().filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class CostCenterViewSet(_COScoped):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer


class ProfitCenterViewSet(_COScoped):
    queryset = ProfitCenter.objects.all()
    serializer_class = ProfitCenterSerializer


def _dimension_report(tenant, dim_field):
    """Net posted amount per dimension (debits − credits on tagged lines)."""
    lines = JournalEntryLine.objects.filter(
        tenant=tenant, **{f"{dim_field}__isnull": False},
        journal_entry__status__in=[JournalEntry.Status.POSTED, JournalEntry.Status.REVERSED],
    )
    agg = lines.values(dim_field, f"{dim_field}__code", f"{dim_field}__name").annotate(
        d=Sum("amount", filter=Q(debit_credit="D")),
        c=Sum("amount", filter=Q(debit_credit="C")),
    )
    rows, total = [], ZERO
    for r in agg:
        net = (r["d"] or ZERO) - (r["c"] or ZERO)
        rows.append({"id": r[dim_field], "code": r[f"{dim_field}__code"],
                     "name": r[f"{dim_field}__name"], "amount": str(net)})
        total += net
    rows.sort(key=lambda x: x["code"] or "")
    return {"rows": rows, "total": str(total)}


class CostCenterReportView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]

    def get(self, request):
        return Response(_dimension_report(request.user.tenant, "cost_center"))


class ProfitCenterReportView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]

    def get(self, request):
        return Response(_dimension_report(request.user.tenant, "profit_center"))
