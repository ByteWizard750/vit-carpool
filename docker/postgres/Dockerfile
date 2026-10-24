FROM postgres:16-bookworm

# Install PostGIS 3 for PostgreSQL 16 on native Debian Bookworm (supports native linux/arm64 on Apple Silicon)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-16-postgis-3 \
        postgresql-16-postgis-3-scripts \
    && rm -rf /var/lib/apt/lists/*
