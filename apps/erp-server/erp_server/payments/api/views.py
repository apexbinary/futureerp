from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.rbac.permissions import HasTenant

from ..models import Payment
from ..service import PaymentError, post_payment
from .serializers import PaymentSerializer


class PaymentViewSet(ArchiveViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant]
    queryset = Payment.objects.select_related("customer", "vendor", "journal_entry").all()
    serializer_class = PaymentSerializer

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
        serializer.save(tenant=self.request.user.tenant)

    @action(detail=True, methods=["post"])
    def post_payment(self, request, pk=None):
        p = self.get_object()
        try:
            p = post_payment(p)
        except PaymentError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(p).data)
