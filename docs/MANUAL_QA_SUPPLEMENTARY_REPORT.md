# Supplementary Manual QA Verification Report
**Platform:** VIT Chennai Carpool Platform (`@vit-carpool`)  
**Scope:** Deep Gap Verification Pass for Cab Sharing, Corridor Discovery, and Vehicle Rides  
**Date:** November 9, 2026  
**Auditor:** QA Engineering & Systems Integrity Audit Agent  
**Environment:** Local Development (`http://localhost:5173` Web, `http://localhost:3000` API, PostGIS 3.6.4, Chromium Automation)

---

## 1. Executive Summary

A supplementary, targeted verification pass was executed to investigate ten specific functional gaps, edge cases, and regression areas in the **Cab Sharing** and **Intelligent Route Discovery** subsystems, as well as to inspect the stability of core **Vehicle Ride** workflows.

Following the initial supplementary run, **one specific frontend issue** was identified and resolved:
- In `apps/web/src/pages/BookingsPage.tsx`, the fare acknowledgement condition was corrected from `(cab.fareRevision ?? 1) > 1 || cab.finalTotalFare != null` to `(cab.fareRevision ?? 1) > 1`.
- This ensures non-material fare changes ($\le 15\%$ and $\le ₹50/\text{seat}$) do **not** prompt the passenger for acknowledgement, while material fare changes ($> 15\%$) correctly display the acknowledgement banner and allow immediate acceptance.

Every scenario was exercised through live browser automation and authenticated API transactions, with genuine screenshots captured to `docs/manual-qa-evidence/supplementary/`.

### Key Verification Highlights:
1. **Material vs Non-Material Fare Revisions (GAP-01 & GAP-02):**
   - **Non-Material Fare Revision (₹600 $\rightarrow$ ₹630, $+5\%$):** `fareRevision` remains 1; no passenger notification is emitted; the passenger UI cleanly omits the acknowledgement banner. (**PASS**)
   - **Material Fare Increase (₹630 $\rightarrow$ ₹750, $+25\%$):** `fareRevision` increments to 2; notification is emitted; the passenger UI displays the revision notice with the `Acknowledge Updated Fare` button. Clicking the button updates the record and displays the green `Acknowledged` badge. (**PASS**)
2. **Booking & Approval After Deadline (GAP-03 & GAP-04):**
   - Both booking seat requests and organizer approvals after the cab booking deadline are strictly rejected with `HTTP 400 Bad Request`: `"The booking deadline for this cab share journey has passed."` (**PASS**)
3. **Organiser Self-Booking (GAP-05):**
   - Organiser attempts to request seats on their own shared cab are blocked with `HTTP 400 Bad Request`: `"Organisers cannot book seats on their own rides."` (**PASS**)
4. **Capacity & Concurrent Booking Protection (GAP-06):**
   - **Over-Capacity Request:** Requesting more seats than available (e.g. 5 seats on a 4-capacity cab) is rejected with `HTTP 400 Bad Request`.
   - **Simultaneous Concurrent Approval:** Tested using simultaneous `Promise.all` approval requests for the last available seat on a shared cab. The PostgreSQL serialized row-lock safely confirmed the first request (`201 Created`) and rejected the second concurrent request with `409 Conflict`: `"Insufficient seats available. Requested: 1, Available: 0."` (**PASS**)
5. **Unauthenticated Access & Privacy Invariants (GAP-07 & GAP-08):**
   - Unauthenticated requests are rejected with `HTTP 401 Unauthorized`.
   - Sensitive booking references (`cabBookingRef`) are omitted from public discovery and passenger responses, accessible exclusively to the organizer. (**PASS**)
6. **Cancellation Semantics (GAP-09):**
   - Cancelling a shared cab transitions all active bookings (both `PENDING` and `CONFIRMED`) to `CANCELLED` with reason `"Cab share journey was cancelled by organiser"` and emits role-specific alerts. (**PASS**)
7. **Vehicle Ride Lifecycle (GAP-10):**
   - Private vehicle registration, ride publishing, booking approval, OTP generation, live tracking startup, boarding OTP verification via `/verify-boarding`, and ride completion all execute with zero regressions. (**PASS**)
8. **Regression & Build Integrity:**
   - Monorepo Typecheck: **Zero errors across all 4 packages/apps** (`pnpm typecheck`).
   - Monorepo Build: **Succeeded** (`pnpm build`).
   - Backend Test Suite: **34/34 test suites passed, 620/620 tests passed** (100% pass rate).

---

## 2. Supplementary Gap Verification Matrix

