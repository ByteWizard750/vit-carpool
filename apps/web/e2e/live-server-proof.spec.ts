import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginAsStudentDriver, loginAsSuperAdmin } from './helpers/auth';

const outDir = '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/live_server_proof';

test.describe('Live Server Proof Screenshots', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
  });

  test('Capture Desktop Proof Screenshots', async ({ page, isMobile }) => {
    if (isMobile) return;

    // 1. Landing & Auth Page
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(outDir, '01_auth_login_desktop.png'), fullPage: true });

    // 2. Student Dashboard
    await loginAsStudentDriver(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '02_student_dashboard_desktop.png'), fullPage: true });

    // 3. Rides Discovery Page
    await page.goto('/rides');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '03_rides_discovery_desktop.png'), fullPage: true });

    // 4. Offer Ride Page
    await page.goto('/offer-ride');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '04_offer_ride_desktop.png'), fullPage: true });

    // 5. Admin Governance Dashboard
    await loginAsSuperAdmin(page);
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '05_admin_dashboard_desktop.png'), fullPage: true });
  });

  test('Capture Mobile Proof Screenshots', async ({ page, isMobile }) => {
    if (!isMobile) return;

    // 6. Mobile Dashboard
    await loginAsStudentDriver(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '06_mobile_dashboard.png'), fullPage: true });

    // 7. Mobile Rides Discovery
    await page.goto('/rides');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '07_mobile_rides_discovery.png'), fullPage: true });
  });
});

