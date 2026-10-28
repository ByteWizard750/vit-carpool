# Recurring Commutes & Materialization Engine

## 1. Overview

Recurring Commutes allow verified drivers in the VIT Chennai community to configure a regular travel schedule (e.g. daily campus commutes from Tambaram, Chromepet, or Velachery to VIT Chennai) and automatically generate individual bookable rides.

Each generated ride behaves like a normal, independently bookable ride created through the standard ride-offering flow:
* Passengers discover rides on the standard ride board (`/rides`).
* Passengers submit booking requests for available seats (`POST /bookings`).
* Drivers review and approve/reject bookings with real-time seat decrement.
* Passengers and drivers chat through private booking-scoped conversations (`/chat`).
* Rides transition through standard lifecycle states (`SCHEDULED` → `COMPLETED` / `CANCELLED`).
* Recurring commutes do **not** create a parallel booking silo.

---

## 2. Architecture & Data Model

### 2.1 Database Schema (`packages/db`)

```prisma
enum RecurringCommuteStatus {
  ACTIVE
  PAUSED
  CANCELLED

  @@map("recurring_commute_status_type")
}

model RecurringCommute {
  id                   String                 @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  driverId             String                 @map("driver_id") @db.Uuid
  audience             Audience
  vehicleId            String                 @map("vehicle_id") @db.Uuid
  origin               String                 @db.VarChar(128)
  originAddress        String?                @map("origin_address") @db.VarChar(255)
  originLatitude       Float?                 @map("origin_latitude")
  originLongitude      Float?                 @map("origin_longitude")
  originPlaceId        String?                @map("origin_place_id") @db.VarChar(128)
  destination          String                 @db.VarChar(128)
  destinationAddress   String?                @map("destination_address") @db.VarChar(255)
  destinationLatitude  Float?                 @map("destination_latitude")
  destinationLongitude Float?                 @map("destination_longitude")
  destinationPlaceId   String?                @map("destination_place_id") @db.VarChar(128)
  pickupDescription    String?                @map("pickup_description") @db.VarChar(255)
  dropoffDescription   String?                @map("dropoff_description") @db.VarChar(255)
  weekdays             Int[]                  @map("weekdays") // 1=Mon, ..., 7=Sun
  departureTime        String                 @map("departure_time") @db.VarChar(5) // "HH:mm" in Asia/Kolkata
  startDate            DateTime               @map("start_date") @db.Date
  endDate              DateTime               @map("end_date") @db.Date
  availableSeats       Int                    @map("available_seats") @db.Integer
  costPerSeat          Int?                   @map("cost_per_seat") @db.Integer
  status               RecurringCommuteStatus @default(ACTIVE)
  createdAt            DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime               @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  driver               User                   @relation("DriverRecurringCommutes", fields: [driverId, audience], references: [id, audience], onDelete: Restrict)
  vehicle              Vehicle                @relation("VehicleRecurringCommutes", fields: [vehicleId, driverId], references: [id, userId], onDelete: Restrict)
  rides                Ride[]                 @relation("RecurringCommuteRides")

  @@index([driverId])
  @@index([vehicleId])
  @@index([status])
  @@map("recurring_commutes")
}
```

### 2.2 Linkage on Ride Model

Individual generated rides record their parent schedule and occurrence date:
```prisma
model Ride {
  ...
  recurringCommuteId   String?           @map("recurring_commute_id") @db.Uuid
  scheduledOccurrence  DateTime?         @map("scheduled_occurrence") @db.Date
  recurringCommute     RecurringCommute? @relation("RecurringCommuteRides", fields: [recurringCommuteId], references: [id], onDelete: SetNull)

  @@unique([recurringCommuteId, scheduledOccurrence])
  @@index([recurringCommuteId])
}
```

---

## 3. Generation Engine & Invariants

### 3.1 Bounded Horizon (Rolling 14-Day Window)
* Rides are materialized up to **14 calendar days** in advance (configurable via `RECURRING_COMMUTE_HORIZON_DAYS`).
* The bounded horizon prevents runaway database growth and ensures drivers do not commit to rides far into the future before academic calendars or personal plans are settled.
* The background scheduler service periodically scans active schedules and extends the horizon automatically.

