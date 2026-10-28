# Milestone 12: Ride Alerts and In-App Notifications

## 1. Overview

Milestone 12 introduces a persistent, database-backed ride alert and in-app notification system for the VIT Carpool platform. It enables passengers to save their travel preferences (route, radius, departure time window, and minimum seat requirements) and automatically receive notifications when an eligible driver publishes a matching ride or when a Recurring Commute materializes a new ride. It also delivers persistent notifications for key booking lifecycle events (seat requests, approvals, rejections, passenger cancellations, and driver ride cancellations).

---

## 2. Architecture & Design Principles

```
                  ┌────────────────────────────────────────────────────────┐
                  │                    Published Ride                      │
                  │        (via POST /rides or Recurring Commute)          │
                  └───────────────────────────┬────────────────────────────┘
                                              │ (Post-Commit)
                                              ▼
                                 RideAlertsMatcherService
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │ 1. PostGIS ST_DWithin (Origin & Dest Radius)  │
                      │ 2. Directional Matching (A -> B != B -> A)    │
                      │ 3. Departure Window (Asia/Kolkata Presets)    │
                      │ 4. Available Seats >= minSeats                │
                      │ 5. Strict Cohort Isolation (STUDENT/FACULTY)  │
                      │ 6. Exclude Driver Self-Ride Alerts            │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
                                    NotificationsService
                                              │
                                              ▼
                                Database @@unique([recipientId, dedupKey])
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        ▼                                           ▼
             Notification Inbox (/notifications)       Navbar Indicator Badge
```

### Key Invariants:
1. **Directional Matching Only**: A ride from Tambaram to VIT Chennai will NEVER match an alert from VIT Chennai to Tambaram.
2. **Strict Audience Cohort Isolation**: Student alerts are matched only against student-driven rides; faculty alerts are matched only against faculty-driven rides.
3. **Driver Self-Alert Exclusion**: Drivers publishing a ride never receive passenger alerts for their own rides.
4. **Post-Commit Dispatch**: Notifications and matching occur strictly after the parent business transaction has successfully committed to the database.
5. **Durable Deduplication**: Duplicate event triggers (e.g., retried workers or repeated scheduler runs) are deduplicated at the PostgreSQL schema level via a composite unique constraint `@@unique([recipientId, dedupKey])`.
6. **No External Push Dependencies**: The system relies purely on persistent in-app notifications and authenticated APIs without external third-party mobile or browser push services.

---

## 3. Database Models & Schema Migrations

### Prisma Schema Additions (`packages/db/prisma/schema.prisma`)

```prisma
enum RideAlertStatus {
  ACTIVE
  PAUSED
}

enum NotificationType {
  RIDE_MATCH
  BOOKING_REQUESTED
  BOOKING_APPROVED
  BOOKING_REJECTED
  BOOKING_CANCELLED
  RIDE_CANCELLED
}

model RideAlert {
  id                    String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId                String          @map("user_id") @db.Uuid
  user                  User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  audience              Audience        @map("audience")
  origin                String          @map("origin")
  originLatitude        Float           @map("origin_latitude")
  originLongitude       Float           @map("origin_longitude")
  originPlaceId         String?         @map("origin_place_id")
  destination           String          @map("destination")
  destinationLatitude   Float           @map("destination_latitude")
  destinationLongitude  Float           @map("destination_longitude")
  destinationPlaceId    String?         @map("destination_place_id")
  radiusKm              Float           @default(5.0) @map("radius_km")
  earliestDepartureTime String?         @map("earliest_departure_time")
  latestDepartureTime   String?         @map("latest_departure_time")
  minSeats              Int             @default(1) @map("min_seats")
  status                RideAlertStatus @default(ACTIVE) @map("status")
  createdAt             DateTime        @default(now()) @map("created_at")
  updatedAt             DateTime        @updatedAt @map("updated_at")
  notifications         Notification[]

  @@index([userId, status], name: "idx_ride_alerts_user_status")
  @@index([audience, status], name: "idx_ride_alerts_audience_status")
  @@map("ride_alerts")
}

model Notification {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipientId        String           @map("recipient_id") @db.Uuid
  recipient          User             @relation(fields: [recipientId], references: [id], onDelete: Cascade)
  audience           Audience         @map("audience")
  type               NotificationType @map("type")
  title              String           @map("title")
  message            String           @map("message")
  rideId             String?          @map("ride_id") @db.Uuid
  ride               Ride?            @relation(fields: [rideId], references: [id], onDelete: Cascade)
  bookingId          String?          @map("booking_id") @db.Uuid
  booking            Booking?         @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  recurringCommuteId String?          @map("recurring_commute_id") @db.Uuid
  recurringCommute   RecurringCommute?@relation(fields: [recurringCommuteId], references: [id], onDelete: Cascade)
  rideAlertId        String?          @map("ride_alert_id") @db.Uuid
  rideAlert          RideAlert?       @relation(fields: [rideAlertId], references: [id], onDelete: SetNull)
  isRead             Boolean          @default(false) @map("is_read")
  dedupKey           String?          @map("dedup_key")
  createdAt          DateTime         @default(now()) @map("created_at")

  @@unique([recipientId, dedupKey], name: "idx_notifications_recipient_dedup")
  @@index([recipientId, isRead, createdAt], name: "idx_notifications_recipient_unread")
  @@map("notifications")
}
```

