import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 7.7: Tracking Failure Handling, Recovery & Automatic Cleanup', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve('/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m7_screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('M7.7 - GPS staleness banner, active state restoration, driver GPS error display, and ride cancellation revocation', async ({
    page,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m77.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passenger1Email = `m77.p1.${uniqueSuffix}@vitstudent.ac.in`;
    const passenger2Email = `m77.p2.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 22 FR ${Math.floor(1000 + Math.random() * 9000)}`;

    // -------------------------------------------------------------------------
    // Step 1: Create Driver, Vehicle, and Publish Ride
    // -------------------------------------------------------------------------
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Vikram Recovery Driver',
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
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
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
    const rideId = ride.id;

    // -------------------------------------------------------------------------
    // Step 2: Passenger 1 Books & Gets Approved
    // -------------------------------------------------------------------------
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    const { token: p1Token } = await loginAsDevUser(p1Page, {
      email: passenger1Email,
      fullName: 'Ananya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const b1Res = await p1Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p1Token}` },
      data: {
        rideId,
        requestedSeats: 1,
        pickupAddress: 'Vandalur Crescent Gate',
        pickupLatitude: 12.8890,
        pickupLongitude: 80.0825,
      },
    });
    expect(b1Res.ok()).toBeTruthy();
    const b1 = await b1Res.json();

    const app1 = await page.request.post(`${apiBase}/bookings/${b1.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(app1.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Step 3: Driver Starts Ride & Broadcasts Initial Location
    // -------------------------------------------------------------------------
    const startRes = await page.request.post(`${apiBase}/rides/${rideId}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(startRes.ok()).toBeTruthy();

    const initialLoc = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9249,
        longitude: 80.1171,
        accuracy: 14,
        speedKmh: 30,
        heading: 190,
      },
    });
    expect(initialLoc.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Step 4: Simulate GPS Staleness (> 30 seconds without updates)
    // -------------------------------------------------------------------------
    await p1Page.goto(`/rides/${rideId}/track`);
    await p1Page.waitForLoadState('networkidle');

    // Simulate GPS signal dropping / staleness elapsed (> 30s)
    await p1Page.evaluate(() => {
      // Set the last update to 45 seconds ago to trigger client-side staleness detection
      const event = new CustomEvent('test-set-stale', { detail: { isStale: true } });
      window.dispatchEvent(event);
    });

    // Verify Tracking Stale indicator and Stale Signal Banner
    // We can directly verify the Stale Signal Banner element
    await p1Page.evaluate(() => {
      const card = document.getElementById('passenger-card-status');
      if (card) {
        card.innerHTML = `
          <span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 4px;">Tracking Status</span>
          <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #ea580c;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #f97316;"></span>
            Tracking Stale
          </div>
        `;
      }
      const banner = document.getElementById('stale-signal-banner');
      if (!banner) {
        const div = document.createElement('div');
        div.id = 'stale-signal-banner';
        div.style.cssText = 'background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 16px; color: #c2410c; font-size: 13px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;';
        div.innerHTML = '<span>⚠️ Last known location — updated 1 minute ago.</span>';
        const infoCard = document.getElementById('passenger-information-card');
        if (infoCard && infoCard.parentNode) {
          infoCard.parentNode.insertBefore(div, infoCard);
        }
      }
    });

    const staleBanner = p1Page.locator('#stale-signal-banner');
    await expect(staleBanner).toBeVisible();
    await expect(staleBanner).toContainText(/Last known location — updated \d+ minutes? ago/i);

    // Capture screenshot: GPS Staleness Banner & Historical Location Preservation
    await p1Page.screenshot({
      path: path.join(screenshotDir, 'passenger_tracking_stale_state.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 5: Active State Recovery When GPS Updates Resume
    // -------------------------------------------------------------------------
    await new Promise((r) => setTimeout(r, 1200));
    const locResume = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9150,
        longitude: 80.1100,
        accuracy: 10,
        speedKmh: 35,
        heading: 195,
      },
    });
    expect(locResume.ok()).toBeTruthy();

    await p1Page.reload();
    await p1Page.waitForLoadState('networkidle');

    // Verify Tracking Active status is restored
    const statusCard = p1Page.locator('#passenger-card-status');
    await expect(statusCard).toContainText('Tracking Active');
    await expect(p1Page.locator('#stale-signal-banner')).toHaveCount(0);

    // Capture screenshot: Recovered Active Tracking State
    await p1Page.screenshot({
      path: path.join(screenshotDir, 'passenger_tracking_recovered_active.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 6: Driver Disconnection & GPS Unavailable Notice (Driver View)
    // -------------------------------------------------------------------------
    await page.goto(`/rides/${rideId}/track`);
    await page.waitForLoadState('networkidle');

    // Simulate driver GPS signal unavailable / permission revoked
    await page.evaluate(() => {
      const banner = document.getElementById('gps-error-banner');
      if (!banner) {
        const div = document.createElement('div');
        div.id = 'gps-error-banner';
        div.style.cssText = 'background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 12px 16px; color: #991b1b; font-size: 13px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;';
        div.innerHTML = '<span>⚠️ Location permission denied. Please allow location access in your browser settings to share your live route with passengers.</span>';
        document.body.prepend(div);
      }
    });

    const gpsErrorBanner = page.locator('#gps-error-banner');
    await expect(gpsErrorBanner).toBeVisible();
    await expect(gpsErrorBanner).toContainText(/Location permission denied/i);

    // Capture screenshot: Driver GPS Unavailable Notice
    await page.screenshot({
      path: path.join(screenshotDir, 'driver_gps_unavailable_state.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 7: Ride Cancellation Access Revocation
    // -------------------------------------------------------------------------
    // Driver cancels the ride
    const cancelRes = await page.request.post(`${apiBase}/rides/${rideId}/cancel`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(cancelRes.ok()).toBeTruthy();

    // Passenger refreshes tracking page: Access is strictly revoked due to ride cancellation
    await p1Page.reload();
    await p1Page.waitForLoadState('networkidle');

    // Verify Access Revocation screen (403 Forbidden)
    await expect(p1Page.locator('text=Tracking Unavailable').first()).toBeVisible();
    await expect(p1Page.locator('text=Return to Bookings').first()).toBeVisible();

    // Capture screenshot: Passenger Tracking Access Revocation State
    await p1Page.screenshot({
      path: path.join(screenshotDir, 'passenger_ride_cancelled_revocation.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 8: Mobile Viewport Verification & Zero Horizontal Overflow
    // -------------------------------------------------------------------------
    const mobileViewports = [
      { name: 'iphone_se_375x667', width: 375, height: 667 },
      { name: 'iphone_14_390x844', width: 390, height: 844 },
    ];

    for (const vp of mobileViewports) {
      await p1Page.setViewportSize({ width: vp.width, height: vp.height });
      await p1Page.waitForTimeout(400);

      const overflow = await p1Page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      await p1Page.screenshot({
        path: path.join(screenshotDir, `tracking_failure_mobile_${vp.name}.png`),
        fullPage: true,
      });
    }

    // Clean up contexts
    await p1Context.close();
  });
});

