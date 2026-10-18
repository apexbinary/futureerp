"""
Root URL configuration for erp-server. API docs are gated behind login (not public);
module routes are mounted dynamically by bootstrap as they load.
"""
from django.contrib import admin
from django.contrib.auth.decorators import login_required
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

from erp_server.common.health import health

urlpatterns = [
    path("health/", health, name="health"),
    path("admin/", admin.site.urls),

    # API docs — GATED behind login (not public)
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
    path("api/auth/", include("erp_server.identity.api.urls")),

    # RBAC (pages, permissions, roles, matrix, users)
    path("api/rbac/", include("erp_server.rbac.api.urls")),

    # Communications (dynamic SMTP configs, module bindings, logs)
    path("api/smtp/", include("erp_server.comms.api.urls")),

    # Finance (FI): org structure + General Ledger
    path("api/finance/", include("erp_server.finance.api.urls")),

    # Tax engine: dynamic regimes, components, slabs, rates
    path("api/tax/", include("erp_server.tax.api.urls")),

    # Accounts Receivable: customers, items, customer invoices
    path("api/ar/", include("erp_server.ar.api.urls")),

    # Accounts Payable: vendors, vendor bills
    path("api/ap/", include("erp_server.ap.api.urls")),

    # Payments: customer receipts & vendor payments
    path("api/payments/", include("erp_server.payments.api.urls")),

    # Asset Accounting: fixed assets + depreciation
    path("api/aa/", include("erp_server.aa.api.urls")),

    # Controlling: cost centers + CO reports
    path("api/co/", include("erp_server.co.api.urls")),

    # Entitlements: the tenant's licensed features (drives gating)
    path("api/entitlements/", include("erp_server.entitlements.api.urls")),

    # Shared utilities (date-range presets, ...)
    path("api/util/", include("erp_server.common.urls")),
]
