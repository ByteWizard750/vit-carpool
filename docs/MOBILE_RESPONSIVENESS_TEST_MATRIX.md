# VIT Carpool — Mobile Responsiveness & Multi-Device Test Matrix

**Project:** VIT Chennai Carpool Application (`@vit-carpool`)  
**Audit Date:** November 9, 2026  
**Test Engine:** Playwright Chromium Automation (`@playwright/test`)  
**Test Suite Coverage:** 26 Page Views / Views × 6 Viewports = 156 Direct Viewport Runs + Interactive Modals Suite  
**Result:** **100% PASS** (156 / 156 direct views verified with 0px horizontal overflow; all interactive modals verified)

---

## 1. Tested Viewports & Screen Profiles

| Viewport Profile | Resolution | Aspect / Device Archetype | Testing Purpose |
|:---|:---|:---|:---|
| **Small Mobile** | `320 × 700` | iPhone SE (1st gen), compact Androids | Absolute minimum responsive threshold, extreme horizontal constraint |
| **Standard Mobile** | `360 × 800` | Samsung Galaxy A/S-series, Redmi | Dominant standard Indian student mobile screen footprint |
| **Modern Mobile** | `390 × 844` | iPhone 12 / 13 / 14 / 15 standard | Mainstream iOS mobile viewport standard |
| **Large Mobile** | `430 × 932` | iPhone 14/15 Pro Max, Galaxy S Ultra | Phablet display breakpoint, multi-column cards |
| **Tablet** | `768 × 1024` | Apple iPad (portrait), Android tablets | Medium tablet breakpoint, sidebar transition, split layouts |
| **Desktop Baseline** | `1280 × 800` | Laptops / Workstations | Regression baseline ensuring zero desktop layout deterioration |

---

## 2. Comprehensive Test Execution Matrix

Status Legend:
- `PASS`: Inspected in Chromium browser, 0px horizontal overflow (`scrollWidth === clientWidth`), all buttons, labels and tables accessible.
- `B-NAV`: Five-item bottom navigation correctly visible and anchored (unauthenticated vs authenticated cohorts).
- `N/A`: Bottom navigation intentionally not rendered on tablet/desktop viewports ($\ge 768\text{px}$) or standalone admin portals.

| # | Route / Page ID | Path | Cohort | Small (320×700) | Standard (360×800) | Modern (390×844) | Large (430×932) | Tablet (768×1024) | Desktop (1280×800) |
|:---|:---|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | **Landing / Home** | `/` | Public | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 2 | **Institutional Auth** | `/auth` | Public | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 3 | **How It Works** | `/how-it-works` | Public | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 4 | **Safety Guidelines** | `/safety` | Public | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 5 | **Campus Rides Discovery** | `/rides` | Public | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 6 | **Admin Portal Login** | `/admin/login` | Public | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 7 | **Student Dashboard** | `/dashboard` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 8 | **User Profile & Trust** | `/profile` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 9 | **Notifications Center** | `/notifications` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 10 | **Offer Ride (Vehicle)** | `/offer-ride` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 11 | **Offer Ride (Cab Share)**| `/offer-ride#cab` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 12 | **My Rides (Driver/Host)** | `/my-rides` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 13 | **My Trips / Bookings** | `/bookings` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 14 | **Vehicle Management** | `/vehicles` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 15 | **Recurring Commutes** | `/recurring-commutes` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 16 | **Direct Messages / Chat**| `/messages` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 17 | **Commuter Ride Alerts** | `/ride-alerts` | Student | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (B-NAV) | PASS (N/A) | PASS (N/A) |
| 18 | **Live Ride Tracking** | `/rides/:id/track` | Student | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 19 | **Admin — Overview Tab** | `/admin` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 20 | **Admin — Users Table** | `/admin#users` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 21 | **Admin — Rides Table** | `/admin#rides` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 22 | **Admin — Bookings Table**| `/admin#bookings` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 23 | **Admin — Safety Reports**| `/admin#safety` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 24 | **Admin — Audit Ledger** | `/admin#audit` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 25 | **Admin — Health Status**| `/admin#health` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |
| 26 | **Admin — Platform Config**| `/admin#settings` | Admin | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) | PASS (N/A) |

