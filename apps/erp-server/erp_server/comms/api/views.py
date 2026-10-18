"""SMTP API — configs (CRUD), module bindings, logs (read-only), and a test send.
All tenant-scoped via HasTenant."""
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from erp_server.rbac.permissions import HasTenant

from ..models import EmailModule, SmtpConfig, SmtpLog
from ..service import send_email, verify_connection
from .serializers import (
    EmailModuleSerializer,
    SmtpConfigSerializer,
    SmtpLogSerializer,
    TestSendSerializer,
)


def _tenant(request):
    return request.user.tenant


@extend_schema(tags=["SMTP · Configs"])
class SmtpConfigViewSet(viewsets.ModelViewSet):
    serializer_class = SmtpConfigSerializer
    permission_classes = [IsAuthenticated, HasTenant]

    def get_queryset(self):
        return SmtpConfig.objects.filter(tenant=_tenant(self.request))

    def _verify_or_raise(self, data, instance=None):
        """Validate SMTP creds before saving. On edit, blank password reuses the stored one."""
        def pick(field, default):
            return data.get(field, getattr(instance, field, default) if instance else default)
        password = data.get("password") or (instance.password if instance else "")
        ok, err = verify_connection(
            host=pick("host", ""), port=int(pick("port", 587)),
            username=pick("username", ""), password=password,
            use_tls=bool(pick("use_tls", True)), use_ssl=bool(pick("use_ssl", False)),
        )
        if not ok:
            raise ValidationError({"detail": f"SMTP credentials failed to connect: {err}"})

    def perform_create(self, serializer):
        self._verify_or_raise(self.request.data)
        serializer.save(tenant=_tenant(self.request))

    def perform_update(self, serializer):
        self._verify_or_raise(self.request.data, instance=serializer.instance)
        serializer.save()

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False, methods=["post"])
    def verify(self, request):
        """Check credentials WITHOUT saving (for the form's Test-connection button).
        If `id` is given and password is blank, reuse that config's stored password."""
        data = request.data
        password = data.get("password") or ""
        if not password and data.get("id"):
            existing = self.get_queryset().filter(id=data["id"]).first()
            if existing:
                password = existing.password
        ok, err = verify_connection(
            host=data.get("host", ""), port=int(data.get("port") or 587),
            username=data.get("username", ""), password=password,
            use_tls=bool(data.get("use_tls", True)), use_ssl=bool(data.get("use_ssl", False)),
        )
        return Response({"valid": ok, "error": err})

    @extend_schema(request=TestSendSerializer, responses=OpenApiTypes.OBJECT)
    @action(detail=True, methods=["post"])
    def test(self, request, pk=None):
        config = self.get_object()
        s = TestSendSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        log = send_email(
            config=config,
            to_email=s.validated_data["to_email"],
            subject="FUTURE_ERP — SMTP test",
            body=f"This is a test email sent via '{config.label}'. If you received it, the config works.",
            module_key="smtp.test",
        )
        ok = log.status == SmtpLog.Status.SENT
        return Response(
            {"status": log.status, "error": log.error},
            status=status.HTTP_200_OK if ok else status.HTTP_502_BAD_GATEWAY,
        )


@extend_schema(tags=["SMTP · Modules"])
class EmailModuleViewSet(viewsets.ModelViewSet):
    """List modules and bind each to a default SmtpConfig (only default_smtp is writable)."""
    serializer_class = EmailModuleSerializer
    permission_classes = [IsAuthenticated, HasTenant]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        return EmailModule.objects.filter(tenant=_tenant(self.request)).select_related("default_smtp")

    def perform_update(self, serializer):
        # ensure the chosen smtp belongs to the same tenant
        smtp = serializer.validated_data.get("default_smtp")
        if smtp and smtp.tenant_id != _tenant(self.request).id:
            smtp = None
            serializer.validated_data["default_smtp"] = None
        serializer.save()


@extend_schema(tags=["SMTP · Logs"])
class SmtpLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SmtpLogSerializer
    permission_classes = [IsAuthenticated, HasTenant]

    def get_queryset(self):
        qs = SmtpLog.objects.filter(tenant=_tenant(self.request))
        p = self.request.query_params
        if p.get("module"):
            qs = qs.filter(module_key=p["module"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("from"):
            qs = qs.filter(created_at__date__gte=p["from"])   # inclusive from
        if p.get("to"):
            qs = qs.filter(created_at__date__lte=p["to"])     # inclusive to
        return qs[:500]