### 3.2 Timezone Determinism (Asia/Kolkata UTC+05:30)
* All calendar matching and time calculations use the campus local timezone (`Asia/Kolkata`).
* Weekdays are indexed using standard ISO-8601 day-of-week numbers:
  * `1` = Monday
  * `2` = Tuesday
  * `3` = Wednesday
  * `4` = Thursday
  * `5` = Friday
  * `6` = Saturday
  * `7` = Sunday
* Midday UTC timestamp construction (`T12:00:00+05:30`) avoids UTC-shift edge cases across DST and host timezone differences.
* Rides must depart at least 10 minutes in the future; past dates are never generated.

### 3.3 Concurrency Safety & Idempotency
* **Database Invariant**: A composite unique constraint on `rides(recurring_commute_id, scheduled_occurrence)` guarantees at the database level that no schedule can ever produce duplicate rides for the same calendar date.
* **Worker Collisions**: Concurrent worker invocations catching Prisma `P2002` safely treat the collision as a successful generation by the winning worker without throwing 500 errors or corrupting generation state.
* **Intentionally Cancelled Rides**: When a driver cancels an individual generated ride, its database status transitions to `CANCELLED`. Because the row persists with its `scheduled_occurrence`, future generator runs skip that date and will **never** recreate a ride that the driver deliberately cancelled.

---

## 4. Schedule Lifecycle

| Action | API Route | Description |
| :--- | :--- | :--- |
| **Create** | `POST /recurring-commutes` | Validates vehicle ownership, seat capacity, audience, and dates. Saves schedule and immediately materializes the first 14 days of rides. |
| **List** | `GET /recurring-commutes` | Returns all schedules owned by the authenticated driver with ride counts and next upcoming occurrence. |
| **Get** | `GET /recurring-commutes/:id` | Returns schedule details. Enforces participant authorization (driver-only). |
| **Update** | `PATCH /recurring-commutes/:id` | Updates preferences for future un-generated rides. Does not silently overwrite already generated rides or bookings. |
| **Pause** | `PATCH /recurring-commutes/:id/pause` | Transitions status to `PAUSED`. Halts future ride generation; existing rides remain intact. |
| **Resume** | `PATCH /recurring-commutes/:id/resume` | Transitions status to `ACTIVE`. Resumes materialization for remaining future dates without backfilling past missed dates. |
| **Cancel** | `PATCH /recurring-commutes/:id/cancel` | Transitions status to `CANCELLED`. Permanently disables future generation. Existing rides remain intact. |

---

## 5. Security & Isolation

1. **Authentication Guard**: All endpoints require active session authentication (`VerifiedUserGuard`).
2. **Audience Homogeneity**: Composite foreign keys on `users (id, audience)` and `recurring_commutes (driver_id, audience)` prevent student and faculty identities from mixing. Faculty schedules generate faculty-only rides; students cannot discover or book them.
3. **Vehicle Ownership & Capacity**: Drivers can only select verified vehicles that belong to their user account. The offered seat count cannot exceed `vehicle.capacity - 1`.
4. **Audit Logging**: Every schedule creation, update, pause, resume, cancellation, and ride materialization writes an immutable audit record to `audit_logs`.

---

## 6. Testing & Verification

The suite includes 24 automated integration and E2E tests in `apps/api/test/recurring-commutes.e2e-spec.ts`:

```bash
# Run recurring commutes tests in isolation
pnpm --filter @vit-carpool/api exec jest --config test/jest-e2e.json test/recurring-commutes.e2e-spec.ts --runInBand

# Run the complete test suite (345 passing tests across 14 suites)
pnpm --filter @vit-carpool/api test

# Workspace typecheck
pnpm typecheck

# Production build
pnpm build
```

---

## 7. Environment Configuration

The following optional environment variables configure the recurring commute engine:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `RECURRING_COMMUTE_HORIZON_DAYS` | `14` | Rolling future window in days for ride materialization (min 1, max 90). |
| `RECURRING_COMMUTE_INTERVAL_MS` | `3600000` (1 hr) | Interval between periodic materialization runs in production/dev. Automatically disabled during test execution (`NODE_ENV=test`). |
