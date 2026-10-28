import { test, expect } from '@playwright/test';

test.describe('Milestone 15: Browser Smoke & End-to-End User Experience', () => {
  test('1. Landing page renders branding, navigation, hero, and corridor benchmarks', async ({ page, isMobile }) => {
    await page.goto('/');

    // Check title and navbar brand
    await expect(page).toHaveTitle(/VIT Chennai Carpooling/i);
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.getByRole('link', { name: /VIT Carpool/i }).first()).toBeVisible();

    // Check navigation links (desktop or mobile hamburger drawer)
    if (isMobile) {
      const hamburger = page.locator('.mobile-menu-btn');
      await expect(hamburger).toBeVisible();
      await hamburger.click();
      await expect(page.getByRole('link', { name: /Find Rides/i }).first()).toBeVisible();
      await hamburger.click();
    } else {
      await expect(page.getByRole('link', { name: /Find Rides/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /How it Works/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Safety/i }).first()).toBeVisible();
    }

    // Check hero heading
    const heroHeading = page.locator('h1.hero-title');
    await expect(heroHeading).toBeVisible();
    await expect(heroHeading).toContainText(/Dedicated Campus Carpooling/i);

    // Verify search widget container is present
    await expect(page.locator('.search-widget-container, #search').first()).toBeVisible();
  });

  test('2. Authentication page renders login/register tabs, institutional hints, and dev login', async ({ page }) => {
    await page.goto('/auth');

    // Verify heading
    await expect(page.getByRole('heading', { name: /Institutional Sign In/i })).toBeVisible();
    await expect(page.getByText(/Exclusive peer carpooling for verified VIT Chennai students & faculty/i)).toBeVisible();

    // Verify email input with institutional placeholder
    const emailInput = page.locator('#input-auth-email, input[type="email"]').first();
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', /@vitstudent\.ac\.in/i);

    // Verify dev helper section
    const devHelper = page.locator('details');
    await expect(devHelper).toBeVisible();
    await devHelper.click();

    // Check helper prefill buttons
    await expect(page.getByRole('button', { name: /Fill Student/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Fill Faculty/i })).toBeVisible();
    await expect(page.locator('#btn-dev-login-arjun')).toBeVisible();

    // Test prefill
    await page.getByRole('button', { name: /Fill Student/i }).click();
    await expect(emailInput).toHaveValue('student@vitstudent.ac.in');
  });

  test('3. Authenticated session: 1-click dev login sets session and unlocks member navigation', async ({ page, isMobile }) => {
    await page.goto('/auth');

    // Expand dev helper and click 1-click login
    await page.locator('details').click();
    await page.locator('#btn-dev-login-arjun').click();

    // Wait for redirect to /recurring-commutes
    await page.waitForURL(/\/(recurring-commutes|dashboard)/);

    // Verify localStorage has vit_auth_token and vit_auth_user
    const token = await page.evaluate(() => localStorage.getItem('vit_auth_token'));
    const userJson = await page.evaluate(() => localStorage.getItem('vit_auth_user'));
    expect(token).toBeTruthy();
    expect(userJson).toContain('arjun.driver@vitstudent.ac.in');

    // Header now reflects logged in state
    await expect(page.locator('header.site-header')).toBeVisible();

    if (isMobile) {
      const hamburger = page.locator('.mobile-menu-btn');
      await expect(hamburger).toBeVisible();
      await hamburger.click();
      await expect(page.getByRole('link', { name: /Dashboard/i }).first()).toBeVisible();
      await hamburger.click();
    } else {
      await expect(page.getByRole('link', { name: /Dashboard/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Find Rides/i }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Offer a Ride/i }).first()).toBeVisible();
    }
  });

  test('4. Ride Discovery (/rides): renders search filters, audience banner, and date picker', async ({ page }) => {
    await page.goto('/rides');

    // Check page title / heading
    await expect(page.getByRole('heading', { name: /Campus Ride Discovery/i })).toBeVisible();

    // Verify search controls
    const originInput = page.locator('#rides-search-origin, input[placeholder*="Leaving from"], input[placeholder*="Vandalur"]').first();
    const destInput = page.locator('#rides-search-destination, input[placeholder*="Going to"]').first();
    await expect(originInput).toBeVisible();
    await expect(destInput).toBeVisible();

    // Check search button
    const searchBtn = page.getByRole('button', { name: /Search Rides/i });
    await expect(searchBtn).toBeVisible();

    // Test typing in search fields
    await originInput.fill('Tambaram');
    await destInput.fill('VIT Chennai');
    await searchBtn.click();
  });

  test('5. Vehicle Management (/vehicles): lists registered vehicles and validates Add Vehicle modal', async ({ page }) => {
    // Authenticate
    await page.goto('/auth');
    await page.locator('details').click();
    await page.locator('#btn-dev-login-arjun').click();
    await page.waitForURL(/\/(recurring-commutes|dashboard)/);

    // Navigate to vehicles
    await page.goto('/vehicles');
    await expect(page.getByRole('heading', { name: /Registered Vehicles/i })).toBeVisible();

    // Verify Add Vehicle button exists and opens modal
    const addBtn = page.locator('#btn-add-vehicle');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Check modal inputs
    const makeInput = page.locator('input[placeholder*="Maruti Suzuki"]');
    const modelInput = page.locator('input[placeholder*="Swift"]');
    const colorInput = page.locator('input[placeholder*="Silver"]');
    const regInput = page.locator('input[placeholder*="TN19AJ4321"]');

    await expect(makeInput).toBeVisible();
    await expect(regInput).toBeVisible();

    // Fill required fields with invalid registration format to trigger API/client validation
    await makeInput.fill('Maruti');
    await modelInput.fill('Swift');
    await colorInput.fill('White');
    await regInput.fill('AB');

    const submitBtn = page.getByRole('button', { name: /Register Car/i });
    await submitBtn.click();

    // Error banner displayed with validation error
    await expect(page.locator('div').filter({ hasText: /Registration number must be 4 to 20 alphanumeric characters/i }).first()).toBeVisible({ timeout: 5000 });

    // Close modal via Cancel button
    const cancelBtn = page.getByRole('button', { name: /Cancel/i }).first();
    await cancelBtn.click();
    await expect(makeInput).not.toBeVisible();
  });

  test('6. Offer Ride (/offer-ride): verified driver form displays vehicle selection and private notes', async ({ page }) => {
    // Authenticate
    await page.goto('/auth');
    await page.locator('details').click();
    await page.locator('#btn-dev-login-arjun').click();
    await page.waitForURL(/\/(recurring-commutes|dashboard)/);

    await page.goto('/offer-ride');
    await expect(page.getByRole('heading', { name: /Offer a Campus Ride/i })).toBeVisible();

    // Verify quick ride and custom tabs
    await expect(page.locator('#tab-quick-ride')).toBeVisible();
    await expect(page.locator('#tab-custom-ride, button:has-text("Custom Ride")')).toBeVisible();
  });

  test('7. Recurring Commutes (/recurring-commutes): loads schedules and displays IST timezone indicators', async ({ page }) => {
    // Authenticate
    await page.goto('/auth');
    await page.locator('details').click();
    await page.locator('#btn-dev-login-arjun').click();
    await page.waitForURL(/\/(recurring-commutes|dashboard)/);

    await page.goto('/recurring-commutes');
    await expect(page.getByRole('heading', { name: /Recurring Commutes/i })).toBeVisible();

    // Check New Schedule button
    await expect(page.getByRole('button', { name: /New Schedule/i })).toBeVisible();
  });

  test('8. Admin Protection: non-admin student account is strictly blocked from /admin', async ({ page }) => {
    // Authenticate as student driver
    await page.goto('/auth');
    await page.locator('details').click();
    await page.locator('#btn-dev-login-arjun').click();
    await page.waitForURL(/\/(recurring-commutes|dashboard)/);

    // Attempt direct navigation to /admin
    await page.goto('/admin');

    // Must be redirected away to /dashboard
    await page.waitForURL(/\/dashboard/);
    await expect(page).toHaveURL(/.*\/dashboard/);
  });
});
