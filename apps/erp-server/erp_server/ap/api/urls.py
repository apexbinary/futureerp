from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import VendorBillViewSet, VendorViewSet

router = DefaultRouter()
router.register("vendors", VendorViewSet, basename="ap-vendor")
router.register("bills", VendorBillViewSet, basename="ap-bill")

urlpatterns = [path("", include(router.urls))]
