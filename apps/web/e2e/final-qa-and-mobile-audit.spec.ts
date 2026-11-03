import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Comprehensive Final QA, Dashboard Audit & Mobile Usability Review', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/final_qa_screenshots'
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('1. Dashboard Deep Functional Audit: Interactive Approve, Decline, Seats Decrement & Consistency', async ({
    page,
    browser,
  }) => {
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `qa.driver.${unique}@vitstudent.ac.in`;
    const p1Email = `qa.p1.${unique}@vitstudent.ac.in`;
    const p2Email = `qa.p2.${unique}@vitstudent.ac.in`;
    const regNum = `TN 22 QA ${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Setup Driver & Vehicle
    const { token: driverToken } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Vikram Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Honda',
        model: 'City',
        color: 'Platinum White',
        registrationNumber: regNum,
        capacity: 4,
      },
    });
    expect(vRes.ok()).toBeTruthy();
    const vehicle = await vRes.json();

    // 2. Publish Ride with 3 available seats
    const depTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    const rRes = await page.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        originLatitude: 12.9249,
        originLongitude: 80.1265,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: depTime,
        availableSeats: 3,
        costPerSeat: 45,
      },
    });
    expect(rRes.ok()).toBeTruthy();
    const ride = await rRes.json();
    expect(ride.availableSeats).toBe(3);

    // 3. Setup Passenger 1 and request 1 seat
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    const { token: p1Token } = await loginAsDevUser(p1Page, {
      email: p1Email,
      fullName: 'Rahul Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    const b1Res = await p1Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p1Token}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
        pickupAddress: 'Tambaram Sanatorium',
      },
    });
    expect(b1Res.ok()).toBeTruthy();
    const b1 = await b1Res.json();
    expect(b1.status).toBe('PENDING');

    // 4. Setup Passenger 2 and request 1 seat
    const p2Context = await browser.newContext();
    const p2Page = await p2Context.newPage();
    const { token: p2Token } = await loginAsDevUser(p2Page, {
      email: p2Email,
      fullName: 'Ananya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    const b2Res = await p2Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p2Token}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
        pickupAddress: 'Chromepet Gate',
      },
    });
    expect(b2Res.ok()).toBeTruthy();
    const b2 = await b2Res.json();
    expect(b2.status).toBe('PENDING');

    // 5. Driver opens Dashboard on mobile (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:5173/dashboard');
    await page.waitForSelector('[data-testid="action-items-section"]');

    // Verify Action Items section displays 2 pending bookings
    const actionItemsSection = page.locator('[data-testid="action-items-section"]');
    await expect(actionItemsSection).toContainText('Action Items (2 Pending Approval)');
    await expect(actionItemsSection).toContainText('Rahul Passenger');
    await expect(actionItemsSection).toContainText('Ananya Passenger');

    // Verify BOTH Approve and Decline buttons are rendered for requests
    await expect(page.locator(`#btn-approve-${b1.id}`)).toBeVisible();
    await expect(page.locator(`#btn-decline-${b1.id}`)).toBeVisible();
    await expect(page.locator(`#btn-approve-${b2.id}`)).toBeVisible();
    await expect(page.locator(`#btn-decline-${b2.id}`)).toBeVisible();

    // 6. Driver clicks APPROVE for Passenger 1
    await page.locator(`#btn-approve-${b1.id}`).click();
    await expect(page.locator('text=Passenger booking confirmed! Seats updated.')).toBeVisible();

    // Verify Passenger 1 booking is CONFIRMED and seats decremented to 2
    const verifyB1Res = await page.request.get(`${apiBase}/bookings/${b1.id}`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const verifyB1 = await verifyB1Res.json();
    expect(verifyB1.status).toBe('CONFIRMED');

    // 7. Driver clicks DECLINE for Passenger 2
    await page.locator(`#btn-decline-${b2.id}`).click();
    await expect(page.locator('text=Booking request declined.')).toBeVisible();

    // Verify Passenger 2 booking is REJECTED
    const verifyB2Res = await page.request.get(`${apiBase}/bookings/${b2.id}`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    const verifyB2 = await verifyB2Res.json();
    expect(verifyB2.status).toBe('REJECTED');

    // 8. Refresh Dashboard and verify consistent state
    await page.reload();
    await page.waitForSelector('.container');
    // Action Items section should now be gone because 0 actionable pending requests remain
    await expect(page.locator('[data-testid="action-items-section"]')).toHaveCount(0);

    // Available seats in upcoming driving rides should show 2 open seats
    await expect(page.locator('text=2 open seat(s)')).toBeVisible();

    await p1Context.close();
    await p2Context.close();
  });

  test('2. Search Query Preservation Through Authentication Flow', async ({ browser }) => {
    const unauthCtx = await browser.newContext();
    const unauthPage = await unauthCtx.newPage();

    // 1. Visit /rides with unauthenticated browser and full search query
    await unauthPage.goto('http://127.0.0.1:5173/rides?origin=Tambaram&destination=VIT+Chennai&seats=2&date=2026-11-04');
    await unauthPage.waitForSelector('#logged-out-signin-banner');

    // Verify prompt banner is visible
    await expect(unauthPage.locator('#logged-out-signin-banner')).toContainText(
      'Sign In with Your VIT Email to View Active Rides'
    );

    // Click the prompt button
    await unauthPage.locator('#btn-prompt-signin').click();
    await unauthPage.waitForURL(/.*\/auth\?redirect=.*/);

    // Verify redirect param encodes the original destination and parameters
    const currentUrl = unauthPage.url();
    expect(currentUrl).toContain('redirect=%2Frides%3Forigin%3DTambaram%26destination%3DVIT%2BChennai');

    // Sign in using dev auth session
    await loginAsDevUser(unauthPage, {
      email: `searcher.${Date.now()}@vitstudent.ac.in`,
      fullName: 'Searcher Student',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // Navigate to auth with the redirect parameter, triggering immediate destination redirect
    await unauthPage.goto(currentUrl);

    // Verify user is redirected back to the exact search URL
    await unauthPage.waitForURL(/.*\/rides\?origin=Tambaram.*/);
    expect(unauthPage.url()).toContain('origin=Tambaram');
    expect(unauthPage.url()).toContain('destination=VIT+Chennai');

    await unauthCtx.close();
  });

  test('3. WhatsApp Ride Sharing Link & Privacy Validation', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const { token } = await loginAsDevUser(page, {
      email: `sharer.${Date.now()}@vitstudent.ac.in`,
      fullName: 'Sharer Commuter',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // Create a ride to test sharing
    const regNum = `TN 14 SH ${Math.floor(1000 + Math.random() * 9000)}`;
    const vRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        make: 'Hyundai',
        model: 'i20',
        color: 'Polar White',
        registrationNumber: regNum,
        capacity: 4,
      },
    });
    expect(vRes.ok()).toBeTruthy();
    const vehicle = await vRes.json();

    const rRes = await page.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Velachery MRTS Station',
        destination: 'VIT Chennai Campus',
        originLatitude: 12.9815,
        originLongitude: 80.2180,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        availableSeats: 3,
        costPerSeat: 65,
      },
    });
    expect(rRes.ok()).toBeTruthy();
    const ride = await rRes.json();

    await page.goto(`http://127.0.0.1:5173/rides?rideId=${ride.id}`);
    await page.waitForSelector('#btn-modal-share-whatsapp', { timeout: 10000 });

    // Click WhatsApp share button
    const shareBtn = page.locator('#btn-modal-share-whatsapp');
    await expect(shareBtn).toBeVisible();

    // Extract the onclick handler or generated link
    const shareUrl = await shareBtn.evaluate((el: HTMLButtonElement) => {
      let openedUrl = '';
      const originalOpen = window.open;
      window.open = (url?: string | URL) => {
        openedUrl = String(url);
        return null;
      };
      el.click();
      window.open = originalOpen;
      return openedUrl;
    });

    // Verify WhatsApp share text
    const decodedShare = decodeURIComponent(shareUrl);
    expect(decodedShare).toContain('wa.me/?text=');
    expect(decodedShare).toContain('Velachery MRTS Station');
    expect(decodedShare).toContain('VIT Chennai Campus');
    expect(decodedShare).toContain(`rideId=${ride.id}`);

    // PRIVACY VERIFICATION: Confirm NO sensitive driver private info is leaked
    expect(decodedShare).not.toContain(regNum); // No vehicle plate
    expect(decodedShare).not.toContain('+91'); // No driver phone number

    await ctx.close();
  });

  test('4. Comprehensive Visual Verification Screenshots (Desktop & Mobile Viewports)', async ({
    browser,
  }) => {
    test.setTimeout(90000);
    // ───────────────────────────────────────────────────────────────────────────
    // A. Logged-out Home – Desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedOutDeskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const loggedOutDeskPage = await loggedOutDeskCtx.newPage();
    await loggedOutDeskPage.goto('http://127.0.0.1:5173/');
    await loggedOutDeskPage.waitForSelector('#hero');
    await loggedOutDeskPage.waitForTimeout(500);
    await loggedOutDeskPage.screenshot({
      path: path.join(screenshotDir, '01_logged_out_home_desktop.png'),
    });
    await loggedOutDeskCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // B. Logged-out Home – Mobile (390 x 844 iPhone 14)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedOutMobCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const loggedOutMobPage = await loggedOutMobCtx.newPage();
    await loggedOutMobPage.goto('http://127.0.0.1:5173/');
    await loggedOutMobPage.waitForSelector('#hero');
    await loggedOutMobPage.waitForTimeout(500);
    await loggedOutMobPage.screenshot({
      path: path.join(screenshotDir, '02_logged_out_home_mobile.png'),
    });
    await loggedOutMobCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // C. Logged-in Home – Desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedInDeskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const loggedInDeskPage = await loggedInDeskCtx.newPage();
    await loginAsDevUser(loggedInDeskPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await loggedInDeskPage.goto('http://127.0.0.1:5173/');
    await loggedInDeskPage.waitForSelector('#hero');
    await loggedInDeskPage.waitForTimeout(500);
    await loggedInDeskPage.screenshot({
      path: path.join(screenshotDir, '03_logged_in_home_desktop.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // D. Logged-in Home – Mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedInMobCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const loggedInMobPage = await loggedInMobCtx.newPage();
    await loginAsDevUser(loggedInMobPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await loggedInMobPage.goto('http://127.0.0.1:5173/');
    await loggedInMobPage.waitForSelector('#hero');
    await loggedInMobPage.waitForTimeout(500);
    await loggedInMobPage.screenshot({
      path: path.join(screenshotDir, '04_logged_in_home_mobile.png'),
    });
    await loggedInMobCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // E. Dashboard – Desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    await loggedInDeskPage.goto('http://127.0.0.1:5173/dashboard');
    await loggedInDeskPage.waitForSelector('.container');
    await loggedInDeskPage.waitForTimeout(1000);
    await loggedInDeskPage.screenshot({
      path: path.join(screenshotDir, '05_dashboard_desktop.png'),
    });
    await loggedInDeskCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // F. Dashboard – Mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    const dashMobCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const dashMobPage = await dashMobCtx.newPage();
    await loginAsDevUser(dashMobPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await dashMobPage.goto('http://127.0.0.1:5173/dashboard');
    await dashMobPage.waitForSelector('.container');
    await dashMobPage.waitForTimeout(1000);
    await dashMobPage.screenshot({
      path: path.join(screenshotDir, '06_dashboard_mobile.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // G. Find Rides – Mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    await dashMobPage.goto('http://127.0.0.1:5173/rides');
    await dashMobPage.waitForSelector('.container');
    await dashMobPage.waitForTimeout(1000);
    await dashMobPage.screenshot({
      path: path.join(screenshotDir, '07_find_rides_mobile.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // H. Offer a Ride – Mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    await dashMobPage.goto('http://127.0.0.1:5173/offer-ride');
    await dashMobPage.waitForSelector('form, .container');
    await dashMobPage.waitForTimeout(1000);
    await dashMobPage.screenshot({
      path: path.join(screenshotDir, '08_offer_ride_mobile.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // I. Setup Active In-Progress Ride for Mobile Live Tracking & Boarding OTP
    // ───────────────────────────────────────────────────────────────────────────
    const driverCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const driverPage = await driverCtx.newPage();
    const { token: dToken } = await loginAsDevUser(driverPage, {
      email: `m7.driver.${Date.now()}@vitstudent.ac.in`,
      fullName: 'Siddharth Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    const vehRes = await driverPage.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${dToken}` },
      data: {
        make: 'Maruti',
        model: 'Brezza',
        color: 'Magma Grey',
        registrationNumber: `TN 07 M ${Math.floor(1000 + Math.random() * 9000)}`,
        capacity: 4,
      },
    });
    const veh = await vehRes.json();
    const activeRideRes = await driverPage.request.post(`${apiBase}/rides`, {
      headers: { Authorization: `Bearer ${dToken}` },
      data: {
        vehicleId: veh.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        originLatitude: 12.9249,
        originLongitude: 80.1265,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: new Date(Date.now() + 3600 * 1000).toISOString(),
        availableSeats: 3,
        costPerSeat: 50,
      },
    });
    const activeRide = await activeRideRes.json();

    // Passenger books & driver approves
    const passCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const passPage = await passCtx.newPage();
    const { token: pToken } = await loginAsDevUser(passPage, {
      email: `m7.pass.${Date.now()}@vitstudent.ac.in`,
      fullName: 'Pooja Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    const bookRes = await passPage.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${pToken}` },
      data: {
        rideId: activeRide.id,
        requestedSeats: 1,
        pickupAddress: 'Tambaram Bus Stand',
      },
    });
    const bReq = await bookRes.json();

    // Driver approves booking
    await driverPage.request.post(`${apiBase}/bookings/${bReq.id}/approve`, {
      headers: { Authorization: `Bearer ${dToken}` },
    });

    // Driver starts ride (IN_PROGRESS)
    await driverPage.request.post(`${apiBase}/rides/${activeRide.id}/start`, {
      headers: { Authorization: `Bearer ${dToken}` },
    });

    // Driver posts first GPS location
    await driverPage.request.post(`${apiBase}/rides/${activeRide.id}/location-update`, {
      headers: { Authorization: `Bearer ${dToken}` },
      data: {
        latitude: 12.9249,
        longitude: 80.1265,
        heading: 180,
        speedKmh: 35,
        accuracy: 10,
      },
    });

    // ───────────────────────────────────────────────────────────────────────────
    // J. Live Tracking – Mobile (390 x 844) Driver View
    // ───────────────────────────────────────────────────────────────────────────
    await driverPage.goto(`http://127.0.0.1:5173/rides/${activeRide.id}/track`);
    await driverPage.waitForSelector('#tracking-status-pill', { timeout: 10000 });
    await driverPage.waitForTimeout(1500);
    await driverPage.screenshot({
      path: path.join(screenshotDir, '09_live_tracking_mobile.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // K. Boarding OTP – Mobile (390 x 844) Passenger View
    // ───────────────────────────────────────────────────────────────────────────
    await passPage.goto(`http://127.0.0.1:5173/rides/${activeRide.id}/track`);
    await passPage.waitForSelector('#passenger-boarding-otp-card', { timeout: 10000 });
    await passPage.waitForTimeout(1500);
    await passPage.screenshot({
      path: path.join(screenshotDir, '10_boarding_otp_mobile.png'),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // L. Dashboard – Mobile 375 x 812 (iPhone SE / X)
    // ───────────────────────────────────────────────────────────────────────────
    const seCtx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const sePage = await seCtx.newPage();
    await loginAsDevUser(sePage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await sePage.goto('http://127.0.0.1:5173/dashboard');
    await sePage.waitForSelector('.container');
    await sePage.waitForTimeout(1000);
    await sePage.screenshot({
      path: path.join(screenshotDir, '11_dashboard_mobile_375x812.png'),
    });
    await seCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // M. Dashboard – Mobile 360 x 800 (Android)
    // ───────────────────────────────────────────────────────────────────────────
    const androidCtx = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const androidPage = await androidCtx.newPage();
    await loginAsDevUser(androidPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await androidPage.goto('http://127.0.0.1:5173/dashboard');
    await androidPage.waitForSelector('.container');
    await androidPage.waitForTimeout(1000);
    const androidHScroll = await androidPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(androidHScroll).toBe(false);
    await androidPage.screenshot({
      path: path.join(screenshotDir, '12_dashboard_mobile_360x800.png'),
    });
    await androidCtx.close();

    // ───────────────────────────────────────────────────────────────────────────
    // N. Dashboard & Hero – Mobile 430 x 932 (Large Device / Pro Max)
    // ───────────────────────────────────────────────────────────────────────────
    const proMaxCtx = await browser.newContext({
      viewport: { width: 430, height: 932 },
      isMobile: true,
      hasTouch: true,
    });
    const proMaxPage = await proMaxCtx.newPage();
    await loginAsDevUser(proMaxPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await proMaxPage.goto('http://127.0.0.1:5173/dashboard');
    await proMaxPage.waitForSelector('.container');
    await proMaxPage.waitForTimeout(1000);
    const proMaxHScroll = await proMaxPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(proMaxHScroll).toBe(false);
    await proMaxPage.screenshot({
      path: path.join(screenshotDir, '13_dashboard_mobile_430x932.png'),
    });

    // Also check homepage hero on 430 x 932
    await proMaxPage.goto('http://127.0.0.1:5173/');
    await proMaxPage.waitForSelector('.hero-section');
    await expect(proMaxPage.locator('.hero-title')).toContainText(/Going the Same Way\? Ride Together\./i);
    const heroHScroll = await proMaxPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(heroHScroll).toBe(false);
    await proMaxCtx.close();

    await driverCtx.close();
    await passCtx.close();
    await dashMobCtx.close();
  });
});
