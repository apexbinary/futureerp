"""Seed the RBAC catalog: permissions, pages (+ tabs), and a default client_admin role."""
from django.core.management.base import BaseCommand

from erp_server.identity.models import Tenant
from erp_server.rbac.models import Page, Permission, Role, RoleMatrixEntry

PERMISSIONS = [
    ("read", "Read", "View records"),
    ("write", "Write", "Create records"),
    ("edit", "Edit", "Modify records"),
    ("delete", "Delete", "Remove records"),
    ("export", "Export", "Export data out"),
    ("import", "Import", "Import data in"),
    ("filter", "Filter", "Use filters & saved views"),
    ("approve", "Approve", "Approve / authorize"),
]

# module -> [ (key, name, [tabs...]) ]
PAGES = {
    "Finance": [
        ("finance.invoices", "Invoices", ["All", "Drafts", "Overdue"]),
        ("finance.ledger", "Ledger", []),
        ("finance.payments", "Payments", []),
        ("finance.tax", "Tax", []),
        ("finance.reports", "Reports", []),
    ],
    "Sales": [
        ("sales.orders", "Orders", []),
        ("sales.customers", "Customers", []),
        ("sales.quotes", "Quotes", []),
    ],
    "Inventory": [
        ("inventory.items", "Items", []),
        ("inventory.stock", "Stock levels", []),
        ("inventory.warehouses", "Warehouses", []),
    ],
    "Procurement": [
        ("procurement.orders", "Purchase orders", []),
        ("procurement.suppliers", "Suppliers", []),
    ],
    "HR": [
        ("hr.employees", "Employees", []),
        ("hr.payroll", "Payroll", []),
        ("hr.leave", "Leave", []),
    ],
    "Admin": [
        ("admin.users", "Users", []),
        ("admin.roles", "Roles", []),
        ("admin.pages", "Pages", []),
        ("admin.permissions", "Permissions", []),
        ("admin.matrix", "Permission matrix", []),
    ],
}


class Command(BaseCommand):
    help = "Seed RBAC permissions, pages (+tabs), and default client_admin role (idempotent)."

    def handle(self, *args, **options):
        # 1) Permissions
        for order, (key, name, desc) in enumerate(PERMISSIONS):
            Permission.objects.update_or_create(
                key=key, defaults={"name": name, "description": desc, "order": order}
            )
        self.stdout.write(f"Permissions: {Permission.objects.count()}")

        # 2) Pages (+ tabs)
        for module, pages in PAGES.items():
            for p_order, (key, name, tabs) in enumerate(pages):
                page, _ = Page.objects.update_or_create(
                    key=key,
                    defaults={"name": name, "module": module, "order": p_order, "parent": None},
                )
                for t_order, tab in enumerate(tabs):
                    tab_key = f"{key}.{tab.lower().replace(' ', '_')}"
                    Page.objects.update_or_create(
                        key=tab_key,
                        defaults={"name": tab, "module": module, "parent": page, "order": t_order},
                    )
        self.stdout.write(f"Pages (incl. tabs): {Page.objects.count()}")

        # 3) Default client_admin role for the demo tenant — full access
        tenant = Tenant.objects.filter(code="abc").first()
        if tenant:
            role, created = Role.objects.get_or_create(
                tenant=tenant, key="client_admin",
                defaults={"name": "Client Admin", "description": "Full access to everything.", "is_system": True},
            )
            perms = list(Permission.objects.all())
            pages = list(Page.objects.all())
            entries = [
                RoleMatrixEntry(role=role, page=pg, permission=pm, allowed=True)
                for pg in pages for pm in perms
            ]
            # only create missing cells
            existing = {
                (e.page_id, e.permission_id)
                for e in RoleMatrixEntry.objects.filter(role=role).only("page_id", "permission_id")
            }
            to_create = [e for e in entries if (e.page_id, e.permission_id) not in existing]
            RoleMatrixEntry.objects.bulk_create(to_create)
            # attach the demo admin user to this role
            for u in tenant.users.all():
                u.roles.add(role)
            self.stdout.write(
                f"Role client_admin {'created' if created else 'exists'} "
                f"(+{len(to_create)} matrix cells)"
            )
        else:
            self.stdout.write("No demo tenant 'abc' — run seed_demo first.")
