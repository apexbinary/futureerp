from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DebitNoteViewSet, VendorBillViewSet, VendorViewSet

router = DefaultRouter()
router.register("vendors", VendorViewSet, basename="ap-vendor")
router.register("bills", VendorBillViewSet, basename="ap-bill")
router.register("debit-notes", DebitNoteViewSet, basename="ap-debit-note")

urlpatterns = [path("", include(router.urls))]
