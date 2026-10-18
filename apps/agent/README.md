# agent — the self-hosted "assistant"

A small Python process that ships **only inside self-hosted deployments**, alongside `erp-server`.
It is the client's only link to our control plane. The module never updates itself — the agent does.

## Responsibilities (`agent/`)

| Package         | Responsibility                                                                          |
|-----------------|-----------------------------------------------------------------------------------------|
| `phone_home/`   | Periodic check-in to `control-plane/phone_home`: "still valid? anything new?"            |
| `license_sync/` | Pulls the latest **signed license file**, hands it to `erp-server/license_guard`.     |
| `updater/`      | Pulls the **signed Docker image** for a new version, **verifies signature**, installs, auto-rollback on failure. Supports auto vs approve-first modes. |
| `integrity/`    | Computes hashes of running artifacts, compares to the signed manifest, reports mismatches (tamper detection). |
| `telemetry/`    | Collects health/usage/version — **metadata only, never business data** — and sends home. |
| `supervisor/`   | Starts/stops/rolls back the local `node-runtime` container safely.                       |
| `config/`       | Endpoint, keys, check-in interval, update policy.                                        |

## Guarantees
1. Client does no manual work (or "approve-first" for cautious enterprises).
2. Updates are **signed & verified**; bad updates **auto-rollback**.
3. **No business data leaves** the client — only metadata/telemetry.
4. Offline **grace clock**: runs on the local signed license, but can't run forever without check-in.
