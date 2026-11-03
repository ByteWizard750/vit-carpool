import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Booking Lifecycle Notifications & Clean Updates Page', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/notifications_qa_screenshots'
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('End-to-End: Request -> Driver Notified -> Approve -> Passenger Notified -> Reject -> Clean Updates UI', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `driver.notif.${unique}@vitstudent.ac.in`;
    const p1Email = `pass1.notif.${unique}@vitstudent.ac.in`;
    const p2Email = `pass2.notif.${unique}@vitstudent.ac.in`;
    const regNum = `TN 22 NF ${Math.floor(1000 + Math.random() * 9000)}`;

    // ==========================================
    // STEP 1: Driver setup and ride publication
    // ==========================================
    const { token: driverToken, user: driverUser } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Aarav Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
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

    const depTime = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
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

    // ==========================================
    // STEP 2: Passenger 1 requests a ride
    // ==========================================
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    const { token: p1Token, user: p1User } = await loginAsDevUser(p1Page, {
      email: p1Email,
      fullName: 'Sneha Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const book1Res = await p1Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p1Token}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
      },
    });
    expect(book1Res.ok()).toBeTruthy();
    const booking1 = await book1Res.json();

    // ==========================================
    // STEP 3: Verify Driver received BOOKING_REQUESTED notification
    // ==========================================
    // Check driver's unread-count endpoint
    const driverCountRes = await page.request.get(`${apiBase}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(driverCountRes.ok()).toBeTruthy();
    const driverCountData = await driverCountRes.json();
    expect(driverCountData.count).toBeGreaterThanOrEqual(1);
    expect(driverCountData.unreadCount).toBeGreaterThanOrEqual(1);

    // Driver navigates to /notifications (Updates tab)
    await page.goto('/notifications');
    await page.waitForSelector('.notification-item', { timeout: 10000 });

    // Verify card content
    const driverNotifCard = page.locator('.notification-item').first();
    await expect(driverNotifCard).toBeVisible();
    await expect(driverNotifCard).toContainText('Sneha Passenger');
    await expect(driverNotifCard).toContainText('Booking Request');
    await expect(driverNotifCard).toContainText('Review in Dashboard');

    // Screenshot Driver Updates desktop
    await page.screenshot({
      path: path.join(screenshotDir, '01_driver_updates_booking_requested_desktop.png'),
    });

    // ==========================================
    // STEP 4: Driver approves Passenger 1 request
    // ==========================================
    const approveRes = await page.request.post(`${apiBase}/bookings/${booking1.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(approveRes.ok()).toBeTruthy();

    // ==========================================
    // STEP 5: Verify Passenger 1 received BOOKING_APPROVED notification
    // ==========================================
    await p1Page.goto('/notifications');
    await p1Page.waitForSelector('.notification-item', { timeout: 10000 });

    const p1NotifCard = p1Page.locator('.notification-item').first();
    await expect(p1NotifCard).toBeVisible();
    await expect(p1NotifCard).toContainText('Booking Approved');
    await expect(p1NotifCard).toContainText('View Booking & OTP');

    // Screenshot Passenger 1 Updates desktop
    await p1Page.screenshot({
      path: path.join(screenshotDir, '02_passenger1_updates_approved_desktop.png'),
    });

    // ==========================================
    // STEP 6: Passenger 2 requests ride -> Driver rejects
    // ==========================================
    const p2Context = await browser.newContext();
    const p2Page = await p2Context.newPage();
    const { token: p2Token } = await loginAsDevUser(p2Page, {
      email: p2Email,
      fullName: 'Karthik Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const book2Res = await p2Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p2Token}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
      },
    });
    expect(book2Res.ok()).toBeTruthy();
    const booking2 = await book2Res.json();

    // Driver rejects booking2 with reason
    const declineReason = 'Vehicle trunk is full, unable to take large bags';
    const rejectRes = await page.request.post(`${apiBase}/bookings/${booking2.id}/reject`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: { reason: declineReason },
    });
    expect(rejectRes.ok()).toBeTruthy();

    // ==========================================
    // STEP 7: Verify Passenger 2 received BOOKING_REJECTED notification
    // ==========================================
    await p2Page.goto('/notifications');
    await p2Page.waitForSelector('.notification-item', { timeout: 10000 });

    const p2NotifCard = p2Page.locator('.notification-item').first();
    await expect(p2NotifCard).toBeVisible();
    await expect(p2NotifCard).toContainText('Booking Declined');
    await expect(p2NotifCard).toContainText(declineReason);
    await expect(p2NotifCard).toContainText('Find Alternative Rides');

    // ==========================================
    // STEP 8: Test Interactive UI (Mark Read, Filter Chips, Delete)
    // ==========================================
    // Test filter chips on p2Page
    await p2Page.click('#filter-bookings-btn');
    await expect(p2Page.locator('.notification-item')).toHaveCount(1);

    await p2Page.click('#filter-rides-btn');
    await expect(p2Page.locator('.notification-item')).toHaveCount(0);

    await p2Page.click('#filter-all-btn');
    await expect(p2Page.locator('.notification-item')).toHaveCount(1);

    // Verify "Mark Read" button does NOT exist on the card
    await expect(p2Page.locator('button[title="Mark as read"]')).toHaveCount(0);

    // Clicking the notification action automatically marks it as read
    const actionBtn = p2Page.locator(`[id^="notif-action-btn-"]`).first();
    await expect(actionBtn).toBeVisible();
    await actionBtn.click();
    await p2Page.waitForURL(/\/rides/);

    // Navigate back to updates: verify it is now read
    await p2Page.goto('/notifications');
    await p2Page.waitForSelector('.notification-item', { timeout: 10000 });

    // Verify notification is read (no NEW badge)
    await expect(p2Page.locator('.notification-item').getByText('NEW', { exact: true })).toHaveCount(0);

    // Delete notification
    const deleteBtn = p2Page.locator(`button[title="Delete notification"]`).first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await expect(p2Page.getByText('No Updates Yet')).toBeVisible();

    // ==========================================
    // STEP 9: Mobile Usability Audit of Updates Page (390x844)
    // ==========================================
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await loginAsDevUser(mobilePage, {
      email: driverEmail,
      fullName: 'Aarav Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await mobilePage.goto('/notifications');
    await mobilePage.waitForSelector('.notification-item', { timeout: 10000 });

    // Capture mobile screenshot
    await mobilePage.screenshot({
      path: path.join(screenshotDir, '03_driver_updates_mobile_390x844.png'),
    });

    // Cleanup
    await p1Context.close();
    await p2Context.close();
    await mobileContext.close();
  });
});
