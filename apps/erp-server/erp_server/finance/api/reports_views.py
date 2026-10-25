"""Financial report endpoints (read-only, tenant-scoped). Optional ?as_of=YYYY-MM-DD."""
from datetime import date

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


class GstSummaryView(APIView):
    """GET ?from=YYYY-MM-DD&to=YYYY-MM-DD — output vs input tax, net payable."""
    permission_classes = [IsAuthenticated, HasTenant]

    def get(self, request):
        def parse(key):
            v = request.query_params.get(key)
            return date.fromisoformat(v) if v else None

        return Response(reports.gst_summary(request.user.tenant, parse("from"), parse("to")))
