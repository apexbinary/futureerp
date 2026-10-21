-- Runs once on first boot (empty data directory only), as the POSTGRES_USER.
-- POSTGRES_DB (default: future_erp) already exists at this point; here we add
-- the remaining per-service databases, owned by the same role.
--
-- Postgres has no "CREATE DATABASE IF NOT EXISTS", so each is guarded with a
-- \gexec that only fires when the database is missing.

SELECT 'CREATE DATABASE control_plane'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'control_plane')\gexec

SELECT 'CREATE DATABASE erp_server'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'erp_server')\gexec

SELECT 'CREATE DATABASE future_erp'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'future_erp')\gexec