### Migration History
- Migration Name: `20261028140000_add_ride_alerts_and_notifications`
- Applied cleanly to both `vit_carpool_dev` and `vit_carpool_test`.

---

## 4. API Endpoints

### Ride Alerts (`/ride-alerts`)
All endpoints enforce `VerifiedUserGuard` and strict ownership.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ride-alerts` | Create a new ride alert (validates origin/destination coordinates, radius, departure times). |
| `GET` | `/ride-alerts` | List all saved alerts belonging to the authenticated user. |
| `GET` | `/ride-alerts/:id` | Retrieve an individual alert (404 if not found or not owned). |
| `PATCH` | `/ride-alerts/:id` | Update alert preferences (radius, departure window, minSeats). |
| `POST` | `/ride-alerts/:id/pause` | Pause an active alert (prevents future match notifications). |
| `POST` | `/ride-alerts/:id/resume` | Resume a paused alert. |
| `DELETE` | `/ride-alerts/:id` | Delete an alert (preserves historical notifications). |

### Notifications (`/notifications`)
All endpoints enforce `SupabaseAuthGuard` and strict recipient ownership.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/notifications` | List user notifications (ordered newest first, supports `?limit=` and `?unreadOnly=true`). |
| `GET` | `/notifications/unread-count` | Retrieve persistent count of unread notifications (`{ unreadCount: number }`). |
| `PATCH` | `/notifications/:id/read` | Mark an individual notification as read. |
| `POST` | `/notifications/mark-all-read` | Mark all notifications belonging to the user as read. |
| `DELETE` | `/notifications/:id` | Delete an individual notification. |

---

## 5. Event Notification Lifecycle

| Event Trigger | Recipient | Type | Content |
|---|---|---|---|
| **Ride Published** | Passenger with matching active alert | `RIDE_MATCH` | "🚗 New Ride Match: {origin} → {destination} departing at {time} IST." |
| **Booking Requested** | Ride Driver | `BOOKING_REQUESTED` | "🙋 New Booking Request: {passengerName} requested {seats} seat(s)." |
| **Booking Approved** | Passenger | `BOOKING_APPROVED` | "✅ Booking Approved! Your booking for {origin} → {destination} was approved." |
| **Booking Rejected** | Passenger | `BOOKING_REJECTED` | "⚠️ Booking Declined: Your booking request was declined by the driver." |
| **Booking Cancelled (by Passenger)** | Ride Driver | `BOOKING_CANCELLED` | "ℹ️ Booking Cancelled by Passenger: {passengerName} cancelled their booking." |
| **Ride Cancelled (by Driver)** | All Passengers with Active Bookings | `RIDE_CANCELLED` | "❌ Ride Cancelled by Driver: The ride from {origin} to {destination} was cancelled." |

---

## 6. Frontend Components & Pages

1. **Navbar Notification Indicator (`apps/web/src/components/layout/Navbar.tsx`)**:
   - Bell quick-action icon with unread count badge.
   - Periodic background polling (`/notifications/unread-count`) with interval cleanup on unmount.
   - Desktop and mobile navigation links for `Notifications` and `Ride Alerts`.

2. **Notifications Centre (`apps/web/src/pages/NotificationsPage.tsx`)**:
   - Tab filters: "All Notifications" and "Unread Only".
   - "Mark All Read" action button.
   - Notification item cards with category-coded badge, time in Asia/Kolkata, action links to `/rides` or `/bookings`, mark read toggle, and delete button.
   - Empty and error states with reload capabilities.

3. **Ride Alerts Management (`apps/web/src/pages/RideAlertsPage.tsx`)**:
   - View active and paused alerts with visual route indicator and metadata badges.
   - Pause / Resume button.
   - Edit alert preferences modal.
   - Delete alert confirmation modal.
   - Create alert form with `LocationAutocomplete`, quick campus chips (VIT Chennai, Tambaram, Kelambakkam, Airport, Velachery), radius buttons, departure window selector, and minimum seat picker.

4. **Dashboard Integration (`apps/web/src/pages/DashboardPage.tsx`)**:
   - Quick Metrics Bar displays clickable cards for `Unread Alerts` and `Saved Alerts`.
   - Quick Platform Links include dedicated cards for `Ride Alerts` and `Notifications`.

---

## 7. Verification & Automated Test Results

- **Milestone 12 E2E Suite (`apps/api/test/ride-alerts-notifications.e2e-spec.ts`)**:
  - **33/33 tests passing**.
  - Covers Alert CRUD, directional matching, spatial radius bounds, departure time window filtering, minSeats checks, audience isolation, driver self-exclusion, Recurring Commute generation matching, duplicate event deduplication, booking lifecycle notifications, persistent unread counts, and security authorization boundaries.
- **Full Backend Regression Suite (`apps/api/test/`)**:
  - **15/15 test suites passing** (378/378 tests).
- **Workspace Typecheck (`pnpm typecheck`)**:
  - `@vit-carpool/contracts`: 0 errors.
  - `@vit-carpool/db`: 0 errors.
  - `@vit-carpool/api`: 0 errors.
  - `@vit-carpool/web`: 0 errors.
- **Workspace Production Build (`pnpm build`)**:
  - Successfully built `@vit-carpool/contracts`, `@vit-carpool/db`, `@vit-carpool/api`, and `@vit-carpool/web`.
