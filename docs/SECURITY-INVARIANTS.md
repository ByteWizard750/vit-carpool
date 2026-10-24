# Security Invariants and Isolation Charter

This document establishes the permanent, non-negotiable security rules for the VIT Chennai Carpooling Platform. Every architectural pattern, database constraint, API endpoint, and background job must adhere strictly to these invariants.

---

## 1. Identity & Authorization

1. **Server-Side Token Verification**: Authenticated identity is established solely via cryptographic server-side validation of the authentication JWT (issued by Supabase Auth). The client runtime is never trusted.
2. **Authoritative Database Identity**: The application user record (`users` table) is looked up from PostgreSQL using the verified auth subject ID (`auth_user_id`). Client-provided user IDs are discarded.
3. **Trusted Audience Derivation**: A user’s audience (`STUDENT` or `FACULTY`) is resolved exclusively from the database record. It is never read from client request payloads, query parameters, or JWT custom claims without DB verification.
4. **Zero Client Role/Audience Self-Assignment**: Clients can **never** select, submit, or modify their own `audience`, `verification_status`, or `role` (e.g., admin flags). There is no user-facing audience dropdown during registration. Any input payload attempting to supply or patch these fields must be rejected or stripped by DTO validation pipes.
5. **Resource Ownership Boundaries**: Users can only create, update, or cancel their own resources (vehicles, ride offers, bookings, alerts). Ownership must be verified by comparing the authenticated user's ID against the database record owner.
6. **Exclusive Driver Decision Rights**: Only the verified driver who created a ride has authorization to accept or reject incoming booking requests for that ride.
7. **Explicit Admin Authorization**: Administrative endpoints (e.g., identity verification review, user suspensions, dispute resolution) require a distinct `ADMIN` role check enforced via server-side guards.
8. **Protected by Default**: All API endpoints require valid authentication and verified status by default, except explicit public endpoints (e.g., `/health`, auth webhooks with signature verification).
9. **Configurable Server-Side Classification**: Audience classification is executed automatically on the server by evaluating verified institutional email addresses against configurable pattern matchers (e.g., environment- or config-driven regex rules, not hardcoded in scattered code). Exact email formats are confirmed prior to activation.
10. **Controlled Manual Verification Fallback**: If an account's email cannot be classified automatically with high certainty, or if email delivery fails, the account remains strictly in `PENDING` status (zero ride-sharing privileges). Verification requires submission to a secure `verification_requests` workflow where an authorized administrator validates institutional ID documents and assigns the audience, generating an immutable record in `audit_logs`.

---

## 2. Student / Faculty Audience Isolation

The platform enforces strict segregation between the `STUDENT` and `FACULTY` communities. There must be zero cross-audience interaction.

1. **Ride Audience Alignment**: A ride’s audience column (`audience`) must strictly equal the driver's verified audience. This is enforced at the database level using composite foreign keys: `FOREIGN KEY (driver_id, audience) REFERENCES users(id, audience)`.
2. **Booking Audience Alignment**: A booking's audience must match both the ride’s audience and the passenger’s audience. A student cannot book a faculty ride, and a faculty member cannot book a student ride.
3. **Ride Alert Audience Alignment**: A ride alert’s audience must match the passenger’s audience: `FOREIGN KEY (passenger_id, audience) REFERENCES users(id, audience)`.
4. **Alert Match Audience Alignment**: An alert match job can only link an alert and a ride if their audience values are identical.
5. **Recurring Series Alignment**: Recurring ride templates and series passenger memberships must strictly enforce audience homogeneity.
6. **Server-Enforced Search Scoping**: All ride search and discovery queries must inject `WHERE audience = :authenticated_user_audience` on the server. The client cannot filter or expand this scope.
7. **Background Job Scoping**: Batch matching, ride generation, and notification dispatchers must process jobs strictly within audience boundaries.
8. **Notification Audience Leak Prevention**: In-app notifications, emails, and push notifications must never contain ride details, driver names, or route info originating from a different audience.
9. **Tamper Resistance**: Tampered API payloads (e.g., sending a faculty `ride_id` in a student’s booking request) must fail immediately with a `403 Forbidden` or `404 Not Found` (to avoid leaking resource existence).
10. **Automated Verification**: Automated integration tests must explicitly assert failure for every cross-audience permutation.

---

## 3. Seat Integrity & Concurrency

