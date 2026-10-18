"""
RBAC API.
- Pages & Permissions are READ-ONLY (system catalog; users can't create them).
- Roles are CRUD (users create roles).
- The matrix is read per-role and bulk-updated via toggles.
- Users can be listed / invited / role-assigned.
"""
from django.contrib.auth import get_user_model
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Page, Permission, Role, RoleMatrixEntry
from ..permissions import HasTenant
from .serializers import (
    MatrixEntrySerializer,
    PageSerializer,
    PermissionSerializer,
    RoleSerializer,
    RoleWriteSerializer,
    UserSerializer,
    UserWriteSerializer,
)

User = get_user_model()


def _tenant(request):
    return getattr(request.user, "tenant", None)


@extend_schema(tags=["RBAC · Catalog"])
class PermissionListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PermissionSerializer(many=True))
    def get(self, request):
        return Response(PermissionSerializer(Permission.objects.all(), many=True).data)


@extend_schema(tags=["RBAC · Catalog"])
class PageListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=PageSerializer(many=True))
    def get(self, request):
        top = Page.objects.filter(parent__isnull=True)
        return Response(PageSerializer(top, many=True).data)


@extend_schema(tags=["RBAC · Roles"])
class RoleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasTenant]

    def get_queryset(self):
        return Role.objects.filter(tenant=_tenant(self.request))

    def get_serializer_class(self):
        return RoleWriteSerializer if self.action in ("create", "update", "partial_update") else RoleSerializer

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.is_system:
            return Response({"detail": "System roles can't be deleted."}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["get", "put"])
    def matrix(self, request, pk=None):
        role = self.get_object()
        if request.method == "GET":
            allowed = {
                (str(e.page_id), str(e.permission_id))
                for e in RoleMatrixEntry.objects.filter(role=role, allowed=True)
            }
            return Response({"role": str(role.id), "allowed": [list(a) for a in allowed]})

        # PUT: bulk apply toggles
        s = MatrixEntrySerializer(data=request.data.get("entries", []), many=True)
        s.is_valid(raise_exception=True)
        for item in s.validated_data:
            RoleMatrixEntry.objects.update_or_create(
                role=role, page_id=item["page"], permission_id=item["permission"],
                defaults={"allowed": item["allowed"]},
            )
        return Response({"detail": "Matrix updated", "count": len(s.validated_data)})


@extend_schema(tags=["RBAC · Users"])
class UserViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, HasTenant]
    serializer_class = UserSerializer

    @extend_schema(responses=UserSerializer(many=True))
    def list(self, request):
        qs = User.objects.filter(tenant=_tenant(request)).prefetch_related("roles")
        return Response(UserSerializer(qs, many=True).data)

    @extend_schema(request=UserWriteSerializer, responses=UserSerializer)
    def create(self, request):
        s = UserWriteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        tenant = _tenant(request)
        email = s.validated_data["email"]
        if User.objects.filter(email=email).exists():
            return Response({"detail": "A user with this email already exists."}, status=400)
        user = User.objects.create_user(
            email=email, password=None, tenant=tenant,
            full_name=s.validated_data.get("full_name", ""),
            status=User.Status.INVITED,
        )
        user.set_unusable_password()
        user.save()
        for rid in s.validated_data.get("role_ids", []):
            role = Role.objects.filter(id=rid, tenant=tenant).first()
            if role:
                user.roles.add(role)

        # Send the invite email via the chosen SMTP config, or the module's bound default.
        invite = self._send_invite(request, tenant, user, s.validated_data.get("smtp_id"))
        data = UserSerializer(user).data
        data["invite"] = invite
        return Response(data, status=status.HTTP_201_CREATED)

    def _send_invite(self, request, tenant, user, smtp_id):
        """Returns {sent: bool, status, detail} without failing user creation."""
        from erp_server.comms.models import EmailModule, SmtpConfig
        from erp_server.comms.service import send_email

        MODULE_KEY = "identity.user_invite"
        config = None
        if smtp_id:
            config = SmtpConfig.objects.filter(id=smtp_id, tenant=tenant).first()
        if config is None:
            module = EmailModule.objects.filter(tenant=tenant, key=MODULE_KEY).select_related("default_smtp").first()
            config = module.default_smtp if module else None
        if config is None:
            return {"sent": False, "status": "skipped", "detail": "No SMTP configured for invitations."}

        log = send_email(
            config=config,
            to_email=user.email,
            subject=f"You're invited to {tenant.name} on FUTURE_ERP",
            body=(
                f"Hi {user.full_name or user.email},\n\n"
                f"You've been invited to join {tenant.name} on FUTURE_ERP.\n"
                f"Click the link in this message to set your password and get started.\n\n"
                f"— The {tenant.name} team"
            ),
            module_key=MODULE_KEY,
        )
        return {"sent": log.status == "sent", "status": log.status, "detail": log.error}

    @extend_schema(responses=UserSerializer)
    def partial_update(self, request, pk=None):
        user = User.objects.filter(id=pk, tenant=_tenant(request)).first()
        if not user:
            return Response(status=404)
        if "full_name" in request.data:
            user.full_name = request.data["full_name"]
        if "status" in request.data:
            user.status = request.data["status"]
        user.save()
        if "role_ids" in request.data:
            user.roles.set(
                Role.objects.filter(id__in=request.data["role_ids"], tenant=_tenant(request))
            )
        return Response(UserSerializer(user).data)


@extend_schema(tags=["RBAC · Catalog"])
class MyPermissionsView(APIView):
    permission_classes = [IsAuthenticated, HasTenant]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        """Effective permissions for the current user (union across their roles)."""
        allowed = RoleMatrixEntry.objects.filter(
            role__in=request.user.roles.all(), allowed=True
        ).select_related("page", "permission")
        result: dict[str, list[str]] = {}
        for e in allowed:
            result.setdefault(e.page.key, []).append(e.permission.key)
        return Response(result)
