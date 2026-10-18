from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.rbac.permissions import HasTenant

from ..models import Entitlement


class MyEntitlementsView(APIView):
    """The enabled entitlement keys for the current tenant (drives UI gating)."""
    permission_classes = [IsAuthenticated, HasTenant]

    def get(self, request):
        keys = list(
            Entitlement.objects.filter(tenant=request.user.tenant, enabled=True)
            .values_list("key", flat=True)
        )
        return Response({"keys": keys})
