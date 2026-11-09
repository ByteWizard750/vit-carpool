# VIT Chennai Carpooling Platform (RideShare VIT)

A trusted, high-performance, mobile-first community carpooling and cab-sharing platform engineered exclusively for the **VIT Chennai** campus community (students and faculty).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0-E0234E.svg)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_PostGIS_3.6-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748.svg)](https://www.prisma.io/)
[![pnpm](https://img.shields.io/badge/pnpm-9.x-orange.svg)](https://pnpm.io/)

---

## 1. Overview & Core Philosophy

Daily commuting to and from the VIT Chennai Kelambakkam campus poses major logistical, safety, and financial challenges. Students and faculty frequently spend significant amounts on solo cabs, autos, or personal fuel along major Chennai commute arteries (GST Road, OMR, Velachery Main Road, Vandalur-Kelambakkam Road).

**VIT Carpool** connects verified campus members traveling along identical commute corridors to share journeys, split travel expenses, reduce regional carbon footprint, and commute safely with verified peers.

### Strict Non-Negotiable Invariants
1. **Absolute Audience Isolation**: Strict institutional separation between `STUDENT` (`@vitstudent.ac.in`) and `FACULTY` (`@vit.ac.in`). Students only discover, match, and ride with students; faculty only with faculty. Cross-audience discovery, bookings, or notifications are blocked at the database, API, and UI layers.
2. **Server-Enforced Identity**: The client can **never** self-select or alter its audience or verification status. Identity is derived strictly from institutional email patterns and cryptographic RS256 JWT tokens.
3. **Atomic Concurrency & Seat Integrity**: Pending booking requests do not hold seats. Seats are committed only upon explicit approval via PostgreSQL atomic row locks (`SELECT ... FOR UPDATE`). Overbooking is mathematically impossible.
4. **Privacy-Preserving Geospatial Boundaries**: Exact residential addresses are shielded; searches operate within privacy-safe radius bands (500m–2km) and corridor bounding boxes.

---

## 2. Key Capabilities & Feature Modules

### 🚗 Vehicle Carpooling (Driver-Led)
- **Ride Publishing**: Verified car owners publish scheduled one-time or recurring rides with designated pickup points, intermediate corridor stops, seat capacity, and regulated cost contributions.
- **Recurring Commutes**: Materializes recurring daily/weekly schedules over a rolling IST horizon using `pg-boss` background jobs.
- **Boarding Verification**: Secure boarding confirmation code/token validation preventing unauthorized passenger pickups.

### 🚕 Cab Sharing (Organiser-Led)
- **Zero-Vehicle Registration**: Students and faculty without personal vehicles can organise shared cabs (Ola, Uber, Fastrack, prepaid campus cabs).
- **Dynamic Cost-Splitting**: Live fare-per-person estimation ($\text{Estimated Total Fare} \div \text{Total Occupants}$ including the organiser).
- **Fare Revision Lifecycle**: Organisers can update final metered fares before journey completion. If a material fare revision occurs ($>1$), passengers receive instant notifications and must acknowledge the revised amount on `/bookings`.
- **Booking Deadlines**: Configurable booking cutoff times; requests and approvals are locked once the departure deadline passes.

### 📍 Intelligent Route Discovery & Location Autocomplete
- **Corridor Matching**: PostGIS spatial indexing (`ST_DWithin`, line buffers) matches passengers whose pickup and dropoff points align along a published driving route geometry.
- **Transit-First Autocomplete**: Authoritative local Chennai transit catalog (suburban railway stations, bus terminuses, campus gates, metro stops) prioritized over commercial retail noise.
- **Responsive Dropdown**: Expands up to **580px** on desktop and tablet with dynamic boundary clamping to prevent off-screen overflow, featuring multi-line wrapping and zero truncated addresses.

### 💬 Real-Time Communication & Notifications
- **In-App Messaging**: Real-time WebSocket messaging threads for confirmed passengers and organisers/drivers.
- **Multi-Channel Alerts**: Web Push (VAPID) notifications, in-app notification center, and corridor-based ride alert matching.

### 🛡️ Safety, Ratings & Admin Operations
- **Reputation & Moderation**: Bilateral post-ride ratings, star reviews, user blocking, and confidential safety incident reports.
- **Admin Safety Console (`/admin`)**: 2FA-protected operations dashboard for platform health monitoring, user account audits, ride moderation, and emergency account suspensions.

---

## 3. Monorepo Architecture & Technology Stack

The project is structured as a high-performance monorepo using **pnpm workspaces**:

```
Vit-Carpool/
├── apps/
│   ├── api/                    # NestJS 10 REST API, WebSockets, PostGIS Services
│   │   ├── src/modules/
│   │   │   ├── admin/          # Admin moderation, safety audits, metrics
│   │   │   ├── auth/           # RS256 JWT, institutional auth guards, rate limiters
│   │   │   ├── bookings/       # Atomic booking workflows, fare acknowledgements
│   │   │   ├── locations/      # Transit catalog, Mapbox search, corridor fallback
│   │   │   ├── rides/          # Vehicle & Cab Share lifecycle, PostGIS corridor matcher
│   │   │   └── users/          # Profiles, verification, audience checks
│   │   └── test/               # E2E test suites (620+ passing integration tests)
│   └── web/                    # Vite + React 19 PWA
│       ├── src/components/     # Design system primitives, Navbar, BottomNav, Modals
│       ├── src/features/       # Auth, Ride Booking, Notifications, Tracking
│       ├── src/pages/          # 18 responsive pages (Landing, Rides, MyRides, Admin, etc.)
│       └── e2e/                # Playwright responsive & browser verification specs
├── packages/
│   ├── contracts/              # Shared TypeScript interfaces, Zod schemas, DTOs
│   └── db/                     # Prisma schema, PostGIS extensions, SQL migrations
└── docs/                       # Specifications, security invariants, QA audit evidence
```

### Technology Summary
| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, Vite, TypeScript, TanStack Query, React Router 7, Lucide Icons, CSS Design System |
| **Backend API** | NestJS 10, Fastify/Express, Passport JWT (RS256), `@nestjs/websockets`, `@nestjs/throttler` |
| **Database** | PostgreSQL 16 + PostGIS 3.6 extension, Prisma ORM, Raw PostGIS SQL Migrations |
| **Background Jobs** | `pg-boss` (PostgreSQL-backed transactional queue), IST cron schedules |
| **Geospatial & Maps** | PostGIS `geography(Point, 4326)` & `LineString`, Mapbox Search Box API & Directions API |
| **Testing** | Jest, Supertest, Playwright (Chromium browser automation) |

---

## 4. Development Environment & Setup Instructions

### Prerequisites
- **Node.js**: `v22.12.0` or higher
- **Package Manager**: `pnpm` (v9.x or v10.x)
- **Docker & Docker Compose**: Container runtime for PostgreSQL with PostGIS

### 1. Clone & Configure Environment
```bash
git clone https://github.com/ByteWizard750/vit-carpool.git
cd vit-carpool
cp .env.example .env
```

Ensure `.env` contains your development keys (PostgreSQL credentials, Mapbox access token, JWT secrets).

### 2. Launch PostGIS Database
Boot the containerized PostgreSQL 16 instance with PostGIS 3.6 pre-installed:
```bash
docker compose up -d --build
```
> [!NOTE]
> The database runs on port `5433` by default to avoid conflicts with native PostgreSQL services running on `5432`.

### 3. Install Monorepo Dependencies
```bash
pnpm install
```

### 4. Run Migrations & Generate Clients
```bash
pnpm db:generate
pnpm --filter @vit-carpool/db db:push
```

### 5. Start Development Servers
Start both the backend API and frontend web application concurrently:
```bash
pnpm dev
```
Or run each service in separate terminal windows:
```bash
# Terminal 1: NestJS API server (http://localhost:3000)
pnpm dev:api

# Terminal 2: Vite Web application (http://localhost:5173)
pnpm dev:web
```

---

## 5. Verification, Testing & Build

### Monorepo Typecheck
Typechecks all workspace packages (`@vit-carpool/contracts`, `@vit-carpool/db`, `@vit-carpool/api`, `@vit-carpool/web`):
```bash
pnpm typecheck
```

### Automated API Integration & Product Tests
Executes the comprehensive suite of 620+ integration tests covering concurrency, cab sharing, corridor matching, and security invariants:
```bash
pnpm --filter @vit-carpool/api test
```

### Production Build
Builds optimized production distributions across all packages:
```bash
pnpm build
```

---

## 6. Service Endpoints & Documentation

- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **Swagger / OpenAPI Documentation**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
- **Manual QA Audit Reports**:
  - [Cab Sharing & Corridor Discovery Manual QA Report](docs/MANUAL_QA_REPORT.md)
  - [Supplementary QA Verification Report](docs/MANUAL_QA_SUPPLEMENTARY_REPORT.md)
  - [Security Invariants Charter](docs/SECURITY-INVARIANTS.md)

---

## 7. License

This repository is maintained for the **VIT Chennai** community. All rights reserved. Unauthorized commercial exploitation or deployment outside institutional guidelines is strictly prohibited.
