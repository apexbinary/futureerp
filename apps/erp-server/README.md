# erp-server — THE HOST that runs business modules

The **same** Django host runs in two topologies:
- **Cloud:** multi-tenant, loads **all** modules, serves thousands of tenants.
- **Self-hosted:** single-tenant, sealed container, loads **only licensed** module(s), runs offline.

One codebase → two packagings (see `build/`). This is what guarantees **identical behavior**
between a cloud tenant and a self-hosted tenant — the #1 consistency requirement.

## Sub-systems (`erp_server/`)

| Package            | Responsibility                                                                       |
|--------------------|--------------------------------------------------------------------------------------|
| `bootstrap/`       | **Module loader.** Reads the license, resolves which module apps to add to `INSTALLED_APPS`, wires their routes/UI/events via `erp-module-sdk`. |
| `license_guard/`   | On startup **and** periodically: verifies the signed license, checks expiry, verifies file **integrity hashes**. Refuses to start / steps down the grace ladder if invalid. |
| `middleware/`      | Per-request gates: **tenant context** → **entitlement check** (did the company buy it?) → **RBAC check** (may this user do it?). |
| `health/`          | Liveness/readiness + the local status the agent reports home.                        |
| `common/`          | Runtime utilities.                                                                   |

## The two gates on every request
```
request → tenant-context → [ENTITLEMENT gate: license says allowed?] → [RBAC gate: user permitted?] → module
```
Both must pass. Entitlement = business/billing gate. RBAC = security gate. (See `docs/architecture`.)
