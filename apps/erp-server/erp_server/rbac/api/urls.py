from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MyPermissionsView,
    PageListView,
    PermissionListView,
    RoleViewSet,
    UserViewSet,
)

router = DefaultRouter()
router.register("roles", RoleViewSet, basename="role")
router.register("users", UserViewSet, basename="rbac-user")

urlpatterns = [
    path("permissions/", PermissionListView.as_view(), name="rbac-permissions"),
    path("pages/", PageListView.as_view(), name="rbac-pages"),
    path("my-permissions/", MyPermissionsView.as_view(), name="rbac-my-permissions"),
    path("", include(router.urls)),
]
