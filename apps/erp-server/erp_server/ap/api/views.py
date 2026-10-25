from datetime import date
from decimal import Decimal

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.common.aging import build_aging
from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.finance.service import get_exchange_rate
from erp_server.rbac.permissions import HasPagePermission, HasTenant

from ..models import DebitNote, Vendor, VendorBill
from ..service import BillError, post_bill, post_debit_note, reverse_bill, reverse_debit_note
from .serializers import DebitNoteSerializer, VendorBillSerializer, VendorSerializer


class _TenantScoped(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement, HasPagePermission]
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
    page_key = "finance.invoices"
    action_permissions = {"post_bill": "approve", "reverse_bill": "approve"}

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

    @action(detail=True, methods=["post"])
    def reverse_bill(self, request, pk=None):
        """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
        bill = self.get_object()
        try:
            bill = reverse_bill(bill, created_by=request.user)
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
        """A/P aging grid by vendor, in the company's base currency — bills in a
        foreign currency are converted at today's rate so mixed-currency open
        items don't get summed as if they were the same unit."""
        tenant = request.user.tenant
        today = date.today()
        qs = self.get_queryset().filter(status=VendorBill.Status.POSTED).select_related("company_code")
        entries = []
        for b in qs:
            if b.outstanding <= 0:
                continue
            base_ccy = b.company_code.currency
            rate = get_exchange_rate(tenant, b.currency, base_ccy, today) if b.currency != base_ccy else Decimal("1")
            entries.append({
                "party_id": str(b.vendor_id), "party_name": b.vendor.name,
                "due_date": b.due_date or b.baseline_date or b.bill_date,
                "outstanding": (b.outstanding * rate).quantize(Decimal("0.01")),
            })
        result = build_aging(entries, today)
        result["currency_note"] = "Converted to the company's base currency at today's exchange rate."
        return Response(result)


class DebitNoteViewSet(_TenantScoped):
    queryset = DebitNote.objects.select_related("vendor", "bill", "journal_entry").prefetch_related(
        "lines__taxes", "lines__expense_account"
    ).all()
    serializer_class = DebitNoteSerializer
    page_key = "finance.invoices"
    action_permissions = {"post_debit_note": "approve", "reverse_debit_note": "approve"}

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def post_debit_note(self, request, pk=None):
        note = self.get_object()
        try:
            note = post_debit_note(note)
        except BillError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(note).data)

    @action(detail=True, methods=["post"])
    def reverse_debit_note(self, request, pk=None):
        note = self.get_object()
        try:
            note = reverse_debit_note(note, created_by=request.user)
        except BillError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(note).data)
