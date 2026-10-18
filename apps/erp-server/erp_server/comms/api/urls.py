from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import EmailModuleViewSet, SmtpConfigViewSet, SmtpLogViewSet

router = DefaultRouter()
router.register("configs", SmtpConfigViewSet, basename="smtp-config")
router.register("modules", EmailModuleViewSet, basename="email-module")
router.register("logs", SmtpLogViewSet, basename="smtp-log")

urlpatterns = [path("", include(router.urls))]
