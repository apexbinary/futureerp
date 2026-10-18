"""
Root URL configuration for control-plane.

The OpenAPI schema and its docs (Swagger, ReDoc) are ALL wrapped in login_required,
so they are never publicly accessible: an anonymous visitor is redirected to the
login screen first. Sub-domain API routes are added as each phase is built.
"""
from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from control_plane.common.health import health

urlpatterns = [
    # Public health check (no auth) — for load balancers / uptime monitors.
    path("health/", health, name="health"),

    # Login provider (interim) + admin.
    path("admin/", admin.site.urls),

    # ── API docs — GATED behind login (not public) ──
    path("api/schema/", login_required(SpectacularAPIView.as_view()), name="schema"),
    path(
        "api/docs/",
        login_required(SpectacularSwaggerView.as_view(url_name="schema")),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        login_required(SpectacularRedocView.as_view(url_name="schema")),
        name="redoc",
    ),

    # Auth (JWT: login / refresh / logout / me)
    path("api/auth/", include("control_plane.identity.api.urls")),

    # Shared utilities (date-range presets, ...)
    path("api/util/", include("control_plane.common.urls")),

    # Sub-domain routes are mounted here as they are built:
    # path("api/tenancy/", include("control_plane.tenancy.urls")),
    # path("api/licensing/", include("control_plane.licensing.urls")),
]
