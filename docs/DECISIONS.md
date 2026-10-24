# Architecture Decision Records & Unresolved Decisions Log

This document tracks all formal architectural decisions (ADRs) as well as the active registry of unresolved questions and risk factors that require confirmation.

---

## 1. Settled Architecture Decision Records (ADRs)

### ADR-001: Modular Monolith Architecture
* **Status**: Accepted
* **Context**: The platform is built and maintained by a solo developer. Microservices introduce complex service discovery, network latency, distributed transactions, and high operational overhead.
* **Decision**: Adopt a modular monolith backend in NestJS with clean domain boundaries (`auth`, `users`, `vehicles`, `rides`, `bookings`, `alerts`, `notifications`, `geo`).
* **Consequences**: Easy local development, zero inter-service network latency, atomic transactions within PostgreSQL, and straightforward deployment.

### ADR-002: Progressive Web App (PWA) Mobile-First Strategy
* **Status**: Accepted
* **Context**: Developing, maintaining, and deploying separate iOS, Android, and web codebases is impractical for a solo engineer and delays user feedback.
* **Decision**: Build a single responsive web application (React 19 + Vite + TypeScript) with a PWA manifest, service worker caching, and touch-optimized mobile interfaces.
* **Consequences**: Immediate deployment without App Store / Play Store approval delays, single codebase to maintain, universal accessibility across devices.

### ADR-003: PostgreSQL + PostGIS with pg-boss for Jobs
* **Status**: Accepted
* **Context**: Adding Redis solely for queuing introduces extra monthly hosting expenses and another failure mode. Geospatial candidate matching is performance-critical.
* **Decision**: Use PostgreSQL 16+ as the single data store, with PostGIS for spatial queries and `pg-boss` for transactional asynchronous job queues.
* **Consequences**: Zero added database infrastructure costs, transactional job enqueuing alongside database updates, robust spatial indexing via GIST.

### ADR-004: Supabase Auth with Server-Side JWT Verification
* **Status**: Accepted
* **Context**: Building custom authentication (password hashing, email delivery, rate limiting, token refresh) is error-prone and insecure.
* **Decision**: Use Supabase Auth for identity generation and email verification, while verifying JWTs server-side in NestJS against authoritative database user records. The client runtime is never trusted for audience or roles.
* **Consequences**: Free-tier authentication with high security, decoupled from the main backend logic.

### ADR-005: Configurable Institutional Email Verification with Controlled Manual Fallback
* **Status**: Accepted
* **Context**: VIT Chennai students and faculty use distinguishable institutional email formats (to be confirmed before implementation). The platform requires strict audience separation without allowing users to self-assign or modify their audience. However, relying on brittle, hardcoded patterns could break onboarding if email formats vary or edge cases arise.
* **Decision**:
  1. Implement **automated server-side audience classification** using verified institutional email addresses once exact formats are confirmed.
  2. The email pattern matching logic must be **configurable** (e.g., environment- or config-driven regexes) rather than hardcoded in application logic.
  3. **Zero Client Audience Selection**: Users are strictly prohibited from selecting or modifying their own audience.
  4. Implement a **controlled manual verification fallback** (`verification_requests` workflow) for accounts whose email cannot be automatically classified or where institutional email OTP is blocked. Users upload campus ID proof, their account remains in `PENDING` status, and an authorized administrator approves/rejects with audit logging.
* **Consequences**: Zero risk of audience spoofing, full resilience to changing domain patterns, and a dependable operational escape hatch for unclassified users.

---

## 2. Unresolved Decisions & Open Questions Log

