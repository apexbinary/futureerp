from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CustomerInvoiceViewSet, CustomerViewSet, ItemViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="ar-customer")
router.register("items", ItemViewSet, basename="ar-item")
router.register("invoices", CustomerInvoiceViewSet, basename="ar-invoice")

urlpatterns = [path("", include(router.urls))]
