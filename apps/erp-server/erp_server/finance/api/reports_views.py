"""Financial report endpoints (read-only, tenant-scoped). Optional ?as_of=YYYY-MM-DD."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from erp_server.rbac.permissions import HasTenant

from .. import reports


class _ReportView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]
    report = None

    def get(self, request):
        as_of = request.query_params.get("as_of") or None
        return Response(self.report(request.user.tenant, as_of))


class TrialBalanceView(_ReportView):
    report = staticmethod(reports.trial_balance)


class ProfitLossView(_ReportView):
    report = staticmethod(reports.profit_loss)


class BalanceSheetView(_ReportView):
    report = staticmethod(reports.balance_sheet)
