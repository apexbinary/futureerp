# FUTURE_ERP

A **modular, entitlement-driven ERP platform** (SAP-class) built as a monorepo.

- **Stack:** React (frontend) · Django + Django REST Framework (backend) · PostgreSQL
- **Model:** a cloud **control plane** (source of truth) governing distributed **consumer nodes**
  — some running in our cloud (multi-tenant SaaS), some **self-hosted** on the client's own infra.
- **Commercial spine:** module-based **and** feature-based billing, enforced by a Licensing engine.
- **Foundations:** dynamic RBAC + User Management, present in every deployment.

---

## The two planes

```
              ┌───────────────────────────────────────────────┐
              │   CONTROL PLANE  (our cloud, SOURCE OF TRUTH)  │
              │   apps/control-plane  +  apps/master-admin-web │
              │   • tenant registry (everyone, everywhere)     │
              │   • licensing / entitlements (issues tickets)  │
              │   • release distribution (signed artifacts)    │
              │   • phone-home ingestion (heartbeat/telemetry) │
              │   • billing, root identity, RBAC definitions   │
              └───────┬───────────────────────────┬───────────┘
             license, │ config, signed updates      │ heartbeat, usage,
             policy    ▼ (pull/push)                 ▲ version, compliance
        ┌──────────────────────────┐   ┌────────────────────────────────┐
        │  DATA PLANE — CLOUD       │   │  DATA PLANE — SELF-HOSTED       │
        │  apps/erp-server        │   │  apps/erp-server + apps/agent │
        │  runs ALL modules,        │   │  runs ONLY licensed module(s),  │
        │  multi-tenant             │   │  single-tenant, sealed, offline │
        └──────────────────────────┘   └────────────────────────────────┘
```

## Repository map (the golden rule: `apps → modules → packages`, one direction only)

| Folder        | What it is                                                                 |
|---------------|----------------------------------------------------------------------------|
| `apps/`       | **Deployables.** control-plane, erp-server, agent, and the two web apps.  |
| `modules/`    | **Sellable products.** Each = one bounded context (Django app + React UI). |
| `packages/`   | **Shared libraries.** Never deployed alone. `python/` + `js/`.              |
| `contracts/`  | Cross-language API/event schemas (OpenAPI, event defs, JSON schema).        |
| `build/`      | The pipeline: select module → cythonize → obfuscate → hash → image → sign.  |
| `infra/`      | Docker, Kubernetes, Terraform, CI/CD, registry, observability.             |
| `tooling/`    | Dev scripts, code generators, linting config.                              |
| `docs/`       | Architecture, ADRs, module specs, runbooks.                                |
| `tests/`      | Cross-cutting end-to-end tests.                                            |

## Dependency direction (never violate)

```
apps/  ──imports──►  modules/  ──imports──►  packages/
   │                                            ▲
   └──────────────────imports───────────────────┘
modules NEVER import other modules directly — they talk via events (packages/python/erp-events).
packages NEVER import modules or apps.
```

## Where each requirement lives

| Requirement                         | Home in the repo                                             |
|-------------------------------------|-------------------------------------------------------------|
| Module + feature billing            | `packages/python/erp-entitlements` + `apps/control-plane/…/licensing` |
| Dynamic RBAC                        | `packages/python/erp-rbac`                                   |
| User management                     | `packages/python/erp-identity` + `apps/control-plane/…/identity` |
| Self-hosted updates                 | `apps/agent` + `apps/control-plane/…/releases`              |
| Track all tenants (master admin)    | `apps/control-plane/…/tenancy` + `apps/master-admin-web`    |
| Code masking / sealing              | `build/pipeline` (cythonize, obfuscate, sign)              |
| Pluggable modules                   | `packages/python/erp-module-sdk`                            |

See `docs/architecture/OVERVIEW.md` for the full design.
