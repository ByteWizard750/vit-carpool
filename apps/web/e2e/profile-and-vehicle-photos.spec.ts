import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Profile Picture & Car Photos Upload Flow', () => {
  const apiBase = 'http://localhost:3000';
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/photo_screenshots',
  );

  // 1x1 valid PNG buffer for tests
  const testPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('User can upload profile picture and vehicle photo', async ({ page }) => {
    const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userEmail = `photo.tester.${uniqueSuffix}@vitstudent.ac.in`;
    const regNum = `TN 09 AB ${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. Login as verified dev student
    const { token } = await loginAsDevUser(page, {
      email: userEmail,
      fullName: 'Rohan PhotoTester',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Profile Page: Upload Profile Picture
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('http://localhost:5173/profile');
    await page.waitForLoadState('networkidle');

    // Verify avatar upload button is visible
    const changeAvatarBtn = page.locator('#btn-change-avatar');
    await expect(changeAvatarBtn).toBeVisible();

    // Trigger file input and wait for upload response
    const uploadPromise = page.waitForResponse(
      (r) => r.url().includes('/users/me/avatar') && (r.status() === 201 || r.status() === 200),
    );
    const fileChooserPromise = page.waitForEvent('filechooser');
    await changeAvatarBtn.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: testPngBuffer,
    });
    await uploadPromise;

    // Verify avatar image is rendered inside profile-avatar-display
    const avatarImg = page.locator('#profile-avatar-display img');
    await expect(avatarImg).toBeVisible({ timeout: 10000 });

    // Verify Account Menu in Navbar now shows avatar image (desktop)
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    if (!isMobile) {
      const navAvatarImg = page.locator('#account-menu-trigger img');
      await expect(navAvatarImg).toBeVisible();
    }

    // Capture Screenshot: Profile Page with Avatar
    await page.screenshot({
      path: path.join(screenshotDir, '01_profile_page_with_avatar.png'),
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Vehicles Page: Register Car with Photo
    // ─────────────────────────────────────────────────────────────────────────
    await page.goto('http://localhost:5173/vehicles');
    await page.waitForLoadState('networkidle');

    // Click "Register a Vehicle"
    const registerBtn = page.locator('button:has-text("Register a Vehicle")').first();
    await registerBtn.click();

    // Modal opens
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();

    // Fill vehicle details
    await page.locator('input[placeholder="e.g. Maruti Suzuki"]').fill('Tata');
    await page.locator('input[placeholder="e.g. Swift"]').fill('Harrier Dark Edition');
    await page.locator('input[placeholder="e.g. Silver"]').fill('Oberon Black');
    await page.locator('input[placeholder="e.g. TN19AJ4321"]').fill(regNum);

    // Upload car photo via modal dropzone
    const carFileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#dropzone-vehicle-photo').click();
    const carFileChooser = await carFileChooserPromise;
    await carFileChooser.setFiles({
      name: 'harrier.png',
      mimeType: 'image/png',
      buffer: testPngBuffer,
    });

    // Vehicle preview image shows in modal
    await expect(page.locator('img[alt="Vehicle preview"]')).toBeVisible();

    // Submit modal
    await page.locator('button:has-text("Register Car")').click();

    // Modal closes & vehicle card renders with car photo
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    const vehicleCard = page.locator('.vehicle-card').first();
    await expect(vehicleCard).toBeVisible({ timeout: 10000 });
    await expect(vehicleCard).toContainText('Tata Harrier Dark Edition');

    // Car photo is displayed in card banner
    const carImg = vehicleCard.locator('img[alt="Tata Harrier Dark Edition"]');
    await expect(carImg).toBeVisible();

    // Capture Screenshot: Vehicles Page with Car Photo
    await page.screenshot({
      path: path.join(screenshotDir, '02_vehicles_page_with_car_photo.png'),
    });

    console.log('[E2E] Profile and Vehicle photos successfully uploaded and verified!');
  });
});
