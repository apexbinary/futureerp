from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.rbac.permissions import HasTenant

from ..models import Customer, CustomerInvoice, Item
from ..service import InvoiceError, post_invoice
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
