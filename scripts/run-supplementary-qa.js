/**
 * Supplementary Verification Pass Runner
 * VIT Chennai Carpool Platform: Deep Gap Verification for Cab Sharing & Vehicle Rides
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';
const SUPP_DIR = path.resolve(__dirname, '../docs/manual-qa-evidence/supplementary');

if (!fs.existsSync(SUPP_DIR)) {
  fs.mkdirSync(SUPP_DIR, { recursive: true });
}

async function devLogin(email, fullName = 'QA User', audience = 'STUDENT') {
  const res = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, fullName, audience }),
  });
  if (!res.ok) throw new Error(`devLogin failed for ${email}: ${res.status}`);
  return await res.json();
}

async function injectAuth(page, token, user) {
  await page.goto(`${BASE_URL}/auth`);
  await page.evaluate(({ t, u }) => {
    localStorage.setItem('vit_auth_token', t);
    localStorage.setItem('vit_auth_user', JSON.stringify(u));
  }, { t: token, u: user });
}

async function runSupplementaryPass() {
  console.log('================================================================');
  console.log('🔍 RUNNING SUPPLEMENTARY MANUAL QA VERIFICATION PASS');
  console.log('   Target URL:', BASE_URL);
  console.log('   API URL:   ', API_URL);
  console.log('================================================================\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const timestamp = Date.now();
  const orgEmail = `qa.org.supp.${timestamp}@vitstudent.ac.in`;
  const pass1Email = `qa.pass1.supp.${timestamp}@vitstudent.ac.in`;
  const pass2Email = `qa.pass2.supp.${timestamp}@vitstudent.ac.in`;
  const driverEmail = `qa.driver.supp.${timestamp}@vitstudent.ac.in`;

  const results = [];

  const { token: orgToken, user: orgUser } = await devLogin(orgEmail, 'Aditya Organiser', 'STUDENT');
  const { token: p1Token, user: p1User } = await devLogin(pass1Email, 'Priya Passenger One', 'STUDENT');
  const { token: p2Token, user: p2User } = await devLogin(pass2Email, 'Rohan Passenger Two', 'STUDENT');
  const { token: drvToken, user: drvUser } = await devLogin(driverEmail, 'Dev Driver', 'STUDENT');

  // ===========================================================================
  // 1 & 2: Non-Material Cab Fare Revision vs Material Fare Increase
  // ===========================================================================
  console.log('\n--- SCENARIO 1 & 2: Non-Material vs Material Fare Revisions ---');
  // Step A: Organiser publishes cab share: 4 capacity, ₹600 estimated fare
  const depTime = new Date(Date.now() + 48 * 3600 * 1000);
  const deadlineTime = new Date(depTime.getTime() - 4 * 3600 * 1000);

  const pubRes = await fetch(`${API_URL}/api/rides/cab-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({
      origin: 'Tambaram Railway Station',
      destination: 'VIT Chennai Campus',
      departureTime: depTime.toISOString(),
      bookingDeadline: deadlineTime.toISOString(),
      totalCapacity: 4,
      estimatedTotalFare: 600,
      cabService: 'Uber XL',
      cabBookingRef: 'CONF-SECRET-9988',
      pickupDescription: 'Station Gate 1',
    }),
  });
  const cabRide = await pubRes.json();
  console.log('   Cab Share Published:', cabRide.id, '| Fare: ₹600');

  // Step B: Passenger 1 requests 1 seat and Organiser approves
  const bookRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Token}` },
    body: JSON.stringify({ rideId: cabRide.id, requestedSeats: 1 }),
  });
  const p1Booking = await bookRes.json();

  await fetch(`${API_URL}/api/bookings/${p1Booking.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  console.log('   Passenger 1 Confirmed on booking:', p1Booking.id);

  // Step C: Organiser updates fare to ₹630 (+5%, non-material increase <= 15% & <= ₹50/person)
  const nonMatRes = await fetch(`${API_URL}/api/rides/${cabRide.id}/cab-fare`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({ finalTotalFare: 630, reason: 'Slight traffic toll adjustment' }),
  });
  const nonMatRide = await nonMatRes.json();
  console.log('   Non-material update status:', nonMatRes.status, '| Revision:', nonMatRide.cabShare?.fareRevision);

  // Check Passenger 1 UI: Should NOT have pending acknowledgement banner
  await injectAuth(page, p1Token, p1User);
  await page.goto(`${BASE_URL}/bookings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  const hasAckBtnNonMat = await page.locator(`button[id^="btn-ack-fare-"]`).isVisible().catch(() => false);
  console.log('   Passenger 1 requires acknowledgement for non-material update:', hasAckBtnNonMat);
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-01-non-material-fare-revision.png'), fullPage: true });

  const nonMatPass = nonMatRide.cabShare?.fareRevision === 1 && !hasAckBtnNonMat;
  results.push({
    id: 'GAP-01',
    title: 'Non-Material Cab Fare Revision Handling',
    expected: 'Fare revision does not increment; passenger acknowledgement is NOT required or prompted.',
    actual: `fareRevision remained ${nonMatRide.cabShare?.fareRevision}; acknowledgement prompt displayed: ${hasAckBtnNonMat}`,
    status: nonMatPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-01-non-material-fare-revision.png',
  });

  // Step D: Organiser updates fare to ₹750 (+25%, material increase > 15%)
  const matRes = await fetch(`${API_URL}/api/rides/${cabRide.id}/cab-fare`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({ finalTotalFare: 750, reason: 'Peak hour surge and highway toll plaza' }),
  });
  const matRide = await matRes.json();
  console.log('   Material update status:', matRes.status, '| Revision:', matRide.cabShare?.fareRevision);

  // Check Passenger 1 UI: MUST have pending acknowledgement banner and button
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  const ackBtn = page.locator(`button[id^="btn-ack-fare-"]`).first();
  const hasAckBtnMat = await ackBtn.isVisible().catch(() => false);
  console.log('   Passenger 1 requires acknowledgement for material update:', hasAckBtnMat);

  if (hasAckBtnMat) {
    await ackBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-02-material-fare-acknowledgement.png'), fullPage: true });

  const matPass = matRide.cabShare?.fareRevision === 2 && hasAckBtnMat;
  results.push({
    id: 'GAP-02',
    title: 'Material Fare Increase & Passenger Acknowledgement Workflow',
    expected: 'Fare revision increments to 2; passenger is prompted to acknowledge; acknowledgement updates status.',
    actual: `fareRevision incremented to ${matRide.cabShare?.fareRevision}; acknowledgement button visible: ${hasAckBtnMat}`,
    status: matPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-02-material-fare-acknowledgement.png',
  });

  // ===========================================================================
  // 3 & 4: Booking & Approval After Cab Booking Deadline
  // ===========================================================================
  console.log('\n--- SCENARIO 3 & 4: Booking & Approval After Deadline ---');
  // Create cab share with departure in 2 hours, deadline 2 seconds in the future
  const deadlineCabRes = await fetch(`${API_URL}/api/rides/cab-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({
      origin: 'Tambaram Railway Station',
      destination: 'VIT Chennai Campus',
      departureTime: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      bookingDeadline: new Date(Date.now() + 2500).toISOString(), // 2.5s from now
      totalCapacity: 4,
      estimatedTotalFare: 500,
    }),
  });
  const deadlineCab = await deadlineCabRes.json();

  // Create pending booking immediately before deadline expires
  const pendingBeforeDeadlineRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Token}` },
    body: JSON.stringify({ rideId: deadlineCab.id, requestedSeats: 1 }),
  });
  const pendingBooking = await pendingBeforeDeadlineRes.json();
  console.log('   Pending booking created before deadline:', pendingBooking.id);

  // Wait 3.5 seconds so deadline passes
  console.log('   Waiting 3.5s for deadline to elapse...');
  await new Promise((resolve) => setTimeout(resolve, 3500));

  // 3. Attempt NEW booking after deadline
  const lateBookingRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Token}` },
    body: JSON.stringify({ rideId: deadlineCab.id, requestedSeats: 1 }),
  });
  const lateBookingJson = await lateBookingRes.json();
  console.log('   Late booking response status:', lateBookingRes.status, '| Message:', lateBookingJson.message);

  // Render in browser
  await injectAuth(page, p2Token, p2User);
  await page.goto(`${BASE_URL}/rides`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-03-booking-after-deadline-rejected.png'), fullPage: true });

  const lateBookingPass =
    lateBookingRes.status === 400 &&
    lateBookingJson.message?.includes('booking deadline for this cab share journey has passed');

  results.push({
    id: 'GAP-03',
    title: 'Booking Request Attempt After Cab Booking Deadline',
    expected: 'HTTP 400 Bad Request with message "The booking deadline for this cab share journey has passed."',
    actual: `HTTP ${lateBookingRes.status}: "${lateBookingJson.message}"`,
    status: lateBookingPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-03-booking-after-deadline-rejected.png',
  });

  // 4. Attempt APPROVAL of pending booking after deadline
  const lateApproveRes = await fetch(`${API_URL}/api/bookings/${pendingBooking.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  const lateApproveJson = await lateApproveRes.json();
  console.log('   Late approval response status:', lateApproveRes.status, '| Message:', lateApproveJson.message);

  await injectAuth(page, orgToken, orgUser);
  await page.goto(`${BASE_URL}/my-rides`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-04-approve-after-deadline-rejected.png'), fullPage: true });

  const lateApprovePass =
    lateApproveRes.status === 400 &&
    lateApproveJson.message?.includes('booking deadline for this cab share journey has passed');

  results.push({
    id: 'GAP-04',
    title: 'Approval of Pending Booking After Cab Booking Deadline',
    expected: 'HTTP 400 Bad Request with message "The booking deadline for this cab share journey has passed."',
    actual: `HTTP ${lateApproveRes.status}: "${lateApproveJson.message}"`,
    status: lateApprovePass ? 'PASS' : 'FAIL',
    screenshot: 'supp-04-approve-after-deadline-rejected.png',
  });

  // ===========================================================================
  // 5: Organiser Self-Booking Attempt
  // ===========================================================================
  console.log('\n--- SCENARIO 5: Organiser Self-Booking Attempt ---');
  const selfBookRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({ rideId: cabRide.id, requestedSeats: 1 }),
  });
  const selfBookJson = await selfBookRes.json();
  console.log('   Self-booking status:', selfBookRes.status, '| Message:', selfBookJson.message);

  await page.goto(`${BASE_URL}/rides`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-05-organiser-self-booking-rejected.png'), fullPage: true });

  const selfBookPass =
    selfBookRes.status === 400 &&
    selfBookJson.message?.includes('Organisers cannot book seats on their own rides');

  results.push({
    id: 'GAP-05',
    title: 'Organiser Self-Booking Prevention',
    expected: 'HTTP 400 Bad Request: "Organisers cannot book seats on their own rides."',
    actual: `HTTP ${selfBookRes.status}: "${selfBookJson.message}"`,
    status: selfBookPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-05-organiser-self-booking-rejected.png',
  });

  // ===========================================================================
  // 6: Insufficient Capacity & Concurrent Booking Overflow
  // ===========================================================================
  console.log('\n--- SCENARIO 6: Insufficient Capacity & Booking Overflow ---');
  // A. Request more seats than available (available = 2, request = 3)
  const overCapRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Token}` },
    body: JSON.stringify({ rideId: cabRide.id, requestedSeats: 5 }), // total capacity is 4
  });
  const overCapJson = await overCapRes.json();
  console.log('   Over-capacity request status:', overCapRes.status, '| Message:', overCapJson.message);

  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-06-insufficient-capacity-rejected.png'), fullPage: true });

  const overCapPass =
    overCapRes.status === 400 &&
    overCapJson.message?.includes('exceed currently available seats');

  results.push({
    id: 'GAP-06',
    title: 'Excessive Seat Count & Capacity Integrity',
    expected: 'HTTP 400 Bad Request rejecting request seat counts greater than available seats.',
    actual: `HTTP ${overCapRes.status}: "${overCapJson.message}"`,
    status: overCapPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-06-insufficient-capacity-rejected.png',
  });

  // ===========================================================================
  // 7: Unauthenticated Access Guarding
  // ===========================================================================
  console.log('\n--- SCENARIO 7: Unauthenticated Access Guarding ---');
  const unauthRes = await fetch(`${API_URL}/api/rides/${cabRide.id}`);
  const unauthJson = await unauthRes.json();
  console.log('   Unauthenticated GET status:', unauthRes.status, '| Message:', unauthJson.message);

  const unauthPass = unauthRes.status === 401;
  results.push({
    id: 'GAP-07',
    title: 'Unauthenticated Access Protection',
    expected: 'HTTP 401 Unauthorized for unauthenticated requests to protected endpoints.',
    actual: `HTTP ${unauthRes.status}: "${unauthJson.message}"`,
    status: unauthPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-07-unauthenticated-access-blocked.png',
  });

  // ===========================================================================
  // 8: Privacy of Cab Booking References
  // ===========================================================================
  console.log('\n--- SCENARIO 8: Cab Booking Reference Privacy ---');
  // Passenger 1 queries ride details: cabBookingRef must be undefined
  const publicRideRes = await fetch(`${API_URL}/api/rides/${cabRide.id}`, {
    headers: { Authorization: `Bearer ${p1Token}` },
  });
  const publicRideJson = await publicRideRes.json();
  const hasSecretInPublic =
    publicRideJson.cabShare?.cabBookingRef !== undefined &&
    publicRideJson.cabShare?.cabBookingRef !== null;

  // Organiser queries ride details: cabBookingRef is accessible
  const orgRideRes = await fetch(`${API_URL}/api/rides/${cabRide.id}`, {
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  const orgRideJson = await orgRideRes.json();
  const orgHasSecret = orgRideJson.cabShare?.cabBookingRef === 'CONF-SECRET-9988';

  console.log('   Public response leaks cabBookingRef:', hasSecretInPublic);
  console.log('   Organiser response contains cabBookingRef:', orgHasSecret);

  const refPrivacyPass = !hasSecretInPublic && orgHasSecret;
  results.push({
    id: 'GAP-08',
    title: 'Sensitive Booking Reference Exclusion from Public Discovery',
    expected: 'cabBookingRef omitted from public/passenger summaries; visible strictly to organiser.',
    actual: `Leaked to passenger: ${hasSecretInPublic}; Visible to organiser: ${orgHasSecret}`,
    status: refPrivacyPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-08-booking-ref-privacy-protected.png',
  });

  // ===========================================================================
  // 9: Cancellation Handling for Both Pending & Confirmed Bookings
  // ===========================================================================
  console.log('\n--- SCENARIO 9: Cancellation Handling for Pending & Confirmed Bookings ---');
  // Create fresh cab ride with 1 confirmed booking and 1 pending booking
  const cancelTestCabRes = await fetch(`${API_URL}/api/rides/cab-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({
      origin: 'Tambaram Railway Station',
      destination: 'VIT Chennai Campus',
      departureTime: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
      bookingDeadline: new Date(Date.now() + 34 * 3600 * 1000).toISOString(),
      totalCapacity: 4,
      estimatedTotalFare: 600,
    }),
  });
  const cancelCab = await cancelTestCabRes.json();

  // Booking 1 (Confirmed)
  const b1Res = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Token}` },
    body: JSON.stringify({ rideId: cancelCab.id, requestedSeats: 1 }),
  });
  const b1 = await b1Res.json();
  await fetch(`${API_URL}/api/bookings/${b1.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgToken}` },
  });

  // Booking 2 (Pending)
  const b2Res = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p2Token}` },
    body: JSON.stringify({ rideId: cancelCab.id, requestedSeats: 1 }),
  });
  const b2 = await b2Res.json();

  // Organiser Cancels Cab
  const cancelRideRes = await fetch(`${API_URL}/api/rides/${cancelCab.id}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${orgToken}` },
  });
  console.log('   Ride cancellation status:', cancelRideRes.status);

  // Check both bookings
  const b1After = await (await fetch(`${API_URL}/api/bookings/${b1.id}`, { headers: { Authorization: `Bearer ${p1Token}` } })).json();
  const b2After = await (await fetch(`${API_URL}/api/bookings/${b2.id}`, { headers: { Authorization: `Bearer ${p2Token}` } })).json();

  console.log('   Confirmed booking after cancellation status:', b1After.status, '| Reason:', b1After.cancellationReason);
  console.log('   Pending booking after cancellation status:', b2After.status, '| Reason:', b2After.cancellationReason);

  await injectAuth(page, p2Token, p2User);
  await page.goto(`${BASE_URL}/bookings`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-09-cancellation-pending-and-confirmed.png'), fullPage: true });

  const cancelBothPass =
    b1After.status === 'CANCELLED' &&
    b2After.status === 'CANCELLED' &&
    b1After.cancellationReason === 'Cab share journey was cancelled by organiser' &&
    b2After.cancellationReason === 'Cab share journey was cancelled by organiser';

  results.push({
    id: 'GAP-09',
    title: 'Cancellation Handling of Pending & Confirmed Bookings',
    expected: 'Both pending and confirmed bookings transition to CANCELLED with organiser cancellation explanation.',
    actual: `Confirmed: ${b1After.status} ("${b1After.cancellationReason}"); Pending: ${b2After.status} ("${b2After.cancellationReason}")`,
    status: cancelBothPass ? 'PASS' : 'FAIL',
    screenshot: 'supp-09-cancellation-pending-and-confirmed.png',
  });

  // ===========================================================================
  // 10: Existing Vehicle Ride Lifecycle Regression Verification
  // ===========================================================================
  console.log('\n--- SCENARIO 10: Existing Vehicle Ride Lifecycle Regression ---');
  // Register vehicle
  const vehRes = await fetch(`${API_URL}/api/vehicles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drvToken}` },
    body: JSON.stringify({
      make: 'Hyundai',
      model: 'Verna',
      registrationNumber: `TN09QC${Math.floor(1000 + Math.random() * 9000)}`,
      capacity: 4,
      color: 'Black',
    }),
  });
  const veh = await vehRes.json();
  console.log('   Driver Vehicle Registered:', veh.id);

  // Publish vehicle ride
  const vRideRes = await fetch(`${API_URL}/api/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drvToken}` },
    body: JSON.stringify({
      vehicleId: veh.id,
      origin: 'Tambaram Railway Station',
      originAddress: 'GST Road, Tambaram, Chennai',
      originLatitude: 12.9249,
      originLongitude: 80.1171,
      destination: 'VIT Chennai Campus',
      destinationAddress: 'Vandalur-Kelambakkam Road, Chennai',
      destinationLatitude: 12.8406,
      destinationLongitude: 80.1534,
      departureTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      availableSeats: 3,
      costPerSeat: 50,
      maxDetourMinutes: 15,
    }),
  });
  const vRide = await vRideRes.json();
  console.log('   Vehicle Ride Published:', vRide.id, '| Status:', vRide.status);

  // Passenger 1 requests 1 seat
  const vBookRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p1Token}` },
    body: JSON.stringify({ rideId: vRide.id, requestedSeats: 1 }),
  });
  const vBooking = await vBookRes.json();

  // Driver approves booking
  const vApproveRes = await fetch(`${API_URL}/api/bookings/${vBooking.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${drvToken}` },
  });
  const vApproved = await vApproveRes.json();
  console.log('   Vehicle booking approved status:', vApproveRes.status, '| Booking status:', vApproved.status);

  // Passenger gets boarding OTP
  const otpRes = await fetch(`${API_URL}/api/bookings/${vBooking.id}/boarding-otp`, {
    headers: { Authorization: `Bearer ${p1Token}` },
  });
  const otpJson = await otpRes.json();
  console.log('   Passenger boarding OTP retrieved:', otpJson.otp ? 'YES' : 'NO');

  // Driver starts ride
  const startRideRes = await fetch(`${API_URL}/api/rides/${vRide.id}/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${drvToken}` },
  });
  const startedRide = await startRideRes.json();
  console.log('   Driver ride started status:', startedRide.status);

  // Driver boards passenger with OTP
  const boardRes = await fetch(`${API_URL}/api/bookings/${vBooking.id}/verify-boarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${drvToken}` },
    body: JSON.stringify({ otp: otpJson.rawOtp || otpJson.otp.replace(/\s+/g, '') }),
  });
  const boardedJson = await boardRes.json();
  console.log('   Passenger boarded with OTP:', boardedJson.boardingStatus);

  // Driver completes ride
  const completeRes = await fetch(`${API_URL}/api/rides/${vRide.id}/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${drvToken}` },
  });
  const completedRide = await completeRes.json();
  console.log('   Driver ride completed:', completedRide.status);

  await injectAuth(page, drvToken, drvUser);
  await page.goto(`${BASE_URL}/my-rides`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-10-vehicle-ride-workflow-intact.png'), fullPage: true });

  const vehicleLifecyclePass =
    vRide.status === 'SCHEDULED' &&
    vApproved.status === 'CONFIRMED' &&
    startedRide.status === 'IN_PROGRESS' &&
    boardedJson.boardingStatus === 'BOARDED' &&
    completedRide.status === 'COMPLETED';

  results.push({
    id: 'GAP-10',
    title: 'Vehicle Ride Full Lifecycle Regression Verification',
    expected: 'Vehicle registration, publishing, approval, OTP boarding, and ride completion execute without regression.',
    actual: `Publish: ${vRide.status}; Approve: ${vApproved.status}; Start: ${startedRide.status}; Board: ${boardedJson.boardingStatus}; Complete: ${completedRide.status}`,
    status: vehicleLifecyclePass ? 'PASS' : 'FAIL',
    screenshot: 'supp-10-vehicle-ride-workflow-intact.png',
  });

  await browser.close();

  console.log('\n================================================================');
  console.log('🏁 SUPPLEMENTARY VERIFICATION RESULTS:');
  results.forEach((r) => {
    console.log(`   [${r.status}] ${r.id}: ${r.title}`);
  });
  console.log('================================================================\n');

  return results;
}

runSupplementaryPass().catch((err) => {
  console.error('Fatal supplementary run error:', err);
  process.exit(1);
});
