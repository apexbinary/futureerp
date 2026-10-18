# control-plane — THE BRAIN (source of truth)

Django service that runs **only in our cloud**. It is never shipped to a client.
It governs every node (cloud + self-hosted) but does **not** execute per-tenant business transactions.

## Sub-domains (each a Django app under `control_plane/`)

| Package        | Responsibility                                                                 |
|----------------|--------------------------------------------------------------------------------|
| `tenancy/`     | The global registry of **every** tenant, everywhere — cloud & self-hosted. Version, health, deployment type. |
| `licensing/`   | Issues **signed license files**; owns module + feature entitlements, user limits, expiry. The cash register + kill-switch. |
| `releases/`    | Stores & distributes **signed artifacts** (Docker images). Channels (stable/beta), staged rollout, mandatory-patch policy. |
| `phone_home/`  | Ingestion API the **agent** calls: heartbeat, telemetry, running-version, integrity hashes, license re-validation. |
| `billing/`     | Subscriptions, plans, invoicing, dunning. Feeds `licensing`.                   |
| `identity/`    | Root identity — creates tenant admins, SSO federation, the identity ancestor of every node. |
| `admin_api/`   | The API consumed by `apps/master-admin-web` (our internal ops console).         |
| `common/`      | Shared control-plane utilities (never business logic).                          |

## Key invariant
> The control plane is the source of truth for **CODE, LICENSE, CONFIG** — *not* for a self-hosted
> tenant's business **DATA**, which stays on their node.

## Config
`control_plane/config/` holds layered settings: `base.py`, `dev.py`, `prod.py`. Secrets via env only.
