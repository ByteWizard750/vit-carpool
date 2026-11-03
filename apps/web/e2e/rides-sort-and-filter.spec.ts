import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';

test.describe('Find Rides Sort & Filter Capabilities', () => {
  const driverEmail = 'rides.driver.filter@vitstudent.ac.in';
  const passengerEmail = 'rides.passenger.filter@vitstudent.ac.in';

  test.beforeAll(async ({ request }) => {
    // Dev login for driver
    const driverRes = await request.post('http://localhost:3000/auth/dev-login', {
      data: {
        email: driverEmail,
        fullName: 'Filter Driver',
        audience: 'STUDENT',
        status: 'VERIFIED',
      },
    });
    expect(driverRes.ok()).toBeTruthy();
    const driver = await driverRes.json();

    // Dev login for passenger
    const passRes = await request.post('http://localhost:3000/auth/dev-login', {
      data: {
        email: passengerEmail,
        fullName: 'Filter Passenger',
        audience: 'STUDENT',
        status: 'VERIFIED',
      },
    });
    expect(passRes.ok()).toBeTruthy();

    // Register vehicle
    const plateSuffix = Math.floor(Math.random() * 8999 + 1000);
    const vehRes = await request.post('http://localhost:3000/vehicles', {
      headers: { Authorization: `Bearer ${driver.token}` },
      data: {
        make: 'Tata',
        model: 'Nexon EV',
        registrationNumber: `TN09EV${plateSuffix}`,
        capacity: 5,
        color: 'Teal',
      },
    });
    expect(vehRes.ok()).toBeTruthy();
    const vehicle = await vehRes.json();

    // Create 3 distinct rides for sorting/filtering tests
    // Ride 1: Earlier departure, cost 40, 2 seats
    const t1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await request.post('http://localhost:3000/rides', {
      headers: { Authorization: `Bearer ${driver.token}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Tambaram Railway Station',
        destination: 'VIT Chennai Campus',
        departureTime: t1,
        availableSeats: 2,
        costPerSeat: 40,
      },
    });

    // Ride 2: Later departure, cost 90, 4 seats
    const t2 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await request.post('http://localhost:3000/rides', {
      headers: { Authorization: `Bearer ${driver.token}` },
      data: {
        vehicleId: vehicle.id,
        origin: 'Vandalur Zoo',
        destination: 'VIT Chennai Campus',
        departureTime: t2,
        availableSeats: 4,
        costPerSeat: 90,
      },
    });
  });

  test('Quick sort dropdown updates results and URL parameters', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevUser(page, {
      email: passengerEmail,
      fullName: 'Filter Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await page.goto('/rides');
    await page.waitForLoadState('networkidle');

    // 1. Verify sort dropdown exists
    const sortSelect = page.locator('#rides-quick-sort-select');
    await expect(sortSelect).toBeVisible();

    // Default should be departureTime:asc
    await expect(sortSelect).toHaveValue('departureTime:asc');

    // 2. Select lowest cost first
    await sortSelect.selectOption('cost:asc');
    await page.waitForLoadState('networkidle');

    // URL should have sortBy=cost
    expect(page.url()).toContain('sortBy=cost');

    // 3. Select most seats available
    await sortSelect.selectOption('seats:desc');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('sortBy=seats');
    expect(page.url()).toContain('sortOrder=desc');
  });

  test('Interactive quick filter chips apply instant filters', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevUser(page, {
      email: passengerEmail,
      fullName: 'Filter Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await page.goto('/rides');
    await page.waitForLoadState('networkidle');

    // Verify quick chips row is visible
    const chipsRow = page.locator('#rides-quick-chips-row');
    await expect(chipsRow).toBeVisible();

    // 1. Click "Lowest Cost" quick chip
    const lowestCostChip = page.locator('#chip-sort-lowest-cost');
    await expect(lowestCostChip).toBeVisible();
    await lowestCostChip.click();

    await expect(lowestCostChip).toHaveClass(/active/);
    expect(page.url()).toContain('sortBy=cost');

    // 2. Click "≤ ₹50" quick chip
    const cost50Chip = page.locator('#chip-filter-cost-50');
    await expect(cost50Chip).toBeVisible();
    await cost50Chip.click();

    await expect(cost50Chip).toHaveClass(/active/);
    expect(page.url()).toContain('maxCost=50');

    // Filter badge count should display active filters
    const filterBadge = page.locator('#badge-active-filters-count');
    await expect(filterBadge).toBeVisible();

    // Reset All chip should now be visible
    const clearChip = page.locator('#chip-filter-clear-all');
    await expect(clearChip).toBeVisible();
    await clearChip.click();

    // After reset, maxCost should be cleared and sort reset to default
    expect(page.url()).not.toContain('maxCost=50');
    await expect(cost50Chip).not.toHaveClass(/active/);
  });

  test('Filter & Refine Modal allows deep configuration and presets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsDevUser(page, {
      email: passengerEmail,
      fullName: 'Filter Passenger',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });

    await page.goto('/rides');
    await page.waitForLoadState('networkidle');

    // 1. Open the Filter Modal
    const openModalBtn = page.locator('#btn-open-filter-modal');
    await expect(openModalBtn).toBeVisible();
    await openModalBtn.click();

    // Modal dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Filter & Refine Campus Rides')).toBeVisible();

    // 2. Select Max Cost Preset: ≤ ₹75
    const preset75 = page.locator('#modal-preset-cost-75');
    await expect(preset75).toBeVisible();
    await preset75.click();

    // 3. Select 2 Seats needed
    const seats2 = page.locator('#modal-seats-2');
    await expect(seats2).toBeVisible();
    await seats2.click();

    // 4. Select Corridor Radius: 5 km
    const radius5 = page.locator('#modal-radius-5');
    await expect(radius5).toBeVisible();
    await radius5.click();

    // 5. Apply filters
    const applyBtn = page.locator('#btn-modal-apply-filters');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // URL should reflect the newly chosen parameters
    expect(page.url()).toContain('maxCost=75');
    expect(page.url()).toContain('seats=2');
    expect(page.url()).toContain('radiusKm=5');

    // Take screenshot for visual audit
    await page.screenshot({
      path: '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/rides_sort_and_filter_mobile.png',
      fullPage: false,
    });
  });
});
