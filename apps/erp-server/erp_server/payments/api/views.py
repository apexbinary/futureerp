from datetime import date

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.finance.models import CompanyCode
from erp_server.rbac.permissions import HasPagePermission, HasTenant

from ..fx_revaluation import revalue_open_items
from ..models import Payment
from ..service import PaymentError, post_payment, reverse_payment
from .serializers import PaymentSerializer


class PaymentViewSet(ArchiveViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant, HasPagePermission]
    queryset = Payment.objects.select_related("customer", "vendor", "journal_entry").all()
    serializer_class = PaymentSerializer
    page_key = "finance.payments"
    action_permissions = {"post_payment": "approve", "reverse_payment": "approve"}

    def get_queryset(self):
        qs = super().get_queryset().filter(tenant=self.request.user.tenant)
        d = self.request.query_params.get("direction")
        st = self.request.query_params.get("status")
        if d:
            qs = qs.filter(direction=d)
        if st:
            qs = qs.filter(status=st)
        return qs

    def perform_create(self, serializer):
        serializer.save()  # tenant is set inside the serializer's create()

    @action(detail=True, methods=["post"])
    def post_payment(self, request, pk=None):
        p = self.get_object()
        try:
            p = post_payment(p)
        except PaymentError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(p).data)

    @action(detail=True, methods=["post"])
    def reverse_payment(self, request, pk=None):
        p = self.get_object()
        try:
            p = reverse_payment(p, created_by=request.user)
        except PaymentError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(p).data)


class RunFxRevaluationView(APIView):
    """POST { as_of?: YYYY-MM-DD } — mark-to-market every open foreign-currency
    invoice/bill at today's (or the given) rate. Requires 'approve' on Payments,
    same gate as posting an actual payment, since this posts real G/L entries."""
    permission_classes = [IsAuthenticated, HasTenant, HasPagePermission]
    page_key = "finance.payments"
    required_permission = "approve"

    def post(self, request):
        tenant = request.user.tenant
        cc = CompanyCode.objects.filter(tenant=tenant).first()
        if not cc:
            return Response({"detail": "No company code."}, status=status.HTTP_400_BAD_REQUEST)
        as_of_str = request.data.get("as_of")
        try:
            as_of = date.fromisoformat(as_of_str) if as_of_str else date.today()
        except ValueError:
            return Response({"detail": "Bad as_of (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(revalue_open_items(tenant, cc, as_of))
