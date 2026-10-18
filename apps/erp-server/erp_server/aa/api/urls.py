from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FixedAssetViewSet, RunDepreciationView

router = DefaultRouter()
router.register("assets", FixedAssetViewSet, basename="aa-asset")

urlpatterns = [
    path("run-depreciation/", RunDepreciationView.as_view(), name="aa-run-depreciation"),
    path("", include(router.urls)),
]
