from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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
