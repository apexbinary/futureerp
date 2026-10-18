"""
Reusable soft-delete / archive infrastructure (CRUD + ARC + UARC).

- ArchivableModel: abstract base adding is_archived / archived_at / archived_by,
  plus is_system (seeded records that must never be archived or deleted).
- ArchiveViewSetMixin: adds /archive/ and /unarchive/ actions to a ModelViewSet,
  and an `?archived=` list filter (active-only by default, `true` = archived,
  `all` = both). Guards system records.

Apply to MASTER & CONFIG data only. Transactional documents (journal entries,
invoices) use their own status lifecycle, not archive.
"""
from __future__ import annotations

from datetime import datetime, timezone

from django.conf import settings
from django.db import models
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response


class ArchivableQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_archived=False)

    def archived(self):
        return self.filter(is_archived=True)


class ArchivableModel(models.Model):
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    # Seeded/system records: protected from archive & delete.
    is_system = models.BooleanField(default=False)

    objects = ArchivableQuerySet.as_manager()

    class Meta:
        abstract = True

    def archive(self, by=None):
        self.is_archived = True
        self.archived_at = datetime.now(timezone.utc)
        self.archived_by = by
        self.save(update_fields=["is_archived", "archived_at", "archived_by"])

    def unarchive(self):
        self.is_archived = False
        self.archived_at = None
        self.archived_by = None
        self.save(update_fields=["is_archived", "archived_at", "archived_by"])


class ArchiveViewSetMixin:
    """Mix into a ModelViewSet (before the tenant-scoped base) for ARC + UARC."""

    def get_queryset(self):
        qs = super().get_queryset()
        # Archive/unarchive act on a specific record regardless of its archived state.
        if getattr(self, "action", None) in ("archive", "unarchive"):
            return qs
        flag = self.request.query_params.get("archived", "false")
        if flag == "true":
            return qs.filter(is_archived=True)
        if flag == "all":
            return qs
        return qs.filter(is_archived=False)

    def perform_destroy(self, instance):
        # Soft-delete by default: DELETE archives instead of removing.
        if getattr(instance, "is_system", False):
            from rest_framework.exceptions import ValidationError
            raise ValidationError("System records cannot be deleted.")
        instance.archive(by=self.request.user)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        obj = self.get_object()
        if getattr(obj, "is_system", False):
            return Response({"detail": "System records cannot be archived."},
                            status=status.HTTP_400_BAD_REQUEST)
        obj.archive(by=request.user)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        obj = self.get_object()
        obj.unarchive()
        return Response(self.get_serializer(obj).data)
