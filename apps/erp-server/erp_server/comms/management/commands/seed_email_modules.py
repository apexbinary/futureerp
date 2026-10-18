"""Seed the catalog of email-capable modules for each tenant (idempotent)."""
from django.core.management.base import BaseCommand

from erp_server.identity.models import Tenant
from erp_server.comms.models import EmailModule

MODULES = [
    ("identity.user_invite", "User invitation", "Sent when an admin invites a new user."),
    ("identity.password_reset", "Password reset", "Sent when a user requests a password reset."),
    ("finance.invoice_send", "Send invoice", "Emails an invoice to a customer."),
    ("finance.payment_receipt", "Payment receipt", "Confirms a received payment."),
]


class Command(BaseCommand):
    help = "Seed email-capable modules for every tenant."

    def handle(self, *args, **options):
        for tenant in Tenant.objects.all():
            for key, name, desc in MODULES:
                EmailModule.objects.update_or_create(
                    tenant=tenant, key=key, defaults={"name": name, "description": desc}
                )
        self.stdout.write(f"Email modules seeded across {Tenant.objects.count()} tenant(s).")
