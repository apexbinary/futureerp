"""Seed a demo tenant + client_admin so tenant-web has something to log into."""
from django.core.management.base import BaseCommand

from erp_server.identity.models import Tenant, User


class Command(BaseCommand):
    help = "Create a demo tenant and client_admin user (idempotent)."

    def handle(self, *args, **options):
        tenant, created = Tenant.objects.get_or_create(
            code="abc",
            defaults={
                "name": "ABC Corporation",
                "deployment_type": Tenant.Deployment.CLOUD,
                "status": Tenant.Status.ACTIVE,
                "plan": "Growth",
                "region": "US-East",
            },
        )
        self.stdout.write(f"Tenant {'created' if created else 'exists'}: {tenant}")

        email = "admin@abc.com"
        if User.objects.filter(email=email).exists():
            self.stdout.write(f"User exists: {email}")
        else:
            user = User.objects.create_user(
                email=email,
                password="admin",
                tenant=tenant,
                full_name="Nethriya",
                role=User.Role.CLIENT_ADMIN,
                status=User.Status.ACTIVE,
                is_tenant_owner=True,
            )
            self.stdout.write(f"User created: {user.email} / admin  (role={user.role})")
