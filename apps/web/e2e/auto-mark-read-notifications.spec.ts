import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';

test.describe('Automated Notification Read Tracking & Navigation', () => {
  const apiBase = 'http://localhost:3000';

  test('Comprehensive verification: Automatic read marking, persistent state, badge decrement, isolated unread preservation', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const driverEmail = `auto.driver.${unique}@vitstudent.ac.in`;
    const p1Email = `auto.p1.${unique}@vitstudent.ac.in`;
    const p2Email = `auto.p2.${unique}@vitstudent.ac.in`;
    const regNum = `TN 09 AR ${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Setup Driver with published ride
    const { token: driverToken, user: driverUser } = await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Dev Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const vRes = await page.request.post(`${apiBase}/vehicles`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: {
        make: 'Tata',
        model: 'Nexon',
        color: 'Foliage Green',
        registrationNumber: regNum,
        capacity: 4,
      },
    });
    expect(vRes.ok()).toBeTruthy();
    const vehicle = await vRes.json();

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
        departureTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        availableSeats: 3,
        costPerSeat: 50,
      },
    });
    expect(rRes.ok()).toBeTruthy();
    const ride = await rRes.json();

    // 2. Passenger 1 books a seat -> generates Notification 1 for Driver
    const p1Context = await browser.newContext();
    const p1Page = await p1Context.newPage();
    const { token: p1Token } = await loginAsDevUser(p1Page, {
      email: p1Email,
      fullName: 'Priya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const b1Res = await p1Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p1Token}` },
      data: { rideId: ride.id, requestedSeats: 1 },
    });
    expect(b1Res.ok()).toBeTruthy();
    const booking1 = await b1Res.json();

    // 3. Passenger 2 books a seat -> generates Notification 2 for Driver
    const p2Context = await browser.newContext();
    const p2Page = await p2Context.newPage();
    const { token: p2Token } = await loginAsDevUser(p2Page, {
      email: p2Email,
      fullName: 'Rahul Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const b2Res = await p2Page.request.post(`${apiBase}/bookings`, {
      headers: { Authorization: `Bearer ${p2Token}` },
      data: { rideId: ride.id, requestedSeats: 1 },
    });
    expect(b2Res.ok()).toBeTruthy();
    const booking2 = await b2Res.json();

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT 1: A newly received notification appears as unread
    // -------------------------------------------------------------------------
    await page.goto('/notifications');
    await page.waitForSelector('.notification-item', { timeout: 10000 });

    // Expect 2 notification cards
    const cards = page.locator('.notification-item');
    await expect(cards).toHaveCount(2);

    // Verify unread badge in Updates tab shows 2
    const updatesTabBadge = page.locator('#tab-inbox-updates .segmented-tab-badge');
    await expect(updatesTabBadge).toHaveText('2');

    // Both cards have exact 'NEW' badge
    await expect(cards.nth(0).getByText('NEW', { exact: true })).toBeVisible();
    await expect(cards.nth(1).getByText('NEW', { exact: true })).toBeVisible();

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT: Ensure NO "Mark Read" button exists on any card
    // -------------------------------------------------------------------------
    const markReadButtons = page.locator('button[title="Mark as read"]');
    await expect(markReadButtons).toHaveCount(0);

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT 2, 3 & 7: Opening Notification 1 automatically marks it as read,
    // decrements unread badge immediately, and navigates correctly to Dashboard
    // -------------------------------------------------------------------------
    // Click card 0 (Booking request from Rahul)
    const card0 = cards.first();
    await card0.click();

    // Verify navigated to /dashboard
    await page.waitForURL(/\/dashboard/);
    await expect(page).toHaveURL(/\/dashboard/);

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT 4 & 5:
    // - Opening Notification 1 does NOT mark Notification 2 as read.
    // - Notification 1 remains read after page refresh.
    // - Unread count decreased to 1.
    // -------------------------------------------------------------------------
    await page.goto('/notifications');
    await page.waitForSelector('.notification-item', { timeout: 10000 });

    // Badge in Updates tab should now be 1
    await expect(page.locator('#tab-inbox-updates .segmented-tab-badge')).toHaveText('1');

    // Card 1 still has 'NEW' (Priya's request), Card 0 does NOT have 'NEW' (Rahul's request)
    const cardRahul = page.locator('.notification-item', { hasText: 'Rahul Passenger' });
    const cardPriya = page.locator('.notification-item', { hasText: 'Priya Passenger' });

    await expect(cardRahul.getByText('NEW', { exact: true })).toHaveCount(0);
    await expect(cardPriya.getByText('NEW', { exact: true })).toBeVisible();

    // Refresh page: verify read status is persistently saved in database
    await page.reload();
    await page.waitForSelector('.notification-item', { timeout: 10000 });

    await expect(page.locator('#tab-inbox-updates .segmented-tab-badge')).toHaveText('1');
    await expect(cardRahul.getByText('NEW', { exact: true })).toHaveCount(0);
    await expect(cardPriya.getByText('NEW', { exact: true })).toBeVisible();

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT: Opening Notification 2 via its direct action button
    // marks it as read as well
    // -------------------------------------------------------------------------
    const actionBtn = cardPriya.locator('[id^="notif-action-btn-"]').first();
    await expect(actionBtn).toBeVisible();
    await actionBtn.click();

    await page.waitForURL(/\/dashboard/);

    // Return to notifications: both are now read
    await page.goto('/notifications');
    await page.waitForSelector('.notification-item', { timeout: 10000 });

    // Unread badge is gone
    await expect(page.locator('#tab-inbox-updates .segmented-tab-badge')).toHaveCount(0);
    await expect(page.locator('.notification-item').getByText('NEW', { exact: true })).toHaveCount(0);

    // -------------------------------------------------------------------------
    // TEST REQUIREMENT 6: Receiving a notification without opening leaves it unread
    // -------------------------------------------------------------------------
    // Driver approves booking 1 -> emits BOOKING_APPROVED for Passenger 1
    const appRes = await page.request.post(`${apiBase}/bookings/${booking1.id}/approve`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(appRes.ok()).toBeTruthy();

    // Passenger 1 checks unread count endpoint directly
    const p1CountRes = await p1Page.request.get(`${apiBase}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${p1Token}` },
    });
    expect(p1CountRes.ok()).toBeTruthy();
    const p1CountData = await p1CountRes.json();
    expect(p1CountData.unreadCount).toBe(1);

    // Passenger 1 navigates to notifications list (just renders, doesn't click)
    await p1Page.goto('/notifications');
    await p1Page.waitForSelector('.notification-item', { timeout: 10000 });

    // The notification is still unread!
    const p1Card = p1Page.locator('.notification-item').first();
    await expect(p1Card.getByText('NEW', { exact: true })).toBeVisible();
    await expect(p1Page.locator('#tab-inbox-updates .segmented-tab-badge')).toHaveText('1');

    // Cleanup contexts
    await p1Context.close();
    await p2Context.close();
  });
});
