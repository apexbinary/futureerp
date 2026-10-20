from datetime import date

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.common.aging import build_aging
from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.rbac.permissions import HasTenant

from ..models import Vendor, VendorBill
from ..service import BillError, post_bill
from .serializers import VendorBillSerializer, VendorSerializer


class _TenantScoped(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.ap"

    def get_queryset(self):
        return self.queryset.filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class VendorViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = Vendor.objects.all()
    serializer_class = VendorSerializer


class VendorBillViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = VendorBill.objects.select_related("vendor", "journal_entry").prefetch_related(
        "lines__taxes", "lines__expense_account"
    ).all()
    serializer_class = VendorBillSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def post_bill(self, request, pk=None):
        bill = self.get_object()
        try:
            bill = post_bill(bill)
        except BillError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(bill).data)

    @action(detail=False, methods=["get"])
    def open_items(self, request):
        """Posted bills with an outstanding balance (optionally ?vendor=)."""
        qs = self.get_queryset().filter(status=VendorBill.Status.POSTED)
        vend = request.query_params.get("vendor")
        if vend:
            qs = qs.filter(vendor_id=vend)
        data = [self.get_serializer(b).data for b in qs if b.outstanding > 0]
        return Response(data)

    @action(detail=False, methods=["get"])
    def aging(self, request):
        """A/P aging grid by vendor."""
        qs = self.get_queryset().filter(status=VendorBill.Status.POSTED)
        entries = [{
            "party_id": str(b.vendor_id), "party_name": b.vendor.name,
            "due_date": b.due_date or b.bill_date, "outstanding": b.outstanding,
        } for b in qs if b.outstanding > 0]
        return Response(build_aging(entries, date.today()))
