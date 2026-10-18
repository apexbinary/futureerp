from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CostCenterReportView, CostCenterViewSet

router = DefaultRouter()
router.register("cost-centers", CostCenterViewSet, basename="co-cost-center")

urlpatterns = [
    path("report/cost-centers/", CostCenterReportView.as_view(), name="co-cc-report"),
    path("", include(router.urls)),
]
