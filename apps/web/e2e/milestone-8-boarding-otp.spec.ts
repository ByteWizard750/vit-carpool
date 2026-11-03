import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 8: Secure Boarding OTP & Verification Flow', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m8_screenshots',
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Complete End-to-End OTP Boarding Lifecycle with Screenshot Capture', async ({
    page: driverPage,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m8.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passengerEmail = `m8.passenger.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 09 XY ${Math.floor(1000 + Math.random() * 9000)}`;

    // ───────────────────────────────────────────────────────────────────────────
    // 1. Setup Driver Session & Register Vehicle
    // ───────────────────────────────────────────────────────────────────────────
    const { token: driverToken, user: driverUser } = await loginAsDevUser(driverPage, {
      email: driverEmail,
      fullName: 'Rohan Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vehicleRes = await driverPage.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Hyundai',
        model: 'Creta EV',
        color: 'Polar White',
        registrationNumber: regNum,
        capacity: 4,
      },
    });
    expect(vehicleRes.ok()).toBeTruthy();
    const vehicle = await vehicleRes.json();

    // ───────────────────────────────────────────────────────────────────────────
    // 2. Driver Publishes Ride
    // ───────────────────────────────────────────────────────────────────────────
    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const rideRes = await driverPage.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station Bus Stop',
        destination: 'VIT Chennai Campus, Vandalur',
        departureTime,
        availableSeats: 3,
        originLatitude: 12.9249,
        originLongitude: 80.1171,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        costPerSeat: 50,
      },
    });
    expect(rideRes.ok()).toBeTruthy();
    const ride = await rideRes.json();

    // ───────────────────────────────────────────────────────────────────────────
    // 3. Setup Passenger Session & Request Booking
    // ───────────────────────────────────────────────────────────────────────────
    const passengerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const passengerPage = await passengerContext.newPage();

    const { token: passengerToken, user: passengerUser } = await loginAsDevUser(passengerPage, {
      email: passengerEmail,
      fullName: 'Priya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const bookRes = await passengerPage.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
        pickupAddress: 'Tambaram Sanatorium Bus Stop',
        pickupLatitude: 12.9312,
        pickupLongitude: 80.1245,
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const booking = await bookRes.json();

    // ───────────────────────────────────────────────────────────────────────────
    // 4. Driver Approves Booking (Generates Secure Boarding OTP)
    // ───────────────────────────────────────────────────────────────────────────
    const approveRes = await driverPage.request.post(`${apiBase}/bookings/${booking.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(approveRes.ok()).toBeTruthy();

    // ───────────────────────────────────────────────────────────────────────────
    // 5. Driver Starts Ride -> IN_PROGRESS
    // ───────────────────────────────────────────────────────────────────────────
    const startRes = await driverPage.request.post(`${apiBase}/rides/${ride.id}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(startRes.ok()).toBeTruthy();

    // ───────────────────────────────────────────────────────────────────────────
    // 6. Passenger Views Tracking Page & Inspects Boarding OTP Card
    // ───────────────────────────────────────────────────────────────────────────
    await passengerPage.goto(`http://localhost:5173/rides/${ride.id}/track`);
    await passengerPage.waitForLoadState('networkidle');

    // Wait for Passenger Boarding OTP card to be visible
    const otpCard = passengerPage.locator('#passenger-boarding-otp-card');
    await expect(otpCard).toBeVisible({ timeout: 10000 });

    const otpDisplay = passengerPage.locator('#passenger-otp-display');
    await expect(otpDisplay).toBeVisible({ timeout: 10000 });
    await expect(otpDisplay).not.toHaveText('••••••', { timeout: 10000 });

    const displayedOtpText = (await otpDisplay.textContent()) || '';
    const cleanOtp = displayedOtpText.replace(/\s+/g, '');
    console.log(`[E2E] Passenger displayed OTP: ${displayedOtpText} (Clean: ${cleanOtp})`);
    expect(cleanOtp).toMatch(/^\d{6}$/);

    // Capture Screenshot 1: Passenger with active Boarding OTP
    await passengerPage.screenshot({
      path: path.join(screenshotDir, '01_passenger_boarding_otp_display.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 7. Driver Opens Tracking Page -> Sees Passenger & Clicks "Verify OTP"
    // ───────────────────────────────────────────────────────────────────────────
    await driverPage.goto(`http://localhost:5173/rides/${ride.id}/track`);
    await driverPage.waitForLoadState('networkidle');

    // Boarding progress counter shows 0 / 1 Verified
    const progressPill = driverPage.locator('#driver-boarding-progress-pill');
    await expect(progressPill).toBeVisible({ timeout: 10000 });
    await expect(progressPill).toContainText('0 / 1');

    // Passenger verify button is visible
    const verifyOtpBtn = driverPage.locator(`#btn-verify-otp-${booking.id}`);
    await expect(verifyOtpBtn).toBeVisible();

    // Driver clicks "Verify OTP"
    await verifyOtpBtn.click();

    // Modal appears
    const verifyModal = driverPage.locator('#verify-boarding-otp-modal');
    await expect(verifyModal).toBeVisible();

    // Capture Screenshot 2: Driver Verify Boarding OTP Modal
    await driverPage.screenshot({
      path: path.join(screenshotDir, '02_driver_verify_otp_modal_open.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 8. Driver Enters Invalid OTP -> Verification Fails & Error Banner Displays
    // ───────────────────────────────────────────────────────────────────────────
    const otpInput = driverPage.locator('#input-boarding-otp');
    await otpInput.fill('000000'); // Wrong OTP

    const submitOtpBtn = driverPage.locator('#btn-submit-verify-otp');
    await submitOtpBtn.click();

    const errorBanner = driverPage.locator('#otp-verify-error');
    await expect(errorBanner).toBeVisible({ timeout: 6000 });
    await expect(errorBanner).toContainText('attempt(s) remaining');

    // Capture Screenshot 3: Driver Invalid OTP Error Banner
    await driverPage.screenshot({
      path: path.join(screenshotDir, '03_driver_invalid_otp_error.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 9. Driver Enters Correct Passenger OTP -> Verification Succeeds
    // ───────────────────────────────────────────────────────────────────────────
    await otpInput.fill(cleanOtp);
    await submitOtpBtn.click();

    // Success banner displays
    const successBanner = driverPage.locator('#otp-verify-success');
    await expect(successBanner).toBeVisible({ timeout: 6000 });
    await expect(successBanner).toContainText('Verified');

    // Capture Screenshot 4: Driver OTP Verification Success
    await driverPage.screenshot({
      path: path.join(screenshotDir, '04_driver_otp_verified_success.png'),
    });

    // Modal automatically closes after success
    await expect(verifyModal).not.toBeVisible({ timeout: 8000 });

    // Progress pill updates to 1 / 1 Verified
    await expect(progressPill).toContainText('1 / 1 Verified');

    // Passenger item now shows "Boarded"
    await expect(driverPage.locator('text=Boarded').first()).toBeVisible();

    // Capture Screenshot 5: Driver Confirmed Boarded Roster
    await driverPage.screenshot({
      path: path.join(screenshotDir, '05_driver_roster_boarded.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 10. Passenger Screen Real-Time Verification Check
    // ───────────────────────────────────────────────────────────────────────────
    // Passenger screen automatically updates to "Boarding Verified"
    const passengerVerifiedBanner = passengerPage.locator('text=Boarding Verified');
    await expect(passengerVerifiedBanner).toBeVisible({ timeout: 8000 });

    // Capture Screenshot 6: Passenger Verified Boarding Banner
    await passengerPage.screenshot({
      path: path.join(screenshotDir, '06_passenger_verified_boarded.png'),
    });

    console.log('[E2E] All Milestone 8 OTP boarding screenshots successfully captured in:', screenshotDir);
    await passengerContext.close();
  });
});
