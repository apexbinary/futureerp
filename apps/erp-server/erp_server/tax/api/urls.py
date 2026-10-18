from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    TaxComponentViewSet,
    TaxLocationViewSet,
    TaxPreviewView,
    TaxRateSlabViewSet,
    TaxRateViewSet,
    TaxRegimeViewSet,
)

router = DefaultRouter()
router.register("regimes", TaxRegimeViewSet, basename="tax-regime")
router.register("locations", TaxLocationViewSet, basename="tax-location")
router.register("components", TaxComponentViewSet, basename="tax-component")
router.register("slabs", TaxRateSlabViewSet, basename="tax-slab")
router.register("rates", TaxRateViewSet, basename="tax-rate")

urlpatterns = [
    path("preview/", TaxPreviewView.as_view(), name="tax-preview"),
    path("", include(router.urls)),
]