1. **Pending Bookings Do Not Reserve**: A booking in `REQUESTED` state does not consume seat capacity. It represents an intent requiring driver review.
2. **Atomic Seat Allocation**: Accepted bookings (`ACCEPTED`) consume seats. Seat allocation must happen within an atomic database transaction with row-level locking (`SELECT ... FOR UPDATE` on the ride record or conditional update `UPDATE rides SET accepted_seats = accepted_seats + :seats WHERE id = :id AND (capacity - accepted_seats) >= :seats`).
3. **Single Seat Release**: Cancelling an accepted booking releases its allocated seats exactly once (`UPDATE rides SET accepted_seats = accepted_seats - :seats`).
4. **Rejection Seat Invariance**: Rejecting a pending request does not alter seat capacity.
5. **Concurrency Safety**: Under heavy concurrent acceptance (e.g., if a driver rapidly clicks approve on multiple requests), the database constraint `CHECK (accepted_seats <= capacity)` and serializable/pessimistic locking guarantee that overbooking is physically impossible.
6. **Strict State Transitions**: Booking statuses follow an immutable state machine:
   * `REQUESTED` -> `ACCEPTED`
   * `REQUESTED` -> `REJECTED`
   * `REQUESTED` -> `CANCELLED_BY_PASSENGER`
   * `ACCEPTED` -> `CANCELLED_BY_PASSENGER`
   * `ACCEPTED` -> `CANCELLED_BY_DRIVER`
   * Transitioning from terminal states (`REJECTED`, `CANCELLED_*`) to `ACCEPTED` is prohibited.
7. **Departed / Cancelled Ride Lockout**: A ride with status `CANCELLED` or departure time in the past (`departure_time <= NOW()`) cannot accept new bookings or state changes.
8. **Idempotency & Retries**: All booking decision operations must be idempotent. Retried network calls must return the current state without duplicating seat deductions.

---

## 4. Privacy & Data Minimization

1. **Data Minimization**: Collect only what is strictly necessary for verification and ride coordination (institutional email, name, phone number, vehicle registration, pickup/drop-off areas).
2. **Coarse Location Obfuscation**: Do not expose exact residential addresses in public ride discovery. Origin and destination must display generalized landmarks or neighborhood names. Exact pickup coordinates are only revealed to passengers with `ACCEPTED` bookings.
3. **Guarded Contact Information**: Phone numbers and private communication handles are visible only between the driver and accepted passengers of that specific ride instance, and never to the general public or unaccepted requesters.
4. **Secret Protection**: Supabase `service_role` keys, database connection strings, JWT signing secrets, and API master keys must never be exposed to frontend bundles, logs, or public repositories.
5. **Administrative Auditability**: Administrative actions (verification approvals, account suspensions, user report reviews) must generate permanent, immutable audit log records.
6. **Data Retention & Erasure**: Expired alerts, temporary geocoding caches, and unaccepted requests must have automated TTL cleanup schedules.

---

## 5. Automated Testing Invariants

Unit mocks do not validate database triggers, foreign keys, or transaction isolation. All security invariants must be validated by automated integration tests executing against a real PostgreSQL + PostGIS test database:

* [ ] **Cross-Audience Search Test**: Student user query returns zero faculty rides; faculty user query returns zero student rides.
* [ ] **Cross-Audience Booking Test**: Student booking request against a faculty ride fails with `403 Forbidden` or `404 Not Found`.
* [ ] **Cross-Audience Alert Match Test**: Alert matching job never matches a student alert with a faculty ride.
* [ ] **Unauthorized Ride Modification**: Non-owner attempts to edit/cancel a ride fail with `403 Forbidden`.
* [ ] **Unauthorized Booking Decision**: Non-driver attempts to accept/reject a booking fail with `403 Forbidden`.
* [ ] **Concurrent Seat Race Condition**: 10 concurrent requests to book the last remaining seat result in exactly 1 success and 9 safe rejections without overbooking.
* [ ] **Self-Booking Prohibition**: Driver attempting to book a seat on their own ride is rejected by DB constraint and API guard.
* [ ] **Suspended User Lockout**: Suspended or rejected users cannot authenticate, search, post, or book rides.
* [ ] **Invalid State Machine Transitions**: Attempts to transition `REJECTED` -> `ACCEPTED` fail with `400 Bad Request`.
* [ ] **Notification Isolation**: Notifications generated for a ride event are delivered only to verified participants belonging to the same audience.
* [ ] **Response Field Sanitization**: Serializers strip sensitive attributes (e.g. `auth_user_id`, raw residential notes) from public endpoints.
