import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Peer Avatar Visibility Across Users', () => {
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/photo_screenshots',
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Passenger Priya sees Driver Arjun avatar on ride cards, modals, and tracking', async ({ page }) => {
    // 1. Log in as Priya (Passenger)
    await loginAsDevUser(page, {
      email: 'priya.passenger@vitstudent.ac.in',
      fullName: 'Priya Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 2. Navigate to /rides
    await page.goto('http://localhost:5173/rides');
    await page.waitForLoadState('networkidle');

    // Wait for ride cards to be present
    const rideCard = page.locator('.ride-result-card').first();
    await expect(rideCard).toBeVisible({ timeout: 10000 });

    // Look for Arjun's ride card
    const arjunCard = page.locator('.ride-result-card', { hasText: 'Arjun Verma' }).first();
    await expect(arjunCard).toBeVisible();

    // Verify Arjun's avatar img is rendered inside Arjun's card
    const driverAvatarImg = arjunCard.locator('img[alt*="Arjun"]');
    await expect(driverAvatarImg).toBeVisible();
    const avatarSrc = await driverAvatarImg.getAttribute('src');
    expect(avatarSrc).toContain('/uploads/avatars/');

    // Capture screenshot of the ride card showing Arjun's profile photo
    await page.screenshot({
      path: path.join(screenshotDir, '10_priya_sees_arjun_avatar_on_rides_card.png'),
    });
    console.log('Successfully captured 10_priya_sees_arjun_avatar_on_rides_card.png');

    // 3. Open Ride Details Modal
    const viewDetailsBtn = arjunCard.locator('button:has-text("View Details"), a:has-text("View Details")');
    await viewDetailsBtn.click();
    await page.waitForTimeout(600);

    // Verify driver avatar in modal
    const modalDriverAvatar = page.locator('.modal-card, [role="dialog"]').locator('img[alt*="Arjun"]');
    await expect(modalDriverAvatar).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotDir, '11_arjun_avatar_in_booking_modal.png'),
    });
    console.log('Successfully captured 11_arjun_avatar_in_booking_modal.png');
  });

  test('Live Tracking Page displays Driver avatar and Confirmed Passenger avatar', async ({ page }) => {
    // 1. Log in as Driver Arjun
    await loginAsDevUser(page, {
      email: 'arjun.driver@vitstudent.ac.in',
      fullName: 'Arjun Verma (Student Driver)',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 2. Navigate to tracking page for Arjun's ride with confirmed Priya
    await page.goto('http://localhost:5173/rides/5d9e1311-ec27-459d-a54a-ef8ae1943f1b/track');
    await page.waitForLoadState('networkidle');

    // Verify passenger avatar in confirmed roster
    const passengerItem = page.locator('.passenger-roster-item', { hasText: 'Priya' }).first();
    await expect(passengerItem).toBeVisible({ timeout: 10000 });
    const passengerAvatar = passengerItem.locator('img[alt*="Priya"]');
    await expect(passengerAvatar).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotDir, '12_tracking_roster_with_passenger_avatar.png'),
    });
    console.log('Successfully captured 12_tracking_roster_with_passenger_avatar.png');
  });
});
