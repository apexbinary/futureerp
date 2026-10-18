from django.urls import path

from .views import MyEntitlementsView

urlpatterns = [path("", MyEntitlementsView.as_view(), name="my-entitlements")]
