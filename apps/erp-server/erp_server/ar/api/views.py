from datetime import date

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.common.aging import build_aging
from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.rbac.permissions import HasTenant

from ..models import Customer, CustomerInvoice, Item
from ..service import InvoiceError, post_invoice, reverse_invoice
from .serializers import CustomerInvoiceSerializer, CustomerSerializer, ItemSerializer


class _TenantScoped(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]
    required_entitlement = "finance.ar"

    def get_queryset(self):
        return self.queryset.filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class CustomerViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer


class ItemViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = Item.objects.select_related("tax_slab", "revenue_account").all()
    serializer_class = ItemSerializer


class CustomerInvoiceViewSet(_TenantScoped):
    queryset = CustomerInvoice.objects.select_related("customer", "journal_entry").prefetch_related(
        "lines__taxes", "lines__item"
    ).all()
    serializer_class = CustomerInvoiceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get("status")
        return qs.filter(status=st) if st else qs

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    def post_invoice(self, request, pk=None):
        """DRAFT → POSTED: computes tax + generates the balanced G/L document."""
        invoice = self.get_object()
        try:
            invoice = post_invoice(invoice)
        except InvoiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=["post"])
    def reverse_invoice(self, request, pk=None):
        """POSTED → CANCELLED: reverses the linked G/L document (never deletes)."""
        invoice = self.get_object()
        try:
            invoice = reverse_invoice(invoice, created_by=request.user)
        except InvoiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(invoice).data)

    @action(detail=False, methods=["get"])
    def open_items(self, request):
        """Posted invoices with an outstanding balance (optionally ?customer=)."""
        qs = self.get_queryset().filter(status=CustomerInvoice.Status.POSTED)
        cust = request.query_params.get("customer")
        if cust:
            qs = qs.filter(customer_id=cust)
        data = [self.get_serializer(i).data for i in qs if i.outstanding > 0]
        return Response(data)

    @action(detail=False, methods=["get"])
    def aging(self, request):
        """A/R aging grid by customer."""
        qs = self.get_queryset().filter(status=CustomerInvoice.Status.POSTED)
        entries = [{
            "party_id": str(i.customer_id), "party_name": i.customer.name,
            "due_date": i.due_date or i.baseline_date or i.invoice_date, "outstanding": i.outstanding,
        } for i in qs if i.outstanding > 0]
        return Response(build_aging(entries, date.today()))
