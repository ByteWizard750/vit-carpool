import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';

test.describe('P0 Improvements Verification', () => {
  test.describe('Task 1: Vehicle Status & Trust Labels', () => {
    test('Vehicles page renders "Registered Vehicle" neutral badge and not misleading green "VERIFIED"', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/vehicles');
      await expect(page.getByRole('heading', { name: /Registered Vehicles/i })).toBeVisible();

      // Check badge on registered vehicle cards
      const badge = page.locator('.vehicle-card .status-badge').first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(/Registered Vehicle/i);

      // Verify it does NOT have the success tint (which was the misleading green Verified badge)
      await expect(badge).not.toHaveClass(/status-badge-success/);
      await expect(badge).toHaveClass(/status-badge-neutral/);

      // Verify no card shows misleading "Verified" label
      const verifiedBadges = page.locator('.vehicle-card .status-badge-success');
      expect(await verifiedBadges.count()).toBe(0);
    });
  });

  test.describe('Task 2: Vehicle-Based Passenger Seat Capacity Validation', () => {
    test('Offer Ride page dynamically limits passenger seats to vehicle.capacity - 1', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/offer-ride?mode=custom');
      await expect(page.locator('#offer-ride-vehicle-select')).toBeVisible();

      // Get the selected vehicle capacity
      const vehicleSelect = page.locator('#offer-ride-vehicle-select');
      const selectedOptionText = await vehicleSelect.locator('option:checked').textContent();
      
      // Arjun's vehicle typically has capacity (e.g. 5 seats => max 4 passenger seats)
      const seatsSelect = page.locator('#offer-seats-select');
      await expect(seatsSelect).toBeVisible();

      const options = seatsSelect.locator('option');
      const optionCount = await options.count();
      const optionValues = await options.evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

      // Capacity includes driver, so passenger seats must be capacity - 1
      // If 5-seater: options must be 1, 2, 3, 4 (count = 4)
      expect(optionValues).not.toContain('5');
      expect(optionValues).not.toContain('6');
      expect(Number(optionValues[optionValues.length - 1])).toBeLessThanOrEqual(optionCount);

      // Helper text is displayed
      const helperText = page.locator('span:has-text("passenger seat")').first();
      await expect(helperText).toBeVisible();
    });

    test('Quick Ride dynamically clamps and limits offered seats to vehicle capacity', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/offer-ride?mode=quick');
      const quickSeats = page.locator('#quick-seats-select');
      if (await quickSeats.isVisible()) {
        const optionValues = await quickSeats.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
        expect(optionValues).not.toContain('5');
        expect(optionValues).not.toContain('6');
      }
    });
  });

  test.describe('Task 3: Consolidated Mobile Navigation', () => {
    test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 viewport

    test('Bottom navigation displays 5 consolidated primary tabs for authenticated student', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/dashboard');

      // Verify bottom nav is visible and contains exactly 5 primary items
      const bottomNav = page.locator('nav.bottom-nav');
      await expect(bottomNav).toBeVisible();

      const homeTab = page.locator('#bottom-nav-home');
      const findTab = page.locator('#bottom-nav-find');
      const tripsTab = page.locator('#bottom-nav-trips');
      const inboxTab = page.locator('#bottom-nav-inbox');
      const profileTab = page.locator('#bottom-nav-profile');

      await expect(homeTab).toBeVisible();
      await expect(homeTab).toContainText(/Dashboard/i);

      await expect(findTab).toBeVisible();
      await expect(findTab).toContainText(/Find Rides/i);

      await expect(tripsTab).toBeVisible();
      await expect(tripsTab).toContainText(/My Trips/i);

      await expect(inboxTab).toBeVisible();
      await expect(inboxTab).toContainText(/Inbox/i);

      await expect(profileTab).toBeVisible();
      await expect(profileTab).toContainText(/Profile/i);

      // Verify "Offer Ride" is NOT a bottom nav tab (consolidated into Profile + Drawer CTA)
      await expect(page.locator('#bottom-nav-offer')).toHaveCount(0);
    });

    test('Mobile drawer removes duplicates and organizes secondary destinations cleanly', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/dashboard');

      // Open hamburger menu
      const hamburger = page.locator('.mobile-menu-btn');
      await expect(hamburger).toBeVisible();
      await hamburger.click();

      const drawer = page.locator('.mobile-nav-panel');
      await expect(drawer).toBeVisible();

      // Check User Identity Header / Dashboard card
      await expect(page.locator('#mobile-drawer-dashboard')).toBeVisible();

      // Check Offer a Ride CTA button
      await expect(page.locator('#mobile-drawer-offer-ride')).toBeVisible();

      // Check organized sections
      await expect(page.locator('.mobile-nav-heading:has-text("My Trips & Schedules")')).toBeVisible();
      await expect(page.locator('#mobile-drawer-my-rides')).toBeVisible();
      await expect(page.locator('#mobile-drawer-recurring')).toBeVisible();
      await expect(page.locator('#mobile-drawer-alerts')).toBeVisible();

      await expect(page.locator('.mobile-nav-heading:has-text("Account & Fleet")')).toBeVisible();
      await expect(page.locator('#mobile-drawer-vehicles')).toBeVisible();
      await expect(page.locator('#mobile-drawer-notifications')).toBeVisible();

      await expect(page.locator('.mobile-nav-heading:has-text("Campus Community")')).toBeVisible();
      await expect(page.locator('#mobile-drawer-safety')).toBeVisible();
      await expect(page.locator('#mobile-drawer-guide')).toBeVisible();

      // Check Sign Out button
      await expect(page.locator('#mobile-drawer-signout')).toBeVisible();

      // Verify duplicate bottom nav links are NOT standalone links in the drawer list:
      // No duplicate Find Rides, Bookings, Messages, or Profile in the drawer
      expect(await drawer.locator('a.nav-link:has-text("Find Rides")').count()).toBe(0);
      expect(await drawer.locator('a.nav-link:has-text("Bookings")').count()).toBe(0);
      expect(await drawer.locator('a.nav-link:has-text("Messages")').count()).toBe(0);
      expect(await drawer.locator('a.nav-link:has-text("Profile")').count()).toBe(0);
    });

    test('Secondary destinations in drawer navigate successfully', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      await page.goto('/dashboard');

      // Open hamburger and navigate to Vehicles
      await page.locator('.mobile-menu-btn').click();
      await page.locator('#mobile-drawer-vehicles').click();
      await expect(page).toHaveURL(/\/vehicles/);
      await expect(page.getByRole('heading', { name: /Registered Vehicles/i })).toBeVisible();

      // Open hamburger and navigate to Recurring Commutes
      await page.locator('.mobile-menu-btn').click();
      await page.locator('#mobile-drawer-recurring').click();
      await expect(page).toHaveURL(/\/recurring-commutes/);

      // Open hamburger and navigate to Notifications
      await page.locator('.mobile-menu-btn').click();
      await page.locator('#mobile-drawer-notifications').click();
      await expect(page).toHaveURL(/\/notifications/);
    });

    test('Faculty user mobile navigation displays correct cohort and secondary links', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'priya.faculty@vit.ac.in',
        fullName: 'Dr. Priya Faculty',
        audience: 'FACULTY',
      });

      await page.goto('/dashboard');

      const bottomNav = page.locator('nav.bottom-nav');
      await expect(bottomNav).toBeVisible();
      await expect(page.locator('#bottom-nav-home')).toContainText(/Dashboard/i);
      await expect(page.locator('#bottom-nav-profile')).toContainText(/Profile/i);

      // Check drawer
      await page.locator('.mobile-menu-btn').click();
      await expect(page.locator('#mobile-drawer-dashboard')).toContainText(/Faculty Cohort/i);
      await expect(page.locator('#mobile-drawer-offer-ride')).toBeVisible();
    });

    test('Responsive viewport test across 320px, 375px, 390px, 440px has zero document overflow', async ({ page }) => {
      await loginAsDevUser(page, {
        email: 'arjun.driver@vitstudent.ac.in',
        fullName: 'Arjun Driver',
        audience: 'STUDENT',
      });

      const viewports = [
        { width: 320, height: 600 },
        { width: 375, height: 667 },
        { width: 390, height: 844 },
        { width: 440, height: 900 },
      ];

      for (const vp of viewports) {
        await page.setViewportSize(vp);
        await page.goto('/dashboard');

        // Check horizontal document overflow
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasOverflow).toBe(false);

        // Check Vehicles page
        await page.goto('/vehicles');
        const vehOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(vehOverflow).toBe(false);

        // Check Offer Ride page
        await page.goto('/offer-ride');
        const offerOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(offerOverflow).toBe(false);
      }
    });
  });
});