---

## 3. Interactive Components, Modals & Dropdown Verification Matrix

| Interactive Component | Viewports Tested | Overflow | Interaction Behavior | Status | Evidence File |
|:---|:---|:---:|:---|:---:|:---|
| **Location Autocomplete Dropdown** | 320, 360, 390, 430, 768, 1280 | 0px | Transit-first ranking, dynamic boundary clamping, full name/address visibility without ellipsis | **PASS** | `docs/mobile-qa-evidence/final/autocomplete_mobile_320.png` |
| **Search Filter Modal** | 320, 390, 768, 1280 | 0px | Opens centered, full-width with safe margin padding on mobile ($\le 400\text{px}$), dismisses on Backdrop/Escape | **PASS** | `docs/mobile-qa-evidence/final/modal_filters_small-mobile.png` |
| **Ride Details Modal** | 320, 390, 768, 1280 | 0px | Route segments, driver profile, fare breakdown and join action stack cleanly | **PASS** | `docs/mobile-qa-evidence/final/modal_ride_details_small-mobile.png` |
| **Cab Seat Request Modal** | 320, 390, 768, 1280 | 0px | Dropdown count selector, notes input and confirm button render within safe viewport height | **PASS** | `docs/mobile-qa-evidence/final/modal_request_seat_small-mobile.png` |
| **Fare Update Modal** | 320, 390, 768, 1280 | 0px | Clean currency input, material change alert badge and submit action | **PASS** | `docs/mobile-qa-evidence/final/modal_update_fare_small-mobile.png` |
| **Passenger Seat Requests Modal** | 320, 390, 768, 1280 | 0px | Wrapped action buttons (`flex-wrap: wrap`) preventing cramped text on 320px screens | **PASS** | `docs/mobile-qa-evidence/final/modal_manage_bookings_small-mobile.png` |
| **Boarding Pass Modal** | 320, 390, 768, 1280 | 0px | High-contrast OTP display, route summary and safety verification badges | **PASS** | `docs/mobile-qa-evidence/final/modal_boarding_pass_small-mobile.png` |
| **Direct Messaging Chat Thread** | 320, 390, 768, 1280 | 0px | Fixed bottom send bar, autoscrolling thread viewport, mobile touch input support | **PASS** | `docs/mobile-qa-evidence/final/view_active_chat_small-mobile.png` |
| **Admin Operations Tables** | 320, 390, 768, 1280 | 0px | Horizontal swipe container (`.admin-table-container`) allowing full column access without horizontal body spill | **PASS** | `docs/mobile-qa-evidence/final/admin_moderation_table_small-mobile.png` |
| **Dev Diagnostics Drawer** | 320, 390, 768, 1280 | 0px | Smooth slide-in drawer, full diagnostic output readable on all screen sizes | **PASS** | `docs/mobile-qa-evidence/final/drawer_diagnostics_small-mobile.png` |

---

## 4. Bottom Navigation Consistency Check

| User State | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 | Verified on Mobile ($\le 640\text{px}$) |
|:---|:---|:---|:---|:---|:---|:---:|
| **Unauthenticated** | `Home` (`/`) | `Find Rides` (`/rides`) | `Guide` (`/how-it-works`) | `Safety` (`/safety`) | `Sign In` (`/auth`) | **PASS** |
| **Authenticated (Student/Faculty)** | `Dashboard` (`/dashboard`) | `Find Rides` (`/rides`) | `My Trips` (`/bookings`) | `Inbox` (`/messages`) | `Profile` (`/profile`) | **PASS** |

*All navigation items maintain 44px minimum touch targets, distinct active indicator states, and proper `z-index: 100` fixed positioning.*
