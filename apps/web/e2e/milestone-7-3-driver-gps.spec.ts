import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 7.3: Driver GPS Tracking Interface', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve('/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m7_screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('M7.3 - Consent modal, permission denial safety, active tracking HUD, and end ride completion', async ({
    page,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m73.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passengerEmail = `m73.passenger.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 22 EF ${Math.floor(1000 + Math.random() * 9000)}`;
    const regNumClean = regNum.replace(/\s+/g, '');

    // 1. Authenticate driver & publish a ride
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Siddharth Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vehicleRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Hyundai',
        model: 'i20',
        color: 'Polar White',
        registrationNumber: regNum,
        capacity: 5,
      },
    });
    expect(vehicleRes.ok()).toBeTruthy();
    const vehicle = await vehicleRes.json();

    const departureTime = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const rideRes = await page.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
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
    const rideId = ride.id;

    // 2. Confirmed passenger books
    const passengerContext = await browser.newContext();
    const passengerPage = await passengerContext.newPage();
    const { token: passengerToken } = await loginAsDevUser(passengerPage, {
      email: passengerEmail,
      fullName: 'Pooja Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const bookRes = await passengerPage.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
      data: {
        rideId,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Crescent Gate',
        pickupLatitude: 12.8890,
        pickupLongitude: 80.0825,
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const booking = await bookRes.json();

    // Driver approves booking
    const approveRes = await page.request.post(`${apiBase}/bookings/${booking.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(approveRes.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Scenario A: Permission Denied Safety Check
    // -------------------------------------------------------------------------
    // Create driver context without geolocation permissions
    const restrictedContext = await browser.newContext({ permissions: [] });
    const restrictedPage = await restrictedContext.newPage();

    await loginAsDevUser(restrictedPage, {
      email: driverEmail,
      fullName: 'Siddharth Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await restrictedPage.goto(`/rides/${rideId}/track`);
    await restrictedPage.waitForLoadState('networkidle');

    // Verify Scheduled status
    await expect(restrictedPage.locator('#tracking-status-pill')).toContainText('Scheduled');

    // Click START RIDE
    const startBtn = restrictedPage.locator('#btn-start-ride');
    await expect(startBtn).toBeVisible();

    // Capture screenshot: Driver Pre-Start with START RIDE button
    await restrictedPage.screenshot({
      path: path.join(screenshotDir, 'driver_pre_start_scheduled.png'),
      fullPage: true,
    });

    await startBtn.click();

    // Verify Consent Modal and exact wording
    const consentModal = restrictedPage.locator('#start-consent-modal');
    await expect(consentModal).toBeVisible();
    await expect(consentModal).toContainText('Your live location will be shared with passengers who have confirmed bookings for this ride.');

    // Capture screenshot: Driver Consent Dialog
    await restrictedPage.screenshot({
      path: path.join(screenshotDir, 'driver_start_consent_modal.png'),
    });

    // In restricted context without geolocation permission, simulate prompt denial
    // Override geolocation to simulate PERMISSION_DENIED
    await restrictedPage.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_success, error) => {
        if (error) {
          error({
            code: 1, // PERMISSION_DENIED
            message: 'User denied Geolocation',
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          } as GeolocationPositionError);
        }
      };
    });

    await restrictedPage.locator('#btn-confirm-start-ride').click();

    // Verify error banner is displayed and session is NOT started
    const errorBanner = restrictedPage.locator('#gps-error-banner');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('Location permission was denied');

    // Verify backend ride status is STILL SCHEDULED (NOT IN_PROGRESS)
    const checkRideRes = await restrictedPage.request.get(`${apiBase}/rides/${rideId}/tracking`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const checkState = await checkRideRes.json();
    expect(checkState.status).toBe('SCHEDULED');
    expect(checkState.isTrackingActive).toBe(false);

    await restrictedContext.close();

    // -------------------------------------------------------------------------
    // Scenario B: Permission Granted, Live GPS Broadcasting Active & Speedometer HUD
    // -------------------------------------------------------------------------
    // Create new context with granted geolocation
    const gpsContext = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: 12.9250, longitude: 80.1175 },
    });
    const driverPage = await gpsContext.newPage();

    await loginAsDevUser(driverPage, {
      email: driverEmail,
      fullName: 'Siddharth Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await driverPage.goto(`/rides/${rideId}/track`);
    await driverPage.waitForLoadState('networkidle');

    // Click START RIDE -> Confirm
    await driverPage.locator('#btn-start-ride').click();
    await expect(driverPage.locator('#start-consent-modal')).toBeVisible();
    await driverPage.locator('#btn-confirm-start-ride').click();

    // Verify Live GPS Broadcasting Active HUD
    await expect(driverPage.locator('#driver-active-hud')).toBeVisible({ timeout: 10000 });
    await expect(driverPage.locator('text=Live GPS Broadcasting Active')).toBeVisible();
    await expect(driverPage.locator('#tracking-status-pill')).toContainText('Tracking Active');

    // Simulate location update with speed and heading to verify driver safety glanceable HUD
    await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9100,
        longitude: 80.1000,
        accuracy: 14,
        speedKmh: 42,
        heading: 210,
      },
    });

    // Wait for WebSocket event to update HUD
    await driverPage.waitForTimeout(1000);

    // Verify passenger roster shows confirmed passenger
    await expect(driverPage.locator('text=Pooja Passenger')).toBeVisible();
    await expect(driverPage.locator('text=Vandalur Crescent Gate')).toBeVisible();

    // Verify map is visible and active
    await expect(driverPage.locator('.leaflet-container')).toBeVisible();

    // Capture screenshot: Driver Live Tracking HUD Desktop
    await driverPage.screenshot({
      path: path.join(screenshotDir, 'driver_active_tracking_hud_desktop.png'),
      fullPage: true,
    });

    // Capture screenshot: Driver Mobile Viewport
    await driverPage.setViewportSize({ width: 390, height: 844 });
    await driverPage.waitForTimeout(500);
    await driverPage.screenshot({
      path: path.join(screenshotDir, 'driver_active_tracking_hud_mobile.png'),
      fullPage: true,
    });

    // Restore desktop viewport
    await driverPage.setViewportSize({ width: 1280, height: 800 });

    // -------------------------------------------------------------------------
    // Scenario C: Driver Safety & End Ride Completion
    // -------------------------------------------------------------------------
    // Click prominent "End Ride" control
    const endRideBtn = driverPage.locator('#btn-complete-ride-hud');
    await expect(endRideBtn).toBeVisible();
    await endRideBtn.click();

    // End Ride confirmation modal appears
    const completeModal = driverPage.locator('#complete-ride-modal');
    await expect(completeModal).toBeVisible();
    await expect(completeModal).toContainText('End Ride & Complete Tracking?');

    // Capture screenshot: Driver End Ride Modal
    await driverPage.screenshot({
      path: path.join(screenshotDir, 'driver_end_ride_modal.png'),
    });

    // Confirm ride completion
    await driverPage.locator('#btn-confirm-complete-ride').click();

    // Verify redirection to My Rides and completed state
    await driverPage.waitForURL('**/my-rides');
    await expect(driverPage.locator('text=Driver Ride Management')).toBeVisible();

    // Verify on backend that tracking session has ended
    const completedRes = await page.request.get(`${apiBase}/rides/${rideId}/tracking`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const completedState = await completedRes.json();
    expect(completedState.status).toBe('COMPLETED');
    expect(completedState.isTrackingActive).toBe(false);

    await gpsContext.close();
    await passengerContext.close();
  });
});

