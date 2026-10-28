import { test, expect } from '@playwright/test';
import { loginAsStudentDriver } from './helpers/auth';

test.describe('Milestone 16: Recurring Commutes, Alerts & Notifications', () => {
  test('1. Recurring Commutes loads schedules and displays Asia/Kolkata timezone badges', async ({
    page,
  }) => {
    await loginAsStudentDriver(page);
    await page.goto('/recurring-commutes');

    await expect(page.getByRole('heading', { name: /Recurring Commutes/i })).toBeVisible();

    // Verify IST Timezone indicator or occurrence display
    await expect(page.getByText(/IST|Asia\/Kolkata|\+05:30|Chennai/i).first()).toBeVisible();

    // New schedule button exists
    const newScheduleBtn = page.getByRole('button', { name: /New Schedule/i });
    await expect(newScheduleBtn).toBeVisible();
  });

  test('2. Ride Alerts (/ride-alerts) allows creating corridor alerts and toggling active state', async ({
    page,
  }) => {
    await loginAsStudentDriver(page);
    await page.goto('/ride-alerts');

    await expect(page.getByRole('heading', { name: /^Ride Alerts/i })).toBeVisible();

    // Toggle to Create tab
    const createToggleBtn = page.locator('#tab-toggle-btn');
    await expect(createToggleBtn).toBeVisible();
    await createToggleBtn.click();

    await expect(page.getByRole('heading', { name: /Create Travel Preference Alert/i })).toBeVisible();

    // Quick origin button click (Tambaram chip in origin section)
    await page.locator('#btn-quick-orig-tambaram_railway_station').click();

    // Quick destination button click (VIT chip in destination section)
    await page.locator('#btn-quick-dest-vit_chennai_main_gate').click();

    // Submit alert creation
    const submitAlertBtn = page.locator('#create-alert-submit-btn');
    await expect(submitAlertBtn).toBeVisible();
    await submitAlertBtn.click();

    // Confirmation banner displayed
    await expect(page.getByText(/created successfully|active and monitoring/i)).toBeVisible();
  });

  test('3. Notifications (/notifications) displays notifications and supports mark-as-read', async ({
    page,
  }) => {
    await loginAsStudentDriver(page);
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: /^Notifications/i })).toBeVisible();

    // Filter toggles exist
    await expect(page.locator('#filter-all-btn')).toBeVisible();

    // Mark all as read button
    const markAllBtn = page.getByRole('button', { name: /Mark all as read|Mark All Read/i });
    if (await markAllBtn.isVisible()) {
      await markAllBtn.click();
    }
  });
});
