import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 7: Dashboard Redesign & Direct Tracking Access', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m7_screenshots',
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Dashboard Redesign E2E: Elevated Active Ride, 1-Click Tracking, Action Items & Responsive Views', async ({
    page,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m7dash.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passengerEmail = `m7dash.passenger.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 09 AB ${Math.floor(1000 + Math.random() * 9000)}`;

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 1: Set up Driver, Vehicle, and Active Ride (IN_PROGRESS)
    // ───────────────────────────────────────────────────────────────────────────
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Rohan Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vehicleRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Tata',
        model: 'Nexon EV',
        color: 'Daytona Grey',
        registrationNumber: regNum,
        capacity: 4,
      },
    });
    expect(vehicleRes.ok()).toBeTruthy();
    const vehicle = await vehicleRes.json();

    const departureTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const rideRes = await page.request.post(`${apiBase}/rides`, {
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
        costPerSeat: 45,
      },
    });
    expect(rideRes.ok()).toBeTruthy();
    const ride = await rideRes.json();

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 2: Set up Passenger & Confirmed Booking (While Ride is SCHEDULED)
    // ───────────────────────────────────────────────────────────────────────────
    const passengerContext = await browser.newContext();
    const passengerPage = await passengerContext.newPage();

    const { token: passengerToken } = await loginAsDevUser(passengerPage, {
      email: passengerEmail,
      fullName: 'Ananya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const bookRes = await passengerPage.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Crescent Gate',
        pickupLatitude: 12.889,
        pickupLongitude: 80.0825,
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const booking = await bookRes.json();

    // Driver approves the booking to confirm it
    const approveRes = await page.request.post(`${apiBase}/bookings/${booking.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(approveRes.ok()).toBeTruthy();

    // Now Driver starts ride -> transitions status to IN_PROGRESS and initiates tracking session
    const startRes = await page.request.post(`${apiBase}/rides/${ride.id}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(startRes.ok()).toBeTruthy();

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 3: Test Scenario 1 — Driver Dashboard with Active Ride
    // ───────────────────────────────────────────────────────────────────────────
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify Home and Dashboard navigation links are visible in navbar on desktop
    const isDesktop = (page.viewportSize()?.width || 0) >= 768;
    if (isDesktop) {
      await expect(page.locator('.nav-desktop-links #nav-link-home')).toBeVisible();
      await expect(page.locator('.nav-desktop-links #nav-link-dashboard')).toBeVisible();
    }

    // Verify Active Ride section is elevated at the top
    const activeSection = page.locator('[data-testid="active-rides-section"]');
    await expect(activeSection).toBeVisible();
    await expect(activeSection).toContainText('Live Ride in Progress');
    await expect(activeSection).toContainText('LIVE TRACKING ACTIVE');

    // Verify Driver card contents
    const driverCard = page.locator(`[data-testid="active-driver-ride-${ride.id}"]`);
    await expect(driverCard).toBeVisible();
    await expect(driverCard).toContainText('YOU ARE DRIVING');
    await expect(driverCard).toContainText('IN PROGRESS');
    await expect(driverCard).toContainText('Tambaram Railway Station Bus Stop');
    await expect(driverCard).toContainText('VIT Chennai Campus');

    // Verify Direct Action Button: "OPEN LIVE TRACKING"
    const openTrackingBtn = driverCard.getByRole('button', { name: /OPEN LIVE TRACKING/i });
    await expect(openTrackingBtn).toBeVisible();

    // Capture Driver Dashboard Screenshot (Desktop)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: path.join(screenshotDir, 'dashboard_driver_active_ride_desktop_1440x900.png'),
      fullPage: true,
    });

    // Test zero-click navigation: clicking OPEN LIVE TRACKING goes directly to /rides/:id/track
    await openTrackingBtn.click();
    await page.waitForURL(`**/rides/${ride.id}/track`);
    expect(page.url()).toContain(`/rides/${ride.id}/track`);

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 4: Test Scenario 2 — Passenger Dashboard with Active Ride
    // ───────────────────────────────────────────────────────────────────────────
    await passengerPage.goto('/dashboard');
    await passengerPage.waitForLoadState('networkidle');

    // Verify Active Ride section on passenger dashboard
    const passActiveSection = passengerPage.locator('[data-testid="active-rides-section"]');
    await expect(passActiveSection).toBeVisible();
    await expect(passActiveSection).toContainText('Live Ride in Progress');

    const passCard = passengerPage.locator(`[data-testid="active-passenger-booking-${booking.id}"]`);
    await expect(passCard).toBeVisible();
    await expect(passCard).toContainText('YOU ARE PASSENGER');
    await expect(passCard).toContainText('WAITING FOR DRIVER');
    await expect(passCard).toContainText('Rohan Driver');
    await expect(passCard).toContainText('Vandalur Crescent Gate');

    // Verify Direct Action Button: "TRACK YOUR RIDE"
    const trackRideBtn = passCard.getByRole('button', { name: /TRACK YOUR RIDE/i });
    await expect(trackRideBtn).toBeVisible();

    // Capture Passenger Dashboard Screenshot (Desktop)
    await passengerPage.setViewportSize({ width: 1440, height: 900 });
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'dashboard_passenger_active_ride_desktop_1440x900.png'),
      fullPage: true,
    });

    // Test zero-click navigation: clicking TRACK YOUR RIDE goes directly to /rides/:id/track
    await trackRideBtn.click();
    await passengerPage.waitForURL(`**/rides/${ride.id}/track`);
    expect(passengerPage.url()).toContain(`/rides/${ride.id}/track`);

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 5: Test Scenario 3 — Driver Action Items (Pending Booking Request)
    // ───────────────────────────────────────────────────────────────────────────
    // Driver creates a 2nd upcoming ride (SCHEDULED) to receive booking requests
    const departureTime2 = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    const ride2Res = await page.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        departureTime: departureTime2,
        availableSeats: 3,
        originLatitude: 12.9249,
        originLongitude: 80.1171,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        costPerSeat: 50,
      },
    });
    expect(ride2Res.ok()).toBeTruthy();
    const ride2 = await ride2Res.json();

    // Create a 2nd passenger with a PENDING booking request on ride2
    const p2Context = await browser.newContext();
    const p2Page = await p2Context.newPage();
    const p2Email = `m7dash.pending.${uniqueSuffix}@vitstudent.ac.in`;

    const { token: p2Token } = await loginAsDevUser(p2Page, {
      email: p2Email,
      fullName: 'Rahul Sharma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const pendBookRes = await p2Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p2Token}` },
      data: {
        rideId: ride2.id,
        requestedSeats: 1,
        pickupAddress: 'Perungalathur Junction',
        pickupLatitude: 12.905,
        pickupLongitude: 80.095,
      },
    });
    expect(pendBookRes.ok()).toBeTruthy();

    // Return to Driver Dashboard and verify Action Items section appears
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const actionItemsSection = page.locator('[data-testid="action-items-section"]');
    await expect(actionItemsSection).toBeVisible();
    await expect(actionItemsSection).toContainText('Action Items (1 Pending Approval)');
    await expect(actionItemsSection).toContainText('Rahul Sharma requested 1 seat');
    await expect(actionItemsSection).toContainText('Pickup: Perungalathur Junction');

    // Capture Action Items Screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'dashboard_driver_action_items.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 6: Responsive Verification across All Required Viewports
    // ───────────────────────────────────────────────────────────────────────────
    const viewports = [
      { name: 'small_mobile_320x740', width: 320, height: 740 },
      { name: 'iphone_se_375x812', width: 375, height: 812 },
      { name: 'iphone_14_390x844', width: 390, height: 844 },
      { name: 'pixel_7_440x956', width: 440, height: 956 },
      { name: 'tablet_768x1024', width: 768, height: 1024 },
      { name: 'laptop_1280x800', width: 1280, height: 800 },
      { name: 'desktop_1440x900', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      // Verify no horizontal overflow
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px margin for subpixel rendering

      // Capture screenshot
      await page.screenshot({
        path: path.join(screenshotDir, `dashboard_${vp.name}.png`),
        fullPage: false,
      });
    }

    // ───────────────────────────────────────────────────────────────────────────
    // Phase 7: Clean State Verification (No Active Rides)
    // ───────────────────────────────────────────────────────────────────────────
    // Complete the ride so no rides are IN_PROGRESS
    const completeRes = await page.request.post(`${apiBase}/rides/${ride.id}/complete`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(completeRes.ok()).toBeTruthy();

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify Active Ride section is NOT present when no rides are IN_PROGRESS
    const activeSectionAfterComplete = page.locator('[data-testid="active-rides-section"]');
    await expect(activeSectionAfterComplete).not.toBeVisible();

    // Verify Upcoming Schedule and Quick Actions are cleanly visible
    const quickActions = page.locator('section:has-text("Quick Actions")');
    await expect(quickActions).toBeVisible();
    await expect(quickActions.getByText('Find Rides')).toBeVisible();
    await expect(quickActions.getByText('Offer a Ride')).toBeVisible();
    await expect(quickActions.getByText('My Bookings')).toBeVisible();
    await expect(quickActions.getByText('My Driving')).toBeVisible();

    // Capture Clean Dashboard State Screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'dashboard_clean_no_active_rides_desktop.png'),
      fullPage: true,
    });

    await passengerContext.close();
    await p2Context.close();
  });
});
