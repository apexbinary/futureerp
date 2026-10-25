from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PaymentViewSet, RunFxRevaluationView

router = DefaultRouter()
router.register("", PaymentViewSet, basename="payment")

urlpatterns = [
    path("revalue-fx/", RunFxRevaluationView.as_view(), name="run-fx-revaluation"),
    path("", include(router.urls)),
]
