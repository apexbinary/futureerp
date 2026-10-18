"""
Finance API — all views are tenant-scoped (HasTenant) and filter by request.user.tenant.
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import (
    ChartOfAccounts,
    CompanyCode,
    FiscalYear,
    GLAccount,
    JournalEntry,
)
from erp_server.common.archive import ArchiveViewSetMixin
from erp_server.entitlements.permissions import HasEntitlement
from erp_server.rbac.permissions import HasTenant

from ..service import PostingError, post_journal_entry, reverse_journal_entry
from .serializers import (
    ChartOfAccountsSerializer,
    CompanyCodeSerializer,
    FiscalYearSerializer,
    GLAccountSerializer,
    JournalEntrySerializer,
)


class _TenantScoped(viewsets.ModelViewSet):
    """Base: authenticated + belongs to a tenant; every query filtered to that tenant."""
    permission_classes = [IsAuthenticated, HasTenant, HasEntitlement]

    def get_queryset(self):
        return self.queryset.filter(tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.user.tenant)


class ChartOfAccountsViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = ChartOfAccounts.objects.all()
    serializer_class = ChartOfAccountsSerializer


class GLAccountViewSet(ArchiveViewSetMixin, _TenantScoped):
    queryset = GLAccount.objects.select_related("chart_of_accounts").all()
    serializer_class = GLAccountSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        coa = self.request.query_params.get("chart")
        if coa:
            qs = qs.filter(chart_of_accounts_id=coa)
        acct_type = self.request.query_params.get("type")
        if acct_type:
            qs = qs.filter(account_type=acct_type)
        return qs


class CompanyCodeViewSet(_TenantScoped):
    queryset = CompanyCode.objects.select_related("chart_of_accounts").all()
    serializer_class = CompanyCodeSerializer


class FiscalYearViewSet(_TenantScoped):
    queryset = FiscalYear.objects.prefetch_related("periods").all()
    serializer_class = FiscalYearSerializer


class JournalEntryViewSet(_TenantScoped):
    required_entitlement = "finance.gl"
    queryset = JournalEntry.objects.select_related("company_code").prefetch_related(
        "lines__gl_account"
    ).all()
    serializer_class = JournalEntrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs

    def perform_create(self, serializer):
        # tenant + created_by handled inside the serializer
        serializer.save()

    @action(detail=True, methods=["post"])
    def post_document(self, request, pk=None):
        """DRAFT → POSTED (enforces debit = credit, assigns document number)."""
        entry = self.get_object()
        try:
            entry = post_journal_entry(entry)
        except PostingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(entry).data)

    @action(detail=True, methods=["post"])
    def reverse(self, request, pk=None):
        """POSTED → create a linked reversal document (never deletes)."""
        entry = self.get_object()
        try:
            rev = reverse_journal_entry(entry, created_by=request.user)
        except PostingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(rev).data, status=status.HTTP_201_CREATED)
