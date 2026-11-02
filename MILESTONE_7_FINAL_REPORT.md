# MILESTONE 7: Real-Time Ride Tracking & Pickup Intelligence
## Final Integration, Security & Production Validation Report

**Project:** VIT Carpool (Campus-Exclusive Carpooling for VIT Chennai)  
**Branch:** `main`  
**Date of Validation:** 2 November 2026  
**Final Verdict:** **`READY FOR CONTROLLED CAMPUS PILOT`**

---

### Executive Summary

Milestone 7 introduces institutional-grade, real-time GPS tracking and passenger pickup intelligence into VIT Carpool. Drivers can securely broadcast their live GPS coordinates, while confirmed passengers can follow their driver's approach on an interactive campus corridor map, receiving dynamic route-based ETAs, automated proximity notifications, driver arrival prompts, and missed pickup detection.

All components adhere strictly to campus cohort isolation (student vs. faculty), zero-knowledge location retention (snapshots pruned beyond ring buffer or TTL), and explicit multi-stage access control.

---

### 1. Implemented Architecture

```mermaid
flowchart TD
    subgraph Driver Client
        D_GPS[Browser Geolocation API] -->|Explicit Consent| D_HUD[Driver HUD & Controls]
        D_HUD -->|WebSocket Emit /location_update| GATEWAY[/tracking Gateway]
        D_HUD -->|HTTP REST Fallback| REST_LOC[POST /rides/:id/location-update]
    end

    subgraph Backend Infrastructure
        GATEWAY -->|JWT Handshake & Room Auth| TRACK_SERVICE[TrackingService]
        REST_LOC --> TRACK_SERVICE
        TRACK_SERVICE --> LOC_SVC[LocationsService - Mapbox / Fallback]
        TRACK_SERVICE --> NOTIF_SVC[NotificationsService - In-App]
        TRACK_SERVICE --> PUSH_SVC[WebPushService - Non-blocking]
        TRACK_SERVICE --> PRISMA[(PostgreSQL + PostGIS)]
    end

    subgraph Passenger Client
        GATEWAY -->|WebSocket Room Events| P_PAGE[Passenger Tracking Page]
        P_PAGE -->|Leaflet Interactive Map| P_MAP[Campus Corridor Map]
        P_PAGE -->|Proximity / Arrival Banners| P_PROMPT[Boarding Actions]
        P_PROMPT -->|POST /rides/:id/boarding| GATEWAY
    end
```

#### Key Architecture Highlights:
1. **Transport Layer:** Dual-transport architecture combining NestJS WebSocket Gateway (Socket.IO over `/tracking` namespace) with HTTP REST fallback bridges (`/rides/:id/location-update`, `/rides/:id/boarding`, `/rides/:id/tracking`).
2. **Access Control Layer:** `TrackingAccessService` enforces strict database-backed authorization checks on every handshake, room join, coordinate ingestion, and boarding state change. Client-supplied user IDs are completely ignored in favor of cryptographically verified JWT claims.
3. **Intelligence Layer:** `LocationsService` calculates route-based ETAs per confirmed passenger stop using Mapbox Directions API with campus-specific corridor fallbacks (detour multiplier $1.25\times$, campus average speed $28\text{ km/h}$, $45\text{s}$ buffer). Rate-limited with a $50\text{m}$ movement threshold and 25-second throttle.
4. **Resiliency Layer:** Independent decoupling of in-app database notifications, WebSocket broadcasts, and Web Push. Push server timeouts ($1.5\text{s}$) or network failures never block database transactions or real-time socket events.

---

### 2. Database Changes & Schema Evolution

The database schema was extended across two migrations without breaking existing ride publishing, booking lifecycles, or recurring commute functionality:

#### 1. Migration `20261101210000_add_realtime_tracking_and_boarding`
- **`ride_tracking_sessions` Table:**
  - `id` (UUID PK), `ride_id` (UUID Unique FK to `rides`), `started_at` (TIMESTAMPTZ), `ended_at` (TIMESTAMPTZ), `last_update_at` (TIMESTAMPTZ), `is_stale` (BOOLEAN DEFAULT false).
- **`driver_location_snapshots` Table:**
  - `id` (UUID PK), `ride_id` (UUID FK to `rides`), `latitude` (FLOAT), `longitude` (FLOAT), `accuracy` (FLOAT), `speed_kmh` (FLOAT), `heading` (FLOAT), `recorded_at` (TIMESTAMPTZ).
  - Spatial indexes on `[ride_id, recorded_at Desc]`.
