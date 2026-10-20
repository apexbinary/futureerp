from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CostCenterReportView,
    CostCenterViewSet,
    ProfitCenterReportView,
    ProfitCenterViewSet,
)

router = DefaultRouter()
router.register("cost-centers", CostCenterViewSet, basename="co-cost-center")
router.register("profit-centers", ProfitCenterViewSet, basename="co-profit-center")

urlpatterns = [
    path("report/cost-centers/", CostCenterReportView.as_view(), name="co-cc-report"),
    path("report/profit-centers/", ProfitCenterReportView.as_view(), name="co-pc-report"),
    path("", include(router.urls)),
]
