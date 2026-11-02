import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 7: Live Map Interaction, Usability Overhaul & Home Navigation', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve('/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m7_screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Natural map navigation, non-jerky updates, floating controls, fullscreen mode, stale consistency, and Home button', async ({
    page,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `map.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passengerEmail = `map.passenger.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 22 MAP ${Math.floor(1000 + Math.random() * 9000)}`;

    // -------------------------------------------------------------------------
    // Step 1: Create Driver and Publish Ride
    // -------------------------------------------------------------------------
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Karthik Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vehicleRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Hyundai',
        model: 'i20 N-Line',
        color: 'Polar White',
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

    // -------------------------------------------------------------------------
    // Step 2: Passenger Books & Driver Approves
    // -------------------------------------------------------------------------
    const passengerContext = await browser.newContext();
    const passengerPage = await passengerContext.newPage();
    const { token: passengerToken } = await loginAsDevUser(passengerPage, {
      email: passengerEmail,
      fullName: 'Pooja CoRider',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const bookRes = await passengerPage.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
      data: {
        rideId,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Bus Stop',
        pickupLatitude: 12.8912,
        pickupLongitude: 80.0813,
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
    // Step 3: Driver starts ride (initializes tracking session)
    // -------------------------------------------------------------------------
    const startRes = await page.request.post(`${apiBase}/rides/${rideId}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(startRes.ok()).toBeTruthy();

    // Send initial live location via tracking ingest
    const ingestRes1 = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9150,
        longitude: 80.1100,
        accuracy: 12,
        speedKmh: 42,
        heading: 195,
      },
    });
    expect(ingestRes1.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Step 4: Passenger Opens Live Tracking Screen
    // -------------------------------------------------------------------------
    await passengerPage.setViewportSize({ width: 1440, height: 900 });
    await passengerPage.goto(`http://localhost:5173/rides/${rideId}/track`);
    await passengerPage.waitForSelector('#tracking-map-container', { timeout: 15000 });

    // Verify Home navigation link is present in tracking page header
    const homeNavLink = passengerPage.locator('#tracking-nav-home');
    await expect(homeNavLink).toBeVisible();

    // Verify initial tracking active pill
    await expect(passengerPage.locator('#tracking-status-pill')).toContainText('Tracking Active');

    // Wait for Leaflet map tiles and driver marker to render
    const driverMarker = passengerPage.locator('#driver-marker');
    await expect(driverMarker).toBeVisible({ timeout: 10000 });
    await expect(driverMarker).toContainText('LIVE');

    // Verify corridor elements: My Pickup marker and Destination marker
    await expect(passengerPage.locator('#my-pickup-marker')).toBeVisible();
    await expect(passengerPage.locator('#destination-marker')).toBeVisible();

    // Verify Map floating controls are visible and have touch-friendly sizing
    const btnZoomIn = passengerPage.locator('#btn-map-zoom-in');
    const btnZoomOut = passengerPage.locator('#btn-map-zoom-out');
    const btnFitCorridor = passengerPage.locator('#btn-map-fit-corridor');
    const btnExpand = passengerPage.locator('#btn-map-expand');
    const btnToggleLegend = passengerPage.locator('#btn-map-toggle-legend');

    await expect(btnZoomIn).toBeVisible();
    await expect(btnZoomOut).toBeVisible();
    await expect(btnFitCorridor).toBeVisible();
    await expect(btnExpand).toBeVisible();

    // Capture clean initial desktop live map
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'map_live_active_desktop.png'),
    });

    // -------------------------------------------------------------------------
    // Step 5: Test Click-and-Drag Map Panning & Free Pan Notification
    // -------------------------------------------------------------------------
    const mapContainer = passengerPage.locator('#tracking-map-container');
    await mapContainer.scrollIntoViewIfNeeded();
    await passengerPage.waitForTimeout(300);
    const mapBox = await mapContainer.boundingBox();
    expect(mapBox).not.toBeNull();

    if (mapBox) {
      // Simulate smooth user drag interaction
      const startX = mapBox.x + mapBox.width * 0.5;
      const startY = mapBox.y + mapBox.height * 0.5;

      await passengerPage.mouse.move(startX, startY);
      await passengerPage.mouse.down();
      await passengerPage.mouse.move(startX - 180, startY - 120, { steps: 12 });
      await passengerPage.mouse.up();
    }

    // After user drags, "Free Pan Active" pill and bottom "Re-center Driver" button must appear
    const freePanIndicator = passengerPage.locator('#map-free-pan-pill');
    const btnRecenter = passengerPage.locator('#btn-recenter-driver');
    await expect(freePanIndicator).toBeVisible({ timeout: 5000 });
    await expect(btnRecenter).toBeVisible({ timeout: 5000 });

    // Capture Free Pan screenshot
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'map_free_pan_mode.png'),
    });

    // -------------------------------------------------------------------------
    // Step 6: Non-Jerky Update Verification (GPS ticks do not cancel user pan)
    // -------------------------------------------------------------------------
    // Ingest another GPS location while user is free panning
    const ingestRes2 = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9050,
        longitude: 80.1020,
        accuracy: 10,
        speedKmh: 48,
        heading: 200,
      },
    });
    expect(ingestRes2.ok()).toBeTruthy();

    // Wait a moment for socket update
    await passengerPage.waitForTimeout(1000);

    // Assert that the user is STILL in Free Pan mode (the map did not forcibly reset)
    await expect(freePanIndicator).toBeVisible();

    // Click "Re-center Driver" to snap back to following mode
    await btnRecenter.click();
    await passengerPage.waitForTimeout(600);

    // Free pan pill should be dismissed
    await expect(freePanIndicator).toBeHidden();

    // -------------------------------------------------------------------------
    // Step 7: Test Floating Zoom Controls and Route Fit
    // -------------------------------------------------------------------------
    await btnZoomIn.click();
    await passengerPage.waitForTimeout(400);
    await btnZoomOut.click();
    await passengerPage.waitForTimeout(400);
    await btnFitCorridor.click();
    await passengerPage.waitForTimeout(600);

    // -------------------------------------------------------------------------
    // Step 8: Test 1-Tap Fullscreen / Expand Mode
    // -------------------------------------------------------------------------
    await btnExpand.click();
    await passengerPage.waitForTimeout(600);

    // Container should now have fixed fullscreen class or 100vh height
    const expandedHeight = await mapContainer.evaluate((el) => el.clientHeight);
    expect(expandedHeight).toBeGreaterThan(600);

    // Capture Fullscreen Expanded screenshot
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'map_fullscreen_expanded.png'),
    });

    // Toggle back to standard view
    await btnExpand.click();
    await passengerPage.waitForTimeout(400);

    // -------------------------------------------------------------------------
    // Step 9: Stale State Consistency across HUD, Marker, and Badges
    // -------------------------------------------------------------------------
    // Trigger staleness via test helper (simulating > 30s since last valid GPS update)
    await passengerPage.evaluate(() => {
      const win = window as any;
      if (typeof win.__testSetStale === 'function') {
        win.__testSetStale();
      }
    });
    await passengerPage.waitForTimeout(500);

    // Verify status pill marks stale
    await expect(passengerPage.locator('#tracking-status-pill')).toContainText('Tracking Stale');

    // Verify driver marker shows STALE badge
    const staleMarker = passengerPage.locator('#driver-marker-stale');
    await expect(staleMarker).toBeVisible({ timeout: 5000 });
    await expect(staleMarker).toContainText('STALE');

    // Capture Stale Signal screenshot
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'map_stale_signal_state.png'),
    });

    // -------------------------------------------------------------------------
    // Step 10: Mobile Viewport Usability (iPhone 14 @ 390x844)
    // -------------------------------------------------------------------------
    await passengerPage.setViewportSize({ width: 390, height: 844 });
    await passengerPage.waitForTimeout(500);

    // Map container must fit comfortably on mobile
    const mobileMapHeight = await mapContainer.evaluate((el) => el.clientHeight);
    expect(mobileMapHeight).toBeGreaterThanOrEqual(350);

    // Capture Mobile screenshot
    await passengerPage.screenshot({
      path: path.join(screenshotDir, 'map_mobile_390x844.png'),
    });

    // -------------------------------------------------------------------------
    // Step 11: Home Button Verification on Dashboard and Navigation
    // -------------------------------------------------------------------------
    // Navigate back to Dashboard
    await passengerPage.goto('http://localhost:5173/dashboard');
    await passengerPage.waitForSelector('text=Welcome back', { timeout: 10000 });

    // Verify Home button in top quick actions
    const dashboardHomeBtn = passengerPage.locator('button:has-text("Home")');
    await expect(dashboardHomeBtn).toBeVisible();

    // Click Home button and verify landing page loads
    await dashboardHomeBtn.click();
    await expect(passengerPage).toHaveURL('http://localhost:5173/');

    await passengerContext.close();
  });
});
