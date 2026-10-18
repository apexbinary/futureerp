# erp-events

Domain-event bus abstraction (how modules talk without importing each other).

**Type:** shared Python library (workspace member).
**Rule:** may be imported by `apps/` and `modules/`; must NOT import them back.
