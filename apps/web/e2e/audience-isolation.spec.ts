import { test, expect } from '@playwright/test';
import { loginAsStudentPassenger, loginAsFacultyMember } from './helpers/auth';

test.describe('Milestone 16: Student & Faculty Cohort Separation', () => {
  test('1. Student session displays STUDENT audience banner and strictly lists student rides', async ({
    page,
  }) => {
    const auth = await loginAsStudentPassenger(page);
    expect(auth.user.audience).toBe('STUDENT');

    await page.goto('/rides');
    await expect(page.getByRole('heading', { name: /Campus Ride Discovery/i })).toBeVisible();

    // Verify audience indicator
    await expect(page.getByText(/Student Cohort|Student Peer Rides/i)).toBeVisible();

    // Perform search
    const searchBtn = page.getByRole('button', { name: /Search Rides/i });
    await searchBtn.click();

    // All visible rides must indicate Student cohort or not show Faculty rides
    const facultyBadges = page.locator('text="FACULTY Cohort"');
    await expect(facultyBadges).toHaveCount(0);
  });

  test('2. Faculty session displays FACULTY audience banner and lists faculty rides', async ({
    page,
  }) => {
    const auth = await loginAsFacultyMember(page);
    expect(auth.user.audience).toBe('FACULTY');

    await page.goto('/rides');
    await expect(page.getByRole('heading', { name: /Campus Ride Discovery/i })).toBeVisible();

    // Verify faculty audience indicator
    await expect(page.getByText(/Faculty Cohort|Faculty Peer Rides/i)).toBeVisible();

    // Perform search
    const searchBtn = page.getByRole('button', { name: /Search Rides/i });
    await searchBtn.click();

    // Student rides must not appear in faculty view
    const studentBadges = page.locator('text="STUDENT Cohort"');
    await expect(studentBadges).toHaveCount(0);
  });

  test('3. Client-side query tampering cannot bypass server-enforced audience isolation', async ({
    page,
  }) => {
    await loginAsStudentPassenger(page);

    // Tamper with URL parameter requesting FACULTY audience
    await page.goto('/rides?audience=FACULTY');

    // The backend ignores client-side audience query for authenticated users, enforcing token audience
    const facultyBadges = page.locator('text="FACULTY Cohort"');
    await expect(facultyBadges).toHaveCount(0);
  });
});
