import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Milestone 7.5: Individual Passenger ETA Intelligence', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve('/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/m7_screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('M7.5 - Multi-passenger individual ETAs, passenger ETA wording, driver pickup sequencing, and boarding progress', async ({
    page,
    browser,
  }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m75.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passenger1Email = `m75.p1.${uniqueSuffix}@vitstudent.ac.in`;
    const passenger2Email = `m75.p2.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 22 ET ${Math.floor(1000 + Math.random() * 9000)}`;
    const regNumClean = regNum.replace(/\s+/g, '');

    // -------------------------------------------------------------------------
    // Step 1: Create Driver, Vehicle, and Publish Ride
    // -------------------------------------------------------------------------
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Gautam Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vehicleRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Maruti Suzuki',
        model: 'Swift',
        color: 'Magma Grey',
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
        costPerSeat: 40,
      },
    });
    expect(rideRes.ok()).toBeTruthy();
    const ride = await rideRes.json();
    const rideId = ride.id;

    // -------------------------------------------------------------------------
    // Step 2: Passenger 1 Books (Vandalur Crescent Gate - Stop 1)
    // -------------------------------------------------------------------------
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    const { token: p1Token } = await loginAsDevUser(p1Page, {
      email: passenger1Email,
      fullName: 'Pooja Vandalur',
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

    // -------------------------------------------------------------------------
    // Step 3: Passenger 2 Books (Perungalathur Junction - Stop 2)
    // -------------------------------------------------------------------------
    const p2Context = await browser.newContext();
    const p2Page = await p2Context.newPage();
    const { token: p2Token } = await loginAsDevUser(p2Page, {
      email: passenger2Email,
      fullName: 'Rahul Perungalathur',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const b2Res = await p2Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p2Token}` },
      data: {
        rideId,
        requestedSeats: 1,
        pickupAddress: 'Perungalathur Junction',
        pickupLatitude: 12.9050,
        pickupLongitude: 80.0950,
      },
    });
    expect(b2Res.ok()).toBeTruthy();
    const b2 = await b2Res.json();

    // Driver approves both bookings
    const app1 = await page.request.post(`${apiBase}/bookings/${b1.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(app1.ok()).toBeTruthy();

    const app2 = await page.request.post(`${apiBase}/bookings/${b2.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(app2.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Step 4: Driver Starts Ride & Broadcasts Initial Location
    // -------------------------------------------------------------------------
    const startRes = await page.request.post(`${apiBase}/rides/${rideId}/start`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(startRes.ok()).toBeTruthy();

    // Broadcast GPS location near Tambaram
    const locRes = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.9249,
        longitude: 80.1171,
        accuracy: 14,
        speedKmh: 35,
        heading: 190,
      },
    });
    expect(locRes.ok()).toBeTruthy();

    // -------------------------------------------------------------------------
    // Step 5: Verify Passenger 1 Individual ETA Display
    // -------------------------------------------------------------------------
    await p1Page.goto(`/rides/${rideId}/track`);
    await p1Page.waitForLoadState('networkidle');

    // Verify Passenger Information Card
    const infoCard = p1Page.locator('#passenger-information-card');
    await expect(infoCard).toBeVisible();

    // Requirement 6: "Arriving in approximately X minutes."
    const etaSection = p1Page.locator('#passenger-card-eta');
    await expect(etaSection).toBeVisible();
    await expect(etaSection).toContainText(/Arriving in approximately \d+ minutes?\./i);

    // Verify pickup location is specifically Passenger 1's stop
    const pickupSection = p1Page.locator('#passenger-card-pickup');
    await expect(pickupSection).toContainText('Vandalur Crescent Gate');

    // Capture screenshot: Passenger individual ETA display
    await p1Page.screenshot({
      path: path.join(screenshotDir, 'passenger_individual_eta_display.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 6: Verify Driver Display - Passenger Pickup Sequence & Boarding
    // -------------------------------------------------------------------------
    await page.goto(`/rides/${rideId}/track`);
    await page.waitForLoadState('networkidle');

    // Requirement 7: Driver sees passenger pickup order (Stop 1, Stop 2)
    const stopBadges = page.locator('.pickup-stop-badge');
    await expect(stopBadges.first()).toBeVisible();
    await expect(stopBadges.first()).toContainText('Stop 1');

    // Verify both passengers have distinct individual ETAs calculated
    const rosterItems = page.locator('.passenger-roster-item');
    await expect(rosterItems).toHaveCount(2);

    // Verify individual ETAs are displayed for each stop
    await expect(rosterItems.nth(0)).toContainText(/Arriving in approximately \d+ mins?/i);
    await expect(rosterItems.nth(1)).toContainText(/Arriving in approximately \d+ mins?/i);

    // Capture screenshot: Driver pickup sequence HUD
    await page.screenshot({
      path: path.join(screenshotDir, 'driver_pickup_sequence_hud.png'),
      fullPage: true,
    });

    // -------------------------------------------------------------------------
    // Step 7: Passenger 1 Boards -> Sequence Updates for Driver
    // -------------------------------------------------------------------------
    const boardBtn = page.locator(`button:has-text("Mark Boarded")`).first();
    await boardBtn.click();
    await page.waitForTimeout(500);

    // Verify Passenger 1 is now BOARDED
    await expect(page.locator('text=BOARDED').first()).toBeVisible();

    // -------------------------------------------------------------------------
    // Step 8: Mobile Responsiveness Verification
    // -------------------------------------------------------------------------
    const mobileViewports = [
      { name: 'iphone_se_375x667', width: 375, height: 667 },
      { name: 'iphone_14_390x844', width: 390, height: 844 },
    ];

    for (const vp of mobileViewports) {
      await p1Page.setViewportSize({ width: vp.width, height: vp.height });
      await p1Page.waitForTimeout(400);

      // Verify zero horizontal overflow
      const overflow = await p1Page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);

      // Verify ETA section is fully legible on small screen
      await expect(p1Page.locator('#passenger-card-eta')).toBeVisible();

      // Capture screenshot
      await p1Page.screenshot({
        path: path.join(screenshotDir, `passenger_eta_${vp.name}.png`),
        fullPage: true,
      });
    }

    // Clean up contexts
    await p1Context.close();
    await p2Context.close();
  });
});

