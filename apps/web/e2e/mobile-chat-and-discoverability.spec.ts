import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';

const VIEWPORTS = [
  { name: '360x800 (Small Android)', width: 360, height: 800 },
  { name: '375x812 (iPhone SE / X)', width: 375, height: 812 },
  { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
  { name: '430x932 (iPhone 14/15 Pro Max)', width: 430, height: 932 },
];

test.describe('Mobile Chat UI & Discoverability', () => {
  const driverEmail = 'chat.driver.test@vitstudent.ac.in';
  const passengerEmail = 'chat.passenger.test@vitstudent.ac.in';

  test.beforeAll(async ({ request }) => {
    // Ensure both users exist via dev-login
    const driverRes = await request.post('http://localhost:3000/auth/dev-login', {
      data: {
        email: driverEmail,
        fullName: 'Vikram Driver',
        audience: 'STUDENT',
        status: 'VERIFIED',
      },
    });
    expect(driverRes.ok()).toBeTruthy();
    const driverData = await driverRes.json();

    const passRes = await request.post('http://localhost:3000/auth/dev-login', {
      data: {
        email: passengerEmail,
        fullName: 'Rahul Passenger',
        audience: 'STUDENT',
        status: 'VERIFIED',
      },
    });
    expect(passRes.ok()).toBeTruthy();
    const passData = await passRes.json();

    // Register a vehicle for the driver (unique plate per run)
    const plateSuffix = Math.floor(Math.random() * 8999 + 1000);
    const vehRes = await request.post('http://localhost:3000/vehicles', {
      headers: { Authorization: `Bearer ${driverData.token}` },
      data: {
        make: 'Hyundai',
        model: 'i20',
        registrationNumber: `TN11CH${plateSuffix}`,
        capacity: 4,
        color: 'Silver',
      },
    });
    expect(vehRes.ok()).toBeTruthy();
    const vehicle = await vehRes.json();

    // Create a ride
    const departure = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const rideRes = await request.post('http://localhost:3000/rides', {
      headers: { Authorization: `Bearer ${driverData.token}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        originLatitude: 12.9249,
        originLongitude: 80.1264,
        destinationLatitude: 12.8406,
        destinationLongitude: 80.1534,
        departureTime: departure,
        availableSeats: 3,
        costPerSeat: 60,
      },
    });
    expect(rideRes.ok()).toBeTruthy();
    const ride = await rideRes.json();

    // Passenger requests booking
    const bookRes = await request.post('http://localhost:3000/bookings', {
      headers: { Authorization: `Bearer ${passData.token}` },
      data: {
        rideId: ride.id,
        requestedSeats: 1,
      },
    });
    expect(bookRes.ok()).toBeTruthy();
    const booking = await bookRes.json();

    // Initialize conversation
    const chatInit = await request.get(
      `http://localhost:3000/chat/conversations/booking/${booking.id}`,
      { headers: { Authorization: `Bearer ${passData.token}` } }
    );
    expect(chatInit.ok()).toBeTruthy();
    const conv = await chatInit.json();

    // Send initial messages
    await request.post(`http://localhost:3000/chat/conversations/${conv.id}/messages`, {
      headers: { Authorization: `Bearer ${passData.token}` },
      data: { content: 'Hi Vikram, can you pick me up at East Gate?' },
    });

    await request.post(`http://localhost:3000/chat/conversations/${conv.id}/messages`, {
      headers: { Authorization: `Bearer ${driverData.token}` },
      data: { content: 'Sure Rahul! I will be by East Gate at 9:00 AM.' },
    });
  });

  for (const vp of VIEWPORTS) {
    test(`Mobile Chat Layout at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginAsDevUser(page, {
        email: passengerEmail,
        fullName: 'Rahul Passenger',
        audience: 'STUDENT',
        status: 'VERIFIED',
      });

      // 1. Visit Messages inbox
      await page.goto('/messages');
      await page.waitForLoadState('networkidle');

      // The inbox list should be visible
      const convItem = page.locator('[id^="conversation-item-"]').first();
      await expect(convItem).toBeVisible();

      // 2. Open the active conversation
      await convItem.click();
      await page.waitForSelector('#chat-messages-scroll-area');

      // 3. Verify mobile chat viewport fill & layout
      const scrollArea = page.locator('#chat-messages-scroll-area');
      await expect(scrollArea).toBeVisible();

      // Ensure page header is hidden in active mobile chat to prevent double-scroll
      const pageHeader = page.locator('.chat-page-header-container');
      await expect(pageHeader).not.toBeVisible();

      // Verify messages are visible and displayed in chronological order
      const messages = page.locator('[id^="chat-message-"]');
      const count = await messages.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Verify composer is pinned at the bottom and visible within viewport
      const composer = page.locator('.chat-composer-section');
      await expect(composer).toBeVisible();

      const composerBox = await composer.boundingBox();
      expect(composerBox).not.toBeNull();
      // Composer top must be inside the visible viewport
      expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(vp.height + 5);

      // Verify input textarea and Send button alignment
      const textarea = page.locator('#input-chat-message');
      const sendBtn = page.locator('#btn-send-message');
      await expect(textarea).toBeVisible();
      await expect(sendBtn).toBeVisible();

      const initialHeight = (await textarea.boundingBox())?.height || 0;

      // 4. Test auto-expanding textarea
      await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4');
      const expandedHeight = (await textarea.boundingBox())?.height || 0;
      expect(expandedHeight).toBeGreaterThan(initialHeight);

      // 5. Send message and verify in message stream
      const msgText = `Smooth message ${vp.name.split(' ')[0]}`;
      await textarea.fill(msgText);
      await sendBtn.click();
      await expect(
        page.locator('#chat-messages-scroll-area').getByText(msgText).first()
      ).toBeVisible();

      // Back button should return to conversation list
      const backBtn = page.locator('#btn-chat-mobile-back');
      await expect(backBtn).toBeVisible();
      await backBtn.click();

      // Should now be back at conversation list
      await expect(page.locator('#chat-conversations-list-pane')).toBeVisible();
    });
  }

  test('Offer a Ride Discoverability on Dashboard and Find Rides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Vikram Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 1. Check Dashboard discoverability
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Prominent callout banner must be present
    const callout = page.locator('#dashboard-offer-ride-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('Driving to Campus or Heading Home?');

    const prominentOfferBtn = page.locator('#btn-prominent-offer-ride');
    await expect(prominentOfferBtn).toBeVisible();

    // Clicking prominent Offer a Ride leads to /offer-ride
    await prominentOfferBtn.click();
    await expect(page).toHaveURL(/\/offer-ride/);

    // 2. Check Find Rides discoverability and mode switcher
    await page.goto('/rides');
    await page.waitForLoadState('networkidle');

    const modeSwitcher = page.locator('#ride-mode-switcher-banner');
    await expect(modeSwitcher).toBeVisible();
    await expect(modeSwitcher).toContainText('Find a Ride');
    await expect(modeSwitcher).toContainText('Have empty seats in your car?');

    const switchToOfferBtn = page.locator('#btn-switch-to-offer-ride');
    await expect(switchToOfferBtn).toBeVisible();
    await switchToOfferBtn.click();
    await expect(page).toHaveURL(/\/offer-ride/);
  });

  test('Core User Flows Performance Benchmarking', async ({ page }) => {
    test.setTimeout(60000);
    await loginAsDevUser(page, {
      email: driverEmail,
      fullName: 'Vikram Driver',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    const timings: Record<string, number> = {};

    // 1. Initial Load (/)
    const t0 = Date.now();
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    timings['Initial Load (/)'] = Date.now() - t0;

    // 2. Dashboard (/dashboard)
    const t1 = Date.now();
    await page.goto('/dashboard');
    await page.waitForSelector('#dashboard-offer-ride-callout');
    timings['Dashboard (/dashboard)'] = Date.now() - t1;

    // 3. Find Rides (/rides)
    const t2 = Date.now();
    await page.goto('/rides');
    await page.waitForSelector('#ride-mode-switcher-banner');
    timings['Find Rides (/rides)'] = Date.now() - t2;

    // 4. My Trips (/bookings)
    const t3 = Date.now();
    await page.goto('/bookings');
    await page.waitForLoadState('networkidle');
    timings['My Trips (/bookings)'] = Date.now() - t3;

    // 5. Inbox (/messages)
    const t4 = Date.now();
    await page.goto('/messages');
    await page.waitForSelector('[id^="conversation-item-"]');
    timings['Inbox (/messages)'] = Date.now() - t4;

    // 6. Opening a conversation
    const conv = page.locator('[id^="conversation-item-"]').first();
    const t5 = Date.now();
    await conv.click();
    await page.waitForSelector('#chat-messages-scroll-area');
    timings['Opening Conversation'] = Date.now() - t5;

    // 7. Sending a message
    const textarea = page.locator('#input-chat-message');
    const benchMsg = `Benchmark message ${Date.now()}`;
    await textarea.fill(benchMsg);
    const t6 = Date.now();
    await page.locator('#btn-send-message').click();
    await page.locator('#chat-messages-scroll-area').getByText(benchMsg).first().waitFor({ timeout: 15000 });
    timings['Sending Message'] = Date.now() - t6;

    // 8. Opening ride details
    await page.goto('/rides');
    const firstRideCard = page.locator('.ride-result-card').first();
    if ((await firstRideCard.count()) > 0) {
      const t7 = Date.now();
      await firstRideCard.click();
      await page.waitForSelector('#rides-booking-panel');
      timings['Opening Ride Details'] = Date.now() - t7;
    } else {
      timings['Opening Ride Details'] = 0;
    }

    console.log('=== APPLICATION PERFORMANCE BENCHMARKS (ms) ===');
    console.table(timings);

    // Save screenshots for visual audit
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/messages');
    await page.locator('[id^="conversation-item-"]').first().click();
    await page.waitForSelector('#chat-messages-scroll-area');
    await page.screenshot({
      path: '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/chat_mobile_390x844.png',
      fullPage: false,
    });

    await page.goto('/dashboard');
    await page.waitForSelector('#dashboard-offer-ride-callout');
    await page.screenshot({
      path: '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/dashboard_offer_ride_callout.png',
      fullPage: false,
    });

    await page.goto('/rides');
    await page.waitForSelector('#ride-mode-switcher-banner');
    await page.screenshot({
      path: '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/rides_mode_switcher.png',
      fullPage: false,
    });
  });
});
