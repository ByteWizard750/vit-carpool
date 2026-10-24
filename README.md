# VIT Chennai Carpooling Platform (RideShare VIT)

A trusted, mobile-first community carpooling platform built specifically and exclusively for the **VIT Chennai** campus community (students and faculty).

---

## 1. Overview & Vision

Daily commuting to and from the VIT Chennai Kelambakkam campus poses significant logistical and financial challenges for students and faculty members alike. Many spend substantial amounts on solo cabs, autos, or personal fuel. 

This platform connects verified members of the VIT Chennai community traveling along similar routes to share car journeys, split operating costs, reduce traffic congestion, and travel safely with trusted peers.

### Key Philosophy
* **Campus-Exclusive & Verified**: Accessible only to verified VIT Chennai members.
* **Strict Audience Isolation**: Students only ride with students; faculty only ride with faculty.
* **Driver-Led**: Only car owners publish scheduled rides; passengers search, request seats, or configure ride alerts.
* **Request & Approve**: No instant booking. Every booking requires explicit driver approval with atomic concurrency guarantees.
* **Cost Sharing**: Non-commercial expense contribution sharing.
* **Safety & Privacy**: Privacy-preserving location tolerances; zero residential doxxing.
* **Production-Grade Architecture**: One unified codebase, single modular backend, single database, strict database-level constraints.

---

## 2. Core Architecture Summary

| Layer | Technology | Key Responsibility |
| :--- | :--- | :--- |
| **Frontend** | React 19 / Vite / TypeScript / Vanilla CSS | Mobile-first Progressive Web App (PWA), TanStack Query, accessible forms |
| **Backend API** | NestJS / TypeScript | Authoritative REST API, OpenAPI/Swagger, JWT authentication, authorization guards |
| **Database** | PostgreSQL 16+ / PostGIS | Authoritative state, spatial indexing, composite foreign key constraints |
| **ORM & Migrations** | Prisma + Reviewed Raw SQL Migrations | Type-safe access + raw migrations for PostGIS geometries, check constraints, triggers |
| **Authentication** | Supabase Auth (or institutional SSO/JWT) | Server-side JWT verification; trusted audience & status loaded from DB |
| **Asynchronous Jobs** | `pg-boss` (PostgreSQL job queue) | Recurring ride materialization, alert matching, notification delivery |
| **Geospatial & Maps**| MapLibre GL / OpenStreetMap / Valhalla or OSRM | Decoupled mapping interface; PostGIS pre-filtering before routing engine calls |

---

## 3. Strict Non-Negotiable Invariants

1. **Audience Separation**: Absolute isolation between `STUDENT` and `FACULTY`. No discovery, search, bookings, notifications, or database linkages can cross audience boundaries. Enforced at DB, API, and UI layers.
2. **Audience Immutability**: The client can **never** set or alter its audience. Audience is assigned solely by a trusted server-side verification process.
3. **Seat Integrity**: Pending booking requests do not hold seats. Seats are only consumed upon driver approval via an atomic database transaction. Overbooking is impossible.
4. **Cars Only**: MVP supports four-wheeler passenger cars only.

For the full security charter, see [SECURITY-INVARIANTS.md](docs/SECURITY-INVARIANTS.md).

---

## 4. Documentation Index

The platform documentation is organized in the `docs/` directory:

* 🏛️ [Architecture Specification](docs/ARCHITECTURE.md) - System architecture, components, API boundaries, and network topology.
* 🛡️ [Security Invariants & Rules](docs/SECURITY-INVARIANTS.md) - Non-negotiable security, isolation, and concurrency rules.
* 🗄️ [Database Design & Schema](docs/DATABASE-DESIGN.md) - Entity models, constraints, state machines, and PostGIS strategies.
* 🗺️ [Development & Milestone Plan](docs/DEVELOPMENT-PLAN.md) - Structured roadmap from Milestone 0 through Milestone 7.
* 📋 [Decisions & Open Questions (ADRs)](docs/DECISIONS.md) - Architectural decisions and tracking of unresolved requirements.

---

## 5. Development Environment & Setup Instructions

### Prerequisites
* **macOS**: Apple Silicon (`arm64`) or Intel (`x86_64`)
* **Node.js**: `v22.12.0`+
* **Package Manager**: `pnpm` (v12.15+)
* **Docker & Docker Compose**: Docker Desktop or OrbStack running

### 1. Environment Configuration
Copy the environment template:
```bash
cp .env.example .env
```
> [!NOTE]
> The database runs on port `5433` by default to avoid conflicts with any native Homebrew PostgreSQL service running on `5432`.

### 2. Start PostgreSQL with PostGIS
Launch the containerized PostgreSQL 16 + PostGIS 3 instance:
```bash
docker compose up -d --build
```
This automatically boots:
* Development DB: `vit_carpool_dev` (with PostGIS 3.6 enabled)
* Test DB: `vit_carpool_test` (isolated for automated testing)
* Shadow DB: `vit_carpool_shadow` (used by Prisma Migrate)

### 3. Install Monorepo Dependencies
```bash
pnpm install
```

### 4. Generate Prisma Client & Sync Database
```bash
pnpm db:generate
pnpm --filter @vit-carpool/db db:push
```

### 5. Run Development Servers
Start both backend API and frontend PWA concurrently:
```bash
pnpm dev
```
Or run each service independently:
```bash
# Terminal 1: Backend API (NestJS on port 3000)
pnpm dev:api

# Terminal 2: Mobile Web Frontend (Vite on port 5173)
pnpm dev:web
```

### 6. Verify Service Endpoints
* **Web App (PWA)**: [http://localhost:5173](http://localhost:5173)
* **API Health Check**: [http://localhost:3000/health](http://localhost:3000/health)
* **OpenAPI / Swagger UI**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

### 7. Run Verification & Tests
```bash
# Typecheck across all workspace packages
pnpm typecheck

# Run automated integration tests (verifies PostGIS DB connection)
pnpm test

# Build all packages
pnpm build
```

---

## 6. Milestone 1 Verification & Test Baseline

The foundation has been verified and confirmed against the running Docker database:

| Test / Check | Command | Verified Result |
| :--- | :--- | :--- |
| **PostgreSQL & PostGIS Version** | `SELECT PostGIS_Full_Version();` | `POSTGIS="3.6.4 94d984b" [EXTENSION] PGSQL="160" GEOS="3.11.1" PROJ="9.8.1"` |
| **Database Isolation** | `\l` inside container | `vit_carpool_dev`, `vit_carpool_test`, `vit_carpool_shadow` created with PostGIS |
| **Volume Persistence** | `docker compose restart` test | Verified; temporary test table and records survived restart |
| **Monorepo Typecheck** | `pnpm typecheck` | Passed across 4 projects (`contracts`, `db`, `web`, `api`) in 1.4s with 0 errors |
| **Automated E2E Test** | `pnpm --filter @vit-carpool/api test` | Passed (`GET /health` returned 200 OK with connected PostGIS DB in 65ms) |
| **REST Health Endpoint** | `curl http://localhost:3000/health` | HTTP 200: `{"status":"ok","database":{"connected":true,"postgisInstalled":true}}` |
| **Swagger OpenAPI Docs** | `curl http://localhost:3000/api/docs` | HTTP 200 OK |
| **PWA Web App** | Browser subagent on `http://localhost:5173` | UI rendered cleanly, live health card connected, interactive refetch verified |