- **`rides` Table Evolution:**
  - Added `IN_PROGRESS` to `ride_status_type` enum (`SCHEDULED -> IN_PROGRESS -> COMPLETED / CANCELLED`).
- **`bookings` Table Evolution:**
  - Added `boarding_status_type` enum: `'WAITING'`, `'BOARDING'`, `'BOARDED'`.
  - Added `boarding_status` (DEFAULT `'WAITING'`), `boarded_at` (TIMESTAMPTZ), `proximity_notified_at` (TIMESTAMPTZ).
  - Added `pickup_latitude` (FLOAT) and `pickup_longitude` (FLOAT) for individual passenger stop geolocation.

#### 2. Migration `20261102010000_add_proximity_notifications_and_missed_status`
- Added `'MISSED'` to `boarding_status_type` enum.
- Added `'DRIVER_ARRIVED'` and `'MISSED_PICKUP'` to `notification_type` enum.
- Added `arrived_notified_at`, `missed_notified_at`, and `missed_at` to `bookings` table.
- Created `web_push_subscriptions` table for non-blocking browser push tokens with `app_user` permissions.

---

### 3. API Contracts & WebSocket Events

#### HTTP Endpoints:
| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| `POST` | `/rides/:id/start` | Driver Only | Validates consent, initiates `RideTrackingSession`, transitions ride to `IN_PROGRESS`. |
| `GET` | `/rides/:id/tracking` | Driver / Confirmed Passenger | Returns full tracking state, driver vehicle, latest snapshot, and individual passenger ETAs. |
| `POST` | `/rides/:id/location-update` | Assigned Driver Only | Ingests live driver GPS coordinates (rate-limited to 1 req/sec). |
| `POST` | `/rides/:id/boarding` | Driver or Booking Passenger | Updates boarding status (`WAITING`, `BOARDING`, `BOARDED`, `MISSED`). |
| `POST` | `/rides/:id/complete` | Driver Only | Terminates tracking session, completes ride, marks remaining unboarded passengers. |
| `POST` | `/rides/:id/cancel` | Driver Only | Cancels ride, terminates tracking, prunes live snapshots, revokes room access. |
| `POST` | `/bookings/:id/cancel` | Booking Passenger | Cancels booking, restores seat, immediately evicts passenger from tracking room. |

#### WebSocket Room & Events (`/tracking` namespace):
- **Room Format:** `ride:{rideId}:tracking`
- **Client to Server:**
  - `join_tracking`: `{ rideId }` — Authenticates caller against ride permissions.
  - `leave_tracking`: `{ rideId }` — Leaves tracking room.
  - `location_update`: `{ rideId, location: { latitude, longitude, accuracy, speedKmh, heading } }`
  - `boarding_update`: `{ rideId, bookingId, boardingStatus }`
- **Server to Client:**
  - `tracking_state`: Initial state payload upon joining room.
  - `location_updated`: Broadcasts latest driver coordinates and passenger ETAs.
  - `tracking_stale`: Broadcasts when location updates cease (> 30s).
  - `tracking_active`: Broadcasts when live updates resume.
  - `passenger_approaching`: Triggered when ETA $\le 5\text{ min}$ or distance $\le 300\text{ m}$.
  - `driver_stopped_near_pickup`: Triggered when driver is stopped ($< 5\text{ km/h}$, $\le 150\text{ m}$).
  - `passenger_missed_pickup`: Triggered when driver moves past pickup ($> 10\text{ km/h}$, $\ge 400\text{ m}$).
  - `boarding_updated`: Broadcasts passenger boarding state transitions.
  - `access_revoked`: Emitted when ride completes, ride is cancelled, or passenger booking is cancelled.

---

### 4. Required Environment Variables & Credentials