| # | Question & Description | Why It Matters | Available Options | Confirmed Direction / Decision | Blocks Implementation? | Owner / Confirming Party |
|---|------------------------|----------------|-------------------|--------------------------------|------------------------|--------------------------|
| **D-01** | **Institutional Email Domain Patterns**:<br/>What exact email patterns differentiate students vs. faculty at VIT Chennai? | Enables automatic classification into `STUDENT` or `FACULTY` audience upon verified email login. | **Option A**: Distinguishable domain/subdomain or prefix formats (e.g. `@vitstudent.ac.in` vs `@vit.ac.in`).<br/>**Option B**: Manual verification only. | **Decision Confirmed**: VIT Chennai students and faculty use distinguishable institutional email formats. Exact formats will be confirmed before implementation. Verification logic must be configurable. Automatic classification will be used; users will NEVER choose/edit their audience. Controlled manual verification fallback will be maintained. | **Blocks Milestone 2 regex configuration**. | Developer / Campus Administration |
| **D-02** | **Alternative Identity Verification / Manual Fallback**:<br/>How will users be verified if institutional email patterns cannot be automatically classified or OTP fails? | Edge cases (new staff, unrecognized departments, email delivery issues) must not leave legitimate users stranded without recourse. | **Option A**: Controlled manual verification workflow with campus ID card upload & admin review.<br/>**Option B**: In-person campus verification desk.<br/>**Option C**: Strict rejection. | **Decision Confirmed**: Provide a controlled manual verification workflow. Unverified user submits institutional ID card image to `verification_requests` queue. User remains in `PENDING` state (zero ride access). Admin reviews and assigns verified audience, with immutable entry in `audit_logs`. | **Resolved for Milestone 2 design**. | Developer |
| **D-03** | **Institutional Branding & Approval**:<br/>Does the project have formal permission to use VIT trademarks and recruit on campus? | Using university names/logos without approval risks trademark warnings or campus disciplinary action. | **Option A**: Seek formal incubation/approval from VIT Chennai administration.<br/>**Option B**: Launch as an independent, unofficial student-run platform with clear disclaimers.<br/>**Option C**: Rebrand as a generic community carpooling platform with campus destination focus. | Display prominent disclaimer: *"Independent student project not officially affiliated with or endorsed by VIT Chennai."* Seek student council endorsement. | **No** (Blocks public pilot marketing only). | Developer |
| **D-04** | **Cost-Sharing Rules & Limits**:<br/>What formula or ceiling governs passenger cost-sharing to avoid illegal commercial ride-hailing? | Motor Vehicles Act and local transport regulations strictly prohibit unlicensed commercial taxi operations. True carpooling must be non-profit cost-sharing. | **Option A**: Strict maximum cost per km based on fuel costs (e.g., max ₹3-₹4/km divided by capacity).<br/>**Option B**: Fixed flat suggested brackets (e.g. ₹50, ₹100 for campus-to-city corridors).<br/>**Option C**: Free ride platform with zero financial exchange in MVP. | Provide a non-binding suggested contribution based on standard fuel rate per km, with an explicit hard cap. No in-app payment transactions in MVP. | **Blocks Milestone 3 pricing logic**. | Developer / Legal Review |
| **D-05** | **Pending Booking Expiration Window**:<br/>When should unaccepted booking requests automatically expire? | Prevents passengers from being stranded waiting for an inactive driver, or seats being locked right before departure. | **Option A**: 6 hours after request.<br/>**Option B**: Auto-expire 30 minutes before scheduled ride departure.<br/>**Option C**: Both (whichever comes first). | Whichever comes first: 12 hours from request OR 45 minutes prior to ride departure. | **Blocks Milestone 4**. | Developer |
| **D-06** | **Privacy & Data Retention Horizon**:<br/>How long should completed/cancelled rides and locations be retained? | Compliance with privacy standards and personal safety considerations. Storing long historical GPS trajectories creates privacy liabilities. | **Option A**: Retain indefinitely for user ride histories.<br/>**Option B**: Prune spatial route details 30 days after ride completion, keeping aggregate stats.<br/>**Option C**: Delete all booking logs after 90 days. | Retain booking records for 60 days for dispute safety, but truncate fine coordinates and route polylines 14 days after completion. | **Blocks Milestone 7**. | Developer |
| **D-07** | **Geocoding & Map Providers**:<br/>Which map tile and routing engine fits the zero-cost/low-cost budget? | Google Maps API can easily incur unexpected recurring charges. | **Option A**: MapLibre GL + OpenStreetMap vector tiles (Protomaps/OpenMapTiles) + OSRM/Valhalla.<br/>**Option B**: Mapbox free tier (50k loads/month).<br/>**Option C**: OpenRouteService free tier. | MapLibre GL with Carto/OSM raster or vector tiles, and self-hosted OSRM or OpenRouteService free tier for routing. PostGIS handles spatial pre-filtering. | **Blocks Milestone 3 UI/Routing**. | Developer |
| **D-08** | **Database & Local PostGIS Setup Strategy**:<br/>How will the PostgreSQL/PostGIS environment be provisioned for local development and testing? | Docker is not currently installed on the host macOS machine. PostGIS is required for all geospatial testing. | **Option A**: Remote Supabase project (managed PostgreSQL 15+ with PostGIS).<br/>**Option B**: Install OrbStack or Docker Desktop on Mac.<br/>**Option C**: Native Homebrew (`brew install postgresql@16 postgis`). | **Status**: Developer is currently consulting Claude before selecting an approach. Implementation on hold until confirmed. | **Blocks Milestone 1 setup**. | Developer (consulting Claude) |
| **D-09** | **Policy on Minors / Safety Guardrails**:<br/>Will 1st-year students under age 18 be permitted, and are emergency contacts required? | Safety and legal liability in case of roadside emergencies. | **Option A**: Require emergency contact name and phone number on all student profiles.<br/>**Option B**: Minimum age 18 verification.<br/>**Option C**: SOS/Share Live Trip button for all active rides. | Require emergency contact phone number on registration. Add a "Share Trip Status" link for active rides. | **Blocks Milestone 2 & 7**. | Developer |
| **D-10** | **Pilot Launch Readiness Criteria**:<br/>What metric defines readiness for public campus testing? | Releasing prematurely could harm trust if rides fail or security leaks occur. | **Option A**: 100% automated test suite passing + 10 manual simulated rides with real devices.<br/>**Option B**: Closed alpha with 10 faculty members and 10 students.<br/>**Option C**: Bug bounty / security review sign-off. | 100% security test pass rate + closed alpha test with 5 student drivers and 5 faculty drivers across 2 campus corridors. | **Blocks Milestone 7 rollout**. | Developer |