| Scenario ID | Test Scenario | Expected Outcome | Actual Outcome | Status | Screenshot Evidence |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **GAP-01** | Non-material cab fare revision (₹600 $\rightarrow$ ₹630, $\le 15\%$ & $\le ₹50/\text{seat}$). | `fareRevision` remains 1; no passenger notification sent; passenger acknowledgement is NOT required or prompted. | `fareRevision` remained 1; zero notifications sent; Bookings page displayed no banner or action buttons. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-01-non-material-fare-revision.png` |
| **GAP-02** | Material cab fare increase (₹630 $\rightarrow$ ₹750, $+25\%$). | `fareRevision` increments to 2; notification emitted; passenger acknowledgement banner displayed; clicking button records acknowledgement. | `fareRevision` incremented to 2; notification delivered; passenger clicked `Acknowledge Updated Fare`, updating state to `Acknowledged`. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-02-material-fare-acknowledgement.png` |
| **GAP-03** | Attempt booking request after cab booking deadline. | Rejected with `HTTP 400 Bad Request`: `"The booking deadline for this cab share journey has passed."` | `HTTP 400 Bad Request`: `"The booking deadline for this cab share journey has passed."` Booking rejected. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-03-booking-after-deadline-rejected.png` |
| **GAP-04** | Attempt to approve a pending booking after cab booking deadline. | Organizer approval rejected with `HTTP 400 Bad Request`: `"The booking deadline for this cab share journey has passed."` | `HTTP 400 Bad Request`: `"The booking deadline for this cab share journey has passed."` Approval prevented. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-04-approve-after-deadline-rejected.png` |
| **GAP-05** | Organizer attempts self-booking on own shared cab. | Rejected with `HTTP 400 Bad Request`: `"Organisers cannot book seats on their own rides."` | `HTTP 400 Bad Request`: `"Organisers cannot book seats on their own rides."` Self-booking prevented. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-05-organiser-self-booking-rejected.png` |
| **GAP-06** | Excessive seat count & concurrent booking race condition. | Over-capacity request rejected with 400; simultaneous concurrent approvals serialized safely with one 201 and one 409 Conflict. | Over-capacity rejected with `HTTP 400`; concurrent approval race resulted in 1 confirmed (`201`) and 1 rejected (`409 Conflict: Insufficient seats`). | **PASS** | `docs/manual-qa-evidence/supplementary/supp-06-insufficient-capacity-rejected.png` |
| **GAP-07** | Unauthenticated user attempts to access protected ride/cab details. | Rejected with `HTTP 401 Unauthorized`. | `HTTP 401 Unauthorized`: `"Missing or malformed Authorization header"`. Protected data blocked. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-07-unauthenticated-access-blocked.png` |
| **GAP-08** | Verify public ride responses never expose `cabBookingRef`. | Sensitive commercial reference (`cabBookingRef`) hidden from passenger and public search; visible only to organizer. | `cabBookingRef` is omitted (`undefined`/`null`) in public DTO; visible only to organizer DTO. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-08-booking-ref-privacy-protected.png` |
| **GAP-09** | Organizer cancels cab with both PENDING and CONFIRMED bookings. | Both bookings transition to `CANCELLED` with organizer reason; both passengers receive `❌ Shared Cab Cancelled by Organiser`. | Both bookings transitioned to `CANCELLED` with reason `"Cab share journey was cancelled by organiser"`. | **PASS** | `docs/manual-qa-evidence/supplementary/supp-09-cancellation-pending-and-confirmed.png` |
| **GAP-10** | Vehicle ride full lifecycle regression verification. | Private vehicle registration $\rightarrow$ Publish $\rightarrow$ Book $\rightarrow$ Approve $\rightarrow$ Start $\rightarrow$ OTP Boarding $\rightarrow$ Complete all pass. | All vehicle ride lifecycle stages executed successfully (`BOARDED`, `IN_PROGRESS`, `COMPLETED`). | **PASS** | `docs/manual-qa-evidence/supplementary/supp-10-vehicle-ride-workflow-intact.png` |

---

## 3. Targeted Frontend Fix Applied

### File: `apps/web/src/pages/BookingsPage.tsx`
- **Issue:** The condition `(cab.fareRevision ?? 1) > 1 || cab.finalTotalFare != null` evaluated to true for non-material revisions whenever `finalTotalFare` was defined, displaying an unnecessary action banner.
- **Resolution:** Updated line 587 to strictly evaluate the material fare revision state:
  ```tsx
  const hasRevision = (cab.fareRevision ?? 1) > 1;
  ```
- **Validation:**
  - Tested in live browser with ₹600 $\rightarrow$ ₹630 (non-material): No banner displayed.
  - Tested in live browser with ₹630 $\rightarrow$ ₹750 (material): Banner displayed, acknowledged, and transition to green badge confirmed.

---

## 4. Concurrency Verification Detail

To verify concurrency handling honestly:
- Created a shared cab with total capacity 2 (1 organiser + 1 available passenger seat).
- Created two pending booking requests ($B_1$ and $B_2$) for 1 seat each.
- Dispatched simultaneous concurrent approvals to the backend using `Promise.all([approve(B1), approve(B2)])`.
- **Outcome:**
  - Request 1: `HTTP 201 Created` (`status: 'CONFIRMED'`, `availableSeats` reduced to 0).
  - Request 2: `HTTP 409 Conflict` (`"Insufficient seats available. Requested: 1, Available: 0."`).
- **Conclusion:** Database-level transaction serialization and available seats check safely prevent overbooking under concurrent contention.

---

## 5. Regression & Build Validation

```text
1. pnpm typecheck
   Scope: 4 of 5 workspace projects
   packages/db typecheck: Done in 1.2s
   packages/contracts typecheck: Done in 1.5s
   apps/api typecheck: Done in 7.3s
   apps/web typecheck: Done in 4.6s
   All projects passed without TypeScript errors.

2. pnpm build
   packages/contracts: built
   packages/db: built
   apps/api: built
   apps/web: built (dist/assets/index-ghBgWEly.js, 1,114.68 kB)
   All artifacts generated successfully.

3. API Regression Tests
   Test Suites: 34 passed, 34 total
   Tests:       620 passed, 620 total
   Time:        59.134 s
```

---

## 6. Sign-off Summary

- **Total Gaps Tested:** 10 scenarios
- **Passed Scenarios:** 10 / 10 (100%)
- **Remaining Issues:** 0
- **Vehicle Ride Regressions:** 0
- **Automated Tests:** 620 / 620 passed
- **Corridor Search Mode:** Production default (`ENDPOINT`) maintained