| Variable | Type | Description | Default / Requirement |
|---|---|---|---|
| `DATABASE_URL` | String | PostgreSQL + PostGIS connection string | Required |
| `JWT_SECRET` | String | Ed25519 / HS256 secret for JWT verification | Required |
| `MAPBOX_ACCESS_TOKEN` | String | Mapbox Directions & Matrix API token | Optional (corridor fallback active if missing) |
| `LOCATION_PROVIDER` | String | `'mapbox'` or `'mock'` | Defaults to `'mapbox'` |
| `TRACKING_STALE_THRESHOLD_SECONDS` | Number | Window before location is marked STALE | `30` |
| `TRACKING_PROXIMITY_ETA_MINUTES` | Number | Route ETA threshold for approaching alert | `5` |
| `TRACKING_PROXIMITY_RADIUS_METERS` | Number | Distance threshold for fallback proximity | `300` |
| `VAPID_PUBLIC_KEY` | String | Web Push VAPID public key | Optional |
| `VAPID_PRIVATE_KEY` | String | Web Push VAPID private key | Optional |
| `VAPID_SUBJECT` | String | Web Push sender email / mailto | Optional |

---

### 5. Browser Limitations & Mobile Behaviour

1. **Background Geolocation Throttling:**
   - **Safari (iOS):** iOS suspends JavaScript timers and geolocation watching after approximately 20–30 seconds if the tab is backgrounded. Drivers must keep the VIT Carpool tab active while navigating.
   - **Screen Wake Lock:** The Screen Wake Lock API (`navigator.wakeLock.request('screen')`) is automatically acquired when tracking starts to prevent driver phones from sleeping. Tab visibility listeners (`visibilitychange`) automatically re-acquire the lock if the driver briefly switches tabs.
2. **GPS Accuracy & Filtering:**
   - High accuracy mode (`enableHighAccuracy: true`) is requested.
   - Readings with accuracy $> 500\text{m}$ are rejected as noise.
   - Readings with accuracy $> 150\text{m}$ trigger a warning banner: *"GPS accuracy is low (±Xm). Move toward open sky or verify location mode."*
3. **Responsive Mobile Layout:**
   - Tested across viewports down to iPhone SE ($375\times 667$).
   - Verified zero horizontal overflow (`scrollWidth <= innerWidth`).

---

### 6. Security & Privacy Audit Results

| Audit Check | Status | Verification Detail |
|---|---|---|
| **JWT Validation** | **PASS** | Validates token signature, expiration, and user account status on all REST and WebSocket connections. |
| **Room Authorization** | **PASS** | Only the assigned driver and passengers with `CONFIRMED` bookings can enter `ride:{rideId}:tracking`. |
| **Location Update Auth** | **PASS** | GPS updates rejected with 403 Forbidden if caller is not the assigned driver of that ride. |
| **Rate Limiting** | **PASS** | GPS submissions strictly limited to 1 request per second per ride; returns 429 Too Many Requests if exceeded. |
| **Coordinate Validation** | **PASS** | Rejects latitudes outside $[-90, 90]$, longitudes outside $[-180, 180]$, and accuracy $> 500\text{m}$. |
| **Cross-User Data Leakage** | **PASS** | Co-passengers only see the first names of other passengers. Contact numbers and full surnames are masked. |
| **Immediate Access Revocation** | **PASS** | Booking cancellation immediately evicts the passenger socket and rejects subsequent tracking queries with 403. |
| **Data Retention & Privacy** | **PASS** | Driver location snapshots are limited to a ring buffer of 20 points during active trips and purged upon ride completion/cancellation or after 24 hours. |
| **Driver Consent** | **PASS** | Start ride requires explicit driver confirmation dialog: *"Your live location will be shared with passengers who have confirmed bookings for this ride."* |

---

### 7. Performance & Concurrency Benchmark

- **Target Simulation:** 20 concurrent active rides along campus corridors (Vandalur, Perungalathur, Tambaram, Kelambakkam, Medavakkam).
- **Execution Output:**
  - 20 concurrent tracking states evaluated in parallel.
  - Total elapsed wall-clock time: **$84\text{ ms}$** (average **$4.2\text{ ms}$ per query**).
  - Memory consumption remained stable throughout rate limiting and ring buffer operations.

---

### 8. Regression & Automated Test Results

#### 1. Backend Automated Tests (NestJS / Jest)
- **Total Test Suites:** **23 passed, 23 total**
- **Total Tests:** **487 passed, 487 total (0 failures, 0 skipped)**
- **Wall Time:** $45.4\text{ seconds}$
- **Key Suites Verified:**
  - `test/m7-complete-integration-security.e2e-spec.ts` (9/9 passed)
  - `test/tracking-failure-recovery.e2e-spec.ts` (10/10 passed)
  - `test/proximity-notifications.e2e-spec.ts` (11/11 passed)
  - `test/tracking-gateway-backend.e2e-spec.ts` (5/5 passed)
  - `test/eta-intelligence.e2e-spec.ts` (7/7 passed)
  - `test/ride-tracking-lifecycle.e2e-spec.ts` (10/10 passed)
  - `test/rides.e2e-spec.ts`, `test/bookings.e2e-spec.ts`, `test/identity.e2e-spec.ts`, `test/vehicles.e2e-spec.ts`, `test/locations.e2e-spec.ts`, `test/chat.e2e-spec.ts`.

