import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginAsSuperAdmin } from './helpers/auth';

const outDir = '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/admin_ops_screenshots';

test.describe('Admin Control Centre Screenshot Capture', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
  });

  test('Capture high-res desktop and mobile operations centre screenshots', async ({ page, isMobile }) => {
    if (!isMobile) {
      // 1. Admin login screen
      await page.goto('/admin/login');
      await page.waitForSelector('#admin-email');
      await page.screenshot({ path: path.join(outDir, '01_admin_login_desktop.png') });

      // 2. Admin 2FA screen
      await page.locator('#admin-email').fill('admin.safety@vitstudent.ac.in');
      await page.locator('#btn-admin-continue').click();
      await page.waitForSelector('#admin-mfa-code');
      await page.screenshot({ path: path.join(outDir, '02_admin_login_2fa_desktop.png') });

      // 3. Super Admin Dashboard (Inject session)
      await loginAsSuperAdmin(page);
      await page.goto('/admin');
      await page.waitForSelector('#tab-admin-overview');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '03_admin_overview_desktop.png') });

      // 4. Rides Oversight Tab
      await page.locator('#tab-admin-rides').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '04_admin_rides_oversight_desktop.png') });

      // 5. Bookings Oversight Tab
      await page.locator('#tab-admin-bookings').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '05_admin_bookings_oversight_desktop.png') });

      // 6. Moderation & Trust Tab
      await page.locator('#tab-admin-safety').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '06_admin_moderation_safety_desktop.png') });

      // 7. Users Governance Tab
      await page.locator('#tab-admin-users').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '07_admin_users_governance_desktop.png') });

      // 8. Live System Health Tab
      await page.locator('#tab-admin-health').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '08_admin_system_health_desktop.png') });

      // 9. Administrator Team & Invitations Tab
      await page.locator('#tab-admin-team').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '09_admin_team_rbac_desktop.png') });
    } else {
      // 10. Mobile operations layout
      await loginAsSuperAdmin(page);
      await page.goto('/admin');
      await page.waitForSelector('#tab-admin-overview');
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '10_admin_control_centre_mobile.png') });
    }
  });
});

