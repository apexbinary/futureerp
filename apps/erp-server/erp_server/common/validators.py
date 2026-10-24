from rest_framework import serializers


def validate_unique_code(model, tenant, code, instance=None):
    """Raise a DRF ValidationError if another row for this tenant already uses `code`.

    Needed because `tenant` isn't a serializer field (it's injected in
    perform_create/create from the request), so DRF can't auto-build a
    UniqueTogetherValidator for the model's (tenant, code) constraint —
    without this, a duplicate only surfaces as an unhandled IntegrityError.
    """
    qs = model.objects.filter(tenant=tenant, code=code)
    if instance is not None:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists():
        raise serializers.ValidationError(f"Code '{code}' is already in use.")
    return code
