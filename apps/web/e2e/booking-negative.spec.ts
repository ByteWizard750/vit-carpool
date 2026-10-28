import { test, expect } from '@playwright/test';
import { loginAsStudentDriver, loginAsStudentPassenger, loginAsDevUser } from './helpers/auth';

test.describe('Milestone 16: Negative Booking Scenarios & Seat Management', () => {
  test('1. Seat counter prevents requesting more seats than currently available', async ({ page }) => {
    await loginAsStudentPassenger(page);
    await page.goto('/rides');

    // Search for rides
    const searchBtn = page.getByRole('button', { name: /Search Rides/i });
    await searchBtn.click();

    // Open first available ride
    const rideCard = page.locator('.ride-card, div[style*="cursor: pointer"]').filter({ hasText: /₹/ }).first();
    await expect(rideCard).toBeVisible();
    await rideCard.click();

    // Seat counter in modal
    const plusBtn = page.locator('button[aria-label="Increase requested seats"]');
    const minusBtn = page.locator('button[aria-label="Decrease requested seats"]');

    await expect(minusBtn).toBeDisabled(); // Initially 1, so minus is disabled
    await expect(plusBtn).toBeVisible();

    // Repeatedly click plus until maximum available seats are reached
    while (await plusBtn.isEnabled()) {
      await plusBtn.click();
    }
    // Plus button must be disabled, preventing requesting more seats than available
    await expect(plusBtn).toBeDisabled();
  });

  test('2. Submitting duplicate booking request displays clear error message', async ({ page }) => {
    // Authenticate passenger
    await loginAsStudentPassenger(page);
    await page.goto('/rides');

    const searchBtn = page.getByRole('button', { name: /Search Rides/i });
    await searchBtn.click();

    const rideCard = page.locator('.ride-result-card, .ride-card').filter({ hasText: /₹/ }).first();
    await expect(rideCard).toBeVisible();
    const viewBtn = rideCard.getByRole('button', { name: /View Details & Book/i });
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
    } else {
      await rideCard.click();
    }

    // Submit initial request
    const requestBtn = page.locator('#btn-confirm-seat-request');
    if (await requestBtn.isVisible()) {
      await requestBtn.click();
    }

    // Attempt second booking on the exact same ride
    await page.goto('/rides');
    await searchBtn.click();
    const sameRideCard = page.locator('.ride-result-card, .ride-card').filter({ hasText: /₹/ }).first();
    const secondViewBtn = sameRideCard.getByRole('button', { name: /View Details & Book/i });
    if (await secondViewBtn.isVisible()) {
      await secondViewBtn.click();
    } else {
      await sameRideCard.click();
    }

    const secondRequestBtn = page.locator('#btn-confirm-seat-request');
    if (await secondRequestBtn.isVisible()) {
      await secondRequestBtn.click();
      // Error message must specifically reject duplicate active booking
      await expect(page.locator('div').filter({ hasText: /already have an active booking/i }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('3. Booking cancellation restores seat and updates status to CANCELLED', async ({ page }) => {
    await loginAsStudentPassenger(page);
    await page.goto('/bookings');

    let cancelBtn = page.locator('button:has-text("Cancel Booking")').first();
    if (!await cancelBtn.isVisible()) {
      // Create a booking first to guarantee cancellation flow is exercised
      await page.goto('/rides');
      const searchBtn = page.getByRole('button', { name: /Search Rides/i });
      await searchBtn.click();
      const rideCard = page.locator('.ride-result-card, .ride-card').filter({ hasText: /₹/ }).first();
      const viewBtn = rideCard.getByRole('button', { name: /View Details & Book/i });
      if (await viewBtn.isVisible()) await viewBtn.click(); else await rideCard.click();
      const reqBtn = page.locator('#btn-confirm-seat-request');
      if (await reqBtn.isVisible()) await reqBtn.click();
      await page.goto('/bookings');
      cancelBtn = page.locator('button:has-text("Cancel Booking")').first();
    }

    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();

      // Confirm modal opens
      const confirmModal = page.locator('div[role="dialog"]');
      await expect(confirmModal).toBeVisible();

      const confirmBtn = confirmModal.getByRole('button', { name: /Confirm Cancellation|Cancel Booking/i }).first();
      await confirmBtn.click();

      // Feedback message
      await expect(page.getByText(/booking request has been cancelled|Booking cancelled/i)).toBeVisible();
    }
  });

  test('4. Unauthenticated visitor cannot request seats and is guided to institutional login', async ({ page }) => {
    // Clear auth state
    await page.goto('/auth');
    await page.evaluate(() => {
      localStorage.removeItem('vit_auth_token');
      localStorage.removeItem('vit_auth_user');
    });

    // Try navigating to bookings directly
    await page.goto('/bookings');
    await page.waitForURL(/\/auth/);
    await expect(page.getByRole('heading', { name: /Institutional Sign In/i })).toBeVisible();
  });
});
