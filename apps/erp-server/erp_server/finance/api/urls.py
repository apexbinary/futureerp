from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .reports_views import BalanceSheetView, GstSummaryView, ProfitLossView, TrialBalanceView
from .views import (
    ChartOfAccountsViewSet,
    CompanyCodeViewSet,
    ExchangeRateViewSet,
    FiscalYearViewSet,
    GLAccountViewSet,
    JournalEntryViewSet,
)

router = DefaultRouter()
router.register("company-codes", CompanyCodeViewSet, basename="fin-company-code")
router.register("charts-of-accounts", ChartOfAccountsViewSet, basename="fin-coa")
router.register("gl-accounts", GLAccountViewSet, basename="fin-gl-account")
router.register("fiscal-years", FiscalYearViewSet, basename="fin-fiscal-year")
router.register("journal-entries", JournalEntryViewSet, basename="fin-journal-entry")
router.register("exchange-rates", ExchangeRateViewSet, basename="fin-exchange-rate")

urlpatterns = [
    path("reports/trial-balance/", TrialBalanceView.as_view(), name="fin-trial-balance"),
    path("reports/profit-loss/", ProfitLossView.as_view(), name="fin-profit-loss"),
    path("reports/balance-sheet/", BalanceSheetView.as_view(), name="fin-balance-sheet"),
    path("reports/gst-summary/", GstSummaryView.as_view(), name="fin-gst-summary"),
    path("", include(router.urls)),
]
