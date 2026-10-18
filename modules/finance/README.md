# modules/finance — FI/CO (the REFERENCE module)

This module is the **canonical template**. Every other module (`sales`, `inventory`, …) copies this
exact structure. It is a fully self-contained, independently sellable product.

## Layout (Domain-Driven / Hexagonal)

```
finance/
├── backend/finance/
│   ├── manifest.py            ⭐ declares module + feature entitlements, permissions, events
│   ├── apps.py                Django AppConfig — registers with erp-module-sdk on load
│   ├── domain/                PURE business logic — no Django imports. THE crown jewel.
│   │   ├── entities/          Invoice, LedgerEntry, Account …
│   │   ├── value_objects/     Money, Currency, TaxCode …
│   │   ├── services/          TaxEngine, LedgerPostingService … (COMPILED via Cython)
│   │   └── rules/             invariants / policies
│   ├── application/           use cases orchestrating the domain
│   │   ├── commands/          write use cases (CreateInvoice …)
│   │   ├── queries/           read use cases (GetTrialBalance …)
│   │   └── handlers/          event handlers
│   ├── infrastructure/        adapters to the outside world
│   │   ├── models.py          Django ORM (schema — left as .py; not secret)
│   │   ├── repositories/      persistence, implement domain ports
│   │   └── migrations/        Django migrations (NEVER compiled)
│   ├── api/                   REST surface (DRF)
│   │   ├── views/             endpoints (entitlement + RBAC decorated)
│   │   ├── serializers/
│   │   └── urls.py
│   ├── events/                domain events this module emits/consumes
│   ├── tasks/                 background jobs (Celery)
│   └── tests/
└── frontend/src/              React screens for Finance (built into the bundle only when licensed)
```

## What gets COMPILED vs LEFT AS-IS (masking policy — see docs/architecture)
- ✅ Compile (Cython → `.so`): `domain/services/`, `domain/rules/`, `application/` — the value.
- ⚠️ Careful / usually left: `infrastructure/models.py` (ORM introspection).
- ❌ Never compile: `migrations/`, `apps.py`, `manifest.py`, `urls.py` — Django plumbing.

## Golden rule
`domain/` imports **nothing** from Django or other modules — it's pure Python business logic.
That keeps it testable, portable, and cleanly Cython-compilable.
