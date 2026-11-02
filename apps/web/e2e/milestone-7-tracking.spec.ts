import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';

test.describe('Milestone 7: Real-Time Ride Tracking & Pickup Intelligence', () => {
  const apiBase = 'http://localhost:3000';

  test('M7.1 - M7.8: Complete Driver & Passenger Live Tracking & Boarding Journey', async ({
    page,
    browser,
  }, testInfo) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `m7.driver.${uniqueSuffix}@vitstudent.ac.in`;
    const passengerEmail = `m7.passenger.${uniqueSuffix}@vitstudent.ac.in`;
    const strangerEmail = `m7.stranger.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 22 EF ${Math.floor(1000 + Math.random() * 9000)}`;
    const regNumClean = regNum.replace(/\s+/g, '');

    let rideId: string;
    let bookingId: string;
    // ---------------------------------------------------------------------------
    // Step 1: Set up driver, vehicle, and published ride
    // ---------------------------------------------------------------------------
    const { token: driverToken, user: driverUser } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Vikram Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // Register vehicle for driver
    const vehicleRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Honda',
        model: 'City',
        color: 'Silver',
        registrationNumber: regNum,
        capacity: 5,
      },
    });
    expect(vehicleRes.ok()).toBeTruthy();
    const vehicle = await vehicleRes.json();

    // Driver publishes ride
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
        costPerSeat: 60,
      },
    });
    expect(rideRes.ok()).toBeTruthy();
    const ride = await rideRes.json();
    rideId = ride.id;

    // ---------------------------------------------------------------------------
    // Step 2: Passenger sets up account and books seat with custom pickup point
    // ---------------------------------------------------------------------------
    const passengerContext = await browser.newContext();
    const passengerPage = await passengerContext.newPage();

    const { token: passengerToken, user: passengerUser } = await loginAsDevUser(passengerPage, {
      email: passengerEmail,
      fullName: 'Ananya Passenger',
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
        pickupLongitude: 80.0817,
        pickupDescription: 'Opposite Railway Bridge',
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const booking = await bookRes.json();
    bookingId = booking.id;

    // Driver approves the booking
    const approveRes = await page.request.post(`${apiBase}/bookings/${bookingId}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(approveRes.ok()).toBeTruthy();

    // ---------------------------------------------------------------------------
    // Step 3: Driver visits tracking view and starts ride
    // ---------------------------------------------------------------------------
    await page.context().grantPermissions(['geolocation']);
    await page.context().setGeolocation({ latitude: 12.9249, longitude: 80.1171 });

    await page.goto(`/rides/${rideId}/track`);
    await page.waitForLoadState('networkidle');

    // Verify route information and vehicle
    await expect(page.locator('main').getByText('Tambaram Railway Station')).toBeVisible();
    await expect(page.locator('main').getByText('VIT Chennai Campus')).toBeVisible();
    await expect(page.locator('text=Honda City')).toBeVisible();
    await expect(page.locator(`text=${regNumClean}`)).toBeVisible();

    // Leaflet map container should be mounted
    await expect(page.locator('.leaflet-container')).toBeVisible();

    // Driver clicks "START RIDE"
    const startRideBtn = page.locator('#btn-start-ride, button:has-text("START RIDE")');
    await expect(startRideBtn).toBeVisible();
    await startRideBtn.click();

    // Consent modal appears with required explanation
    const consentModal = page.locator('#start-consent-modal');
    await expect(consentModal).toBeVisible();
    await expect(consentModal).toContainText('Your live location will be shared with passengers');
    const confirmStartBtn = page.locator('#btn-confirm-start-ride');
    await confirmStartBtn.click();

    // Verify status transitions to Live Tracking
    await expect(page.locator('text=Live GPS Broadcasting Active')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#tracking-status-pill')).toContainText('Tracking Active');

    // ---------------------------------------------------------------------------
    // Step 4: Simulate driver location update near Passenger pickup
    // ---------------------------------------------------------------------------
    // Rate limit safeguard: wait 1100ms so initial driver HUD ping doesn't trigger 1 req/sec limit
    await page.waitForTimeout(1100);
    const locRes = await page.request.post(`${apiBase}/rides/${rideId}/location-update`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        latitude: 12.8930,
        longitude: 80.0830,
        accuracy: 12,
        speedKmh: 35,
        heading: 195,
      },
    });
    expect(locRes.ok()).toBeTruthy();

    // ---------------------------------------------------------------------------
    // Step 5: Passenger views live tracking and sees driver location & ETA
    // ---------------------------------------------------------------------------
    await passengerPage.goto(`/rides/${rideId}/track`);
    await passengerPage.waitForLoadState('networkidle');

    // Passenger sees live tracking HUD
    await expect(passengerPage.locator('main').getByText('Tambaram Railway Station')).toBeVisible();
    await expect(passengerPage.locator('#tracking-status-pill')).toContainText('Tracking Active');
    await expect(passengerPage.locator('.leaflet-container')).toBeVisible();

    // Passenger sees vehicle plate (revealed to confirmed passengers)
    await expect(passengerPage.locator(`text=${regNumClean}`).first()).toBeVisible();

    // Passenger designated pickup point displayed
    await expect(passengerPage.locator('text=Vandalur Bus Stop').first()).toBeVisible();

    // Passenger tests boarding buttons
    const boardingBtn = passengerPage.locator('button:has-text("Boarding")');
    await expect(boardingBtn).toBeVisible();
    await boardingBtn.click();

    // Passenger clicks "I've Boarded"
    const boardedBtn = passengerPage.locator('button:has-text("Boarded")');
    await expect(boardedBtn).toBeVisible();
    await boardedBtn.click();

    // ---------------------------------------------------------------------------
    // Step 6: Driver HUD reflects passenger boarded state
    // ---------------------------------------------------------------------------
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=BOARDED')).toBeVisible({ timeout: 8000 });

    // ---------------------------------------------------------------------------
    // Step 7: Negative check — Unrelated user cannot access tracking
    // ---------------------------------------------------------------------------
    const strangerContext = await browser.newContext();
    const strangerPage = await strangerContext.newPage();

    await loginAsDevUser(strangerPage, {
      email: strangerEmail,
      fullName: 'Stranger User',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await strangerPage.goto(`/rides/${rideId}/track`);
    await strangerPage.waitForLoadState('networkidle');

    await expect(strangerPage.locator('text=Tracking Unavailable')).toBeVisible();

    // ---------------------------------------------------------------------------
    // Step 8: Driver completes ride via End Ride HUD
    // ---------------------------------------------------------------------------
    const completeBtn = page.locator('#btn-complete-ride-hud, button:has-text("End Ride")');
    await completeBtn.click();

    // Confirmation modal appears
    await expect(page.locator('#complete-ride-modal')).toBeVisible();
    await expect(page.locator('text=End Ride & Complete Tracking?')).toBeVisible();
    const confirmCompleteBtn = page.locator('#btn-confirm-complete-ride');
    await confirmCompleteBtn.click();

    // Redirects to My Rides
    await page.waitForURL('**/my-rides');
    await expect(page.locator('text=Driver Ride Management')).toBeVisible();

    await passengerContext.close();
    await strangerContext.close();
  });
});
