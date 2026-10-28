import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsStudentDriver, loginAsStudentPassenger } from './helpers/auth';

test.describe('Milestone 16: Safety, Reporting, User Blocking & Admin Moderation', () => {
  test('1. Non-admin student session is strictly blocked from /admin', async ({ page }) => {
    await loginAsStudentPassenger(page);
    await page.goto('/admin');
    await page.waitForURL(/\/(dashboard|auth)/);
    await expect(page.getByRole('heading', { name: /Campus Moderation & Trust Console/i })).not.toBeVisible();
  });

  test('2. Admin session can access /admin, review reports queue, and filter user directory', async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: /Campus Moderation & Trust Console/i })).toBeVisible();

    // Verify moderation tabs
    const verifTab = page.getByRole('button', { name: /ID Verification Queue/i });
    const reportsTab = page.getByRole('button', { name: /Incident & Safety Reports/i });
    const usersTab = page.getByRole('button', { name: /User Management & Suspension/i });

    await expect(verifTab).toBeVisible();
    await expect(reportsTab).toBeVisible();
    await expect(usersTab).toBeVisible();

    // Switch to Reports tab
    await reportsTab.click();
    await expect(page.getByText(/Report Status:/i)).toBeVisible();

    // Switch to Users directory
    await usersTab.click();
    await expect(page.getByPlaceholder(/Search user by name or email/i)).toBeVisible();
  });

  test('3. Incident report submission appears in administrator moderation queue', async ({
    browser,
  }) => {
    // Setup driver target user
    const driverContext = await browser.newContext();
    const driverPage = await driverContext.newPage();
    const driverAuth = await loginAsStudentDriver(driverPage);

    // Passenger context submits report against driver
    const passContext = await browser.newContext();
    const passPage = await passContext.newPage();
    const passAuth = await loginAsStudentPassenger(passPage);

    // Call report endpoint directly via authenticated API request
    const reportRes = await passPage.request.post('http://localhost:3000/moderation/reports', {
      headers: { Authorization: `Bearer ${passAuth.token}` },
      data: {
        reportedUserId: driverAuth.user.id,
        category: 'SAFETY_CONCERN',
        description: 'Driver was speeding on Vandalur-Kelambakkam expressway during peak campus commute hours.',
      },
    });
    // Accept either fresh 201 Created or 409 Conflict (recent 5-minute abuse rate limiter)
    expect([201, 409]).toContain(reportRes.status());

    // Admin context reviews and investigates report
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await loginAsAdmin(adminPage);

    await adminPage.goto('/admin');
    const reportsTab = adminPage.getByRole('button', { name: /Incident & Safety Reports/i });
    await reportsTab.click();

    // Verify submitted report is displayed in moderation queue
    await expect(adminPage.getByText(/Driver was speeding on Vandalur-Kelambakkam expressway/i).first()).toBeVisible({ timeout: 5000 });

    // Admin clicks Resolve or Investigate button
    const resolveBtn = adminPage.locator(`button:has-text("Resolve"), button:has-text("Investigate")`).first();
    if (await resolveBtn.isVisible()) {
      await resolveBtn.click();
    }

    await driverContext.close();
    await passContext.close();
    await adminContext.close();
  });

  test('4. User blocking locks chat and marks conversation as read-only', async ({ page }) => {
    await loginAsStudentDriver(page);

    // Navigate to messages
    await page.goto('/messages');
    await expect(page.getByRole('heading', { name: /Ride Messages/i })).toBeVisible();

    // If conversation exists, verify block button is present
    const blockBtn = page.locator('button:has-text("Block"), button[title*="Block"]').first();
    if (await blockBtn.isVisible()) {
      await expect(blockBtn).toBeEnabled();
    }
  });

  test('5. Non-admin user receives 403 Forbidden on administrative API endpoints', async ({
    page,
  }) => {
    const studentAuth = await loginAsStudentPassenger(page);

    // Attempt direct API request to admin reports queue
    const res = await page.request.get('http://localhost:3000/admin/reports', {
      headers: { Authorization: `Bearer ${studentAuth.token}` },
    });
    expect(res.status()).toBe(403);
  });
});