#### 2. Frontend Automated Tests (Playwright E2E)
- **Total Tests Executed:** **10 passed, 10 total** across `desktop-chrome` and `mobile-chrome`.
- **Specs Verified:**
  - `milestone-7-3-driver-gps.spec.ts` (Driver consent, GPS pre-activation, HUD, Wake Lock)
  - `milestone-7-4-passenger-map.spec.ts` (Passenger live map, vehicle card, stale banner, Leaflet markers)
  - `milestone-7-5-passenger-eta.spec.ts` (Multi-passenger ETAs, driver pickup sequencing)
  - `milestone-7-6-proximity-boarding.spec.ts` (Approaching notification, arrival prompt, missed pickup)
  - `milestone-7-7-failure-recovery.spec.ts` (Staleness recovery, GPS error banner, cancellation revocation)

#### 3. Monorepo Build Status
- `@vit-carpool/contracts`: Build successful (TypeScript 0 errors).
- `@vit-carpool/db`: Build & Prisma generate successful (0 errors).
- `@vit-carpool/api`: NestJS production build successful (0 errors).
- `@vit-carpool/web`: Vite production bundle successful (`dist/assets/index-dAcIxh9y.js` 926 kB).

---

### 9. External API Integration Status & Credential Handling

In accordance with institutional security guidelines, actual external API credentials are not hardcoded or committed to version control. The exact status of all external services is detailed below:

| External Service / API | Integration Status | Development & Test Behavior | Production Activation Requirement |
|---|---|---|---|
| **Mapbox Directions API** | **Mocked / Corridor Fallback** | Tested using isolated campus corridor routing heuristic (`calculateCampusFallback` with $1.25\times$ detour factor, $28\text{ km/h}$ average corridor speed, $45\text{s}$ pickup buffer) and simulated mock responses. | Real Mapbox token to be provided in `.env` (`MAPBOX_ACCESS_TOKEN`). Once provided, live traffic-aware routing will activate automatically. |
| **Web Push (VAPID / RFC 8292)** | **Decoupled / Non-Blocking** | Fully tested against decoupled delivery patterns and simulated network drops without blocking core operations. | Generate VAPID keypair (`npx web-push generate-vapid-keys`) and populate `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. |
| **Institutional Email SMTP** | **Configured via Env** | Gmail SMTP environment variables configured for OTP verification delivery. | Operational via environment variables. |
| **PostgreSQL + PostGIS** | **Fully Tested (Local/Container)** | Tested against live local PostgreSQL 16 + PostGIS instance on port 5433 with migrations deployed. | Production RDS / Cloud SQL instance connection string in `DATABASE_URL`. |

*Note: As per project guidelines, Mapbox Directions integration is marked as mocked/corridor-fallback and will only be classified as fully verified against live Mapbox infrastructure after production credentials are supplied and an end-to-end integration test with live external APIs succeeds.*

---

### 10. Remaining Operational Considerations & Manual Setup

1. **Mapbox Directions API Key:**
   - Configure a production Mapbox token in `.env` (`MAPBOX_ACCESS_TOKEN`) to enable live road traffic routing. If absent or throttled, the internal corridor heuristic (`calculateCampusFallback`) provides resilient estimates.
2. **Web Push VAPID Generation:**
   - Run `npx web-push generate-vapid-keys` to populate `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in deployment if browser background push is desired.
3. **Driver Navigation Advice:**
   - Because mobile browsers suspend background JavaScript timers, drivers should be instructed to mount their phone on a car dashboard holder with the screen on during active trips.

---

### 11. Final Verdict

# `READY FOR CONTROLLED CAMPUS PILOT`

All Milestone 7 functional requirements, security boundaries, privacy constraints, failure recovery mechanisms, and automated test gates have been fully implemented, validated, and verified without breaking existing core features. The platform is ready for an initial pilot with registered VIT Chennai student and faculty drivers.
