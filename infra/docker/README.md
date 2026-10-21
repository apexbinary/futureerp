# infra/docker — local development infrastructure

`docker-compose.yml` runs the PostgreSQL instance the backends expect. A single
Postgres server hosts all three service databases — `control_plane`,
`erp_server`, and `future_erp` — created on first boot by
`postgres/init/01-create-databases.sql`.

## Quick start

```bash
cd infra/docker
docker compose up -d        # start Postgres in the background
docker compose ps           # status + health
docker compose logs -f db   # tail logs
docker compose down         # stop (data kept in the named volume)
docker compose down -v      # stop AND wipe all data
```

Postgres is published on host port **5433** (not 5432, which a machine-local
PostgreSQL often occupies). Default dev credentials are `erp` / `erp`.

## Configuration

Copy `.env.example` to `.env` in this directory to override any default
(credentials, host port). The `.env` file itself is gitignored; the
`.env.example` template is committed.

Each backend's own root `.env` must point at this instance, e.g.:

```
DATABASE_URL=postgres://erp:erp@localhost:5433/erp_server
```

> These are **local development** credentials only. Production configuration
> lives in the Kubernetes / Terraform manifests, never here.
