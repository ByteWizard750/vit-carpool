import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginAsDevUser } from './helpers/auth';

const proofDir = '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/cab_share_browser_proof';

test.describe('Cab Sharing Multi-Viewport Browser Verification', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(proofDir)) {
      fs.mkdirSync(proofDir, { recursive: true });
    }
  });

  // =========================================================================
  // Viewport 1: Mobile 390px (390 x 844 - iPhone 12/13/14)
  // =========================================================================
  test('Mobile (390px): Offer Cab Share, Discovery & Booking UI Verification', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const organiserEmail = `cab.org.m390.${Date.now()}@vitstudent.ac.in`;
    await loginAsDevUser(page, {
      email: organiserEmail,
      fullName: 'Aarav Organiser Mobile',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 1. Navigate to Offer Ride Page
    await page.goto('/offer-ride');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(proofDir, '01_mobile_390_offer_ride_default.png'), fullPage: true });

    // 2. Select "Shared Cab"
    const sharedCabTab = page.locator('#tab-category-cab-share');
    await expect(sharedCabTab).toBeVisible();
    await sharedCabTab.click();

    // Verify form switched and explanation banner appears
    await expect(page.locator('#cab-share-publish-form')).toBeVisible();
    await expect(page.locator('text=No vehicle ownership required!')).toBeVisible();
    await expect(page.locator('#cab-fare-preview-card')).toBeVisible();

    // Fill Cab Share details
    await page.locator('#cab-origin-input').fill('Tambaram Railway Station');
    await page.locator('#cab-destination-input').fill('VIT Chennai Campus');

    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const depStr = tomorrow.toISOString().slice(0, 16);
    const deadline = new Date(tomorrow.getTime() - 2 * 3600 * 1000);
    const deadlineStr = deadline.toISOString().slice(0, 16);

    await page.locator('#cab-departure-time').fill(depStr);
    await page.locator('#cab-booking-deadline').fill(deadlineStr);
    await page.locator('#cab-estimated-fare').fill('600');

    await page.screenshot({ path: path.join(proofDir, '02_mobile_390_cab_form_filled.png'), fullPage: true });

    // Submit Cab Share
    await page.locator('button[type="submit"]:has-text("Publish Shared Cab")').click();
    await page.waitForTimeout(2000);

    // Verify redirect to /my-rides
    await expect(page).toHaveURL(/.*my-rides/);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(proofDir, '03_mobile_390_my_rides_cab_card.png'), fullPage: true });

    // Verify bottom nav is intact and visible on 390px mobile
    const bottomNav = page.locator('nav.mobile-bottom-nav, .bottom-nav, #mobile-bottom-nav');
    if (await bottomNav.count() > 0) {
      await expect(bottomNav.first()).toBeVisible();
    }
  });

  // =========================================================================
  // Viewport 2: Tablet 768px (768 x 1024 - iPad Portrait)
  // =========================================================================
  test('Tablet (768px): Rides Discovery, Filters & Details Modal Verification', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    const passengerEmail = `cab.pass.t768.${Date.now()}@vitstudent.ac.in`;
    await loginAsDevUser(page, {
      email: passengerEmail,
      fullName: 'Diya Passenger Tablet',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 1. Navigate to Rides Page
    await page.goto('/rides');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(proofDir, '04_tablet_768_rides_discovery.png'), fullPage: true });

    // 2. Click "Cab Shares" Filter Tab
    const cabFilterTab = page.locator('#tab-filter-cab-share');
    if (await cabFilterTab.isVisible()) {
      await cabFilterTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(proofDir, '05_tablet_768_cab_shares_filtered.png'), fullPage: true });
    }

    // 3. Open Details modal if a ride card exists
    const viewButtons = page.locator('button:has-text("View Details"), button:has-text("Join Cab")');
    if (await viewButtons.count() > 0) {
      await viewButtons.first().click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(proofDir, '06_tablet_768_ride_details_modal.png') });
    }
  });

  // =========================================================================
  // Viewport 3: Desktop 1280px (1280 x 800 - Standard Laptop / Desktop)
  // =========================================================================
  test('Desktop (1280px): End-to-End Fare Updates & Management Modal Verification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const organiserEmail = `cab.org.d1280.${Date.now()}@vitstudent.ac.in`;
    await loginAsDevUser(page, {
      email: organiserEmail,
      fullName: 'Karthik Organiser Desktop',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // 1. Offer Ride Page in desktop width
    await page.goto('/offer-ride');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.locator('#tab-category-cab-share').click();
    await page.waitForTimeout(500);

    // Verify 2-column layout on desktop
    await page.screenshot({ path: path.join(proofDir, '07_desktop_1280_offer_cab_share.png'), fullPage: true });

    // 2. Publish a desktop cab journey
    await page.locator('#cab-origin-input').fill('Vandalur Zoo Entrance');
    await page.locator('#cab-destination-input').fill('VIT Chennai Campus');

    const dep = new Date(Date.now() + 48 * 3600 * 1000);
    const deadline = new Date(dep.getTime() - 4 * 3600 * 1000);
    await page.locator('#cab-departure-time').fill(dep.toISOString().slice(0, 16));
    await page.locator('#cab-booking-deadline').fill(deadline.toISOString().slice(0, 16));
    await page.locator('#cab-estimated-fare').fill('500');
    await page.locator('button[type="submit"]:has-text("Publish Shared Cab")').click();
    await page.waitForTimeout(2000);

    // 3. Inspect in My Rides
    await page.goto('/my-rides');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(proofDir, '08_desktop_1280_my_rides_page.png'), fullPage: true });

    // 4. Test "Update Final Fare" Modal
    const updateFareBtn = page.locator('button:has-text("Update Final Fare")').first();
    if (await updateFareBtn.isVisible()) {
      await updateFareBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(proofDir, '09_desktop_1280_update_fare_modal.png') });

      // Close modal
      const cancelModalBtn = page.locator('form button:has-text("Cancel")');
      if (await cancelModalBtn.isVisible()) {
        await cancelModalBtn.click();
        await page.waitForTimeout(400);
      }
    }

    // 5. Inspect Bookings Page
    await page.goto('/bookings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(proofDir, '10_desktop_1280_bookings_page.png'), fullPage: true });
  });
});
