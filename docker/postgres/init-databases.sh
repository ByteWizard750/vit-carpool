#!/usr/bin/env bash
set -e

# This initialization script runs on initial database container creation.
# It creates dedicated databases for development, automated testing, and Prisma shadow migrations,
# and provisions the least-privilege runtime application role (app_user).

echo ">>> Initializing VIT Carpool databases and PostGIS extensions..."

function create_db_with_extensions() {
    local database=$1
    echo "Creating database '$database' with PostGIS and UUID extensions..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $database'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
EOSQL

    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "postgis";
EOSQL
}

# 1. Main development database (if different from default POSTGRES_DB)
create_db_with_extensions "vit_carpool_dev"

# 2. Automated test database (isolated for integration/e2e testing)
create_db_with_extensions "vit_carpool_test"

# 3. Prisma shadow database (used by Prisma Migrate for schema diffing without risking data)
create_db_with_extensions "vit_carpool_shadow"

# 4. Provision runtime application role (app_user) with least privilege
APP_PASSWORD="${DATABASE_APP_USER_PASSWORD:-app_user_dev_pw}"
echo "Provisioning least-privilege runtime role 'app_user'..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
            CREATE ROLE app_user WITH LOGIN PASSWORD '$APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
    END
    \$\$;
EOSQL

echo ">>> Database initialization complete: vit_carpool_dev, vit_carpool_test, vit_carpool_shadow and app_user role are ready."
