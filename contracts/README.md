# contracts — the cross-language source of truth for interfaces

| Dir         | Purpose                                                        |
|-------------|----------------------------------------------------------------|
| `openapi/`  | REST API definitions (Django serves; TS client generated).     |
| `events/`   | Domain-event schemas shared between modules.                    |
| `schemas/`  | JSON schemas for licenses, manifests, telemetry payloads.       |

Both Python (`packages/python/*`) and TS (`packages/js/contracts`) derive from here,
so cloud and self-hosted, backend and frontend, never drift.
