import { test, expect } from '@playwright/test';

test.describe('Scroll Reset on Navigation', () => {
  test('Navigating via footer links resets scroll position to top (y: 0)', async ({ page }) => {
    // 1. Go to Home page
    await page.goto('/');
    await page.waitForTimeout(500);

    // Scroll down all the way to footer
    await page.evaluate(() => window.scrollTo(0, 3000));
    await page.waitForTimeout(300);
    const scrollYOnHome = await page.evaluate(() => window.scrollY);
    expect(scrollYOnHome).toBeGreaterThan(500);

    // 2. Click "Find Rides" link in footer
    const footerFindRidesLink = page.locator('footer a[href="/rides"]').first();
    await expect(footerFindRidesLink).toBeVisible();
    await footerFindRidesLink.click();

    // Verify URL is /rides
    await expect(page).toHaveURL(/\/rides/);
    await page.waitForTimeout(400);

    // Verify page scroll position is reset to top (0)
    const scrollYOnRides = await page.evaluate(() => window.scrollY);
    console.log(`[Scroll Test] After clicking footer 'Find Rides': scrollY = ${scrollYOnRides}`);
    expect(scrollYOnRides).toBe(0);

    // 3. Scroll down on /rides
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(300);
    const scrollYOnRidesScrolled = await page.evaluate(() => window.scrollY);
    expect(scrollYOnRidesScrolled).toBeGreaterThan(100);

    // 4. Click "How It Works" in footer
    const footerHowItWorksLink = page.locator('footer a[href="/how-it-works"]').first();
    await expect(footerHowItWorksLink).toBeVisible();
    await footerHowItWorksLink.click();

    await expect(page).toHaveURL(/\/how-it-works/);
    await page.waitForTimeout(400);

    const scrollYOnHowItWorks = await page.evaluate(() => window.scrollY);
    console.log(`[Scroll Test] After clicking footer 'How It Works': scrollY = ${scrollYOnHowItWorks}`);
    expect(scrollYOnHowItWorks).toBe(0);

    // 5. Scroll down on /how-it-works
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(300);

    // 6. Click "Community Safety" in footer
    const footerSafetyLink = page.locator('footer a[href="/safety"]').first();
    await expect(footerSafetyLink).toBeVisible();
    await footerSafetyLink.click();

    await expect(page).toHaveURL(/\/safety/);
    await page.waitForTimeout(400);

    const scrollYOnSafety = await page.evaluate(() => window.scrollY);
    console.log(`[Scroll Test] After clicking footer 'Community Safety': scrollY = ${scrollYOnSafety}`);
    expect(scrollYOnSafety).toBe(0);
  });

  test('Mobile viewport navigation resets scroll position to top (y: 0)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });

    // 1. Go to Home page and scroll down
    await page.goto('/');
    await page.waitForTimeout(500);

    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(300);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(500);

    // 2. Click "Find Rides" in mobile bottom nav
    const bottomNavFind = page.locator('#bottom-nav-find');
    await expect(bottomNavFind).toBeVisible();
    await bottomNavFind.click();

    await expect(page).toHaveURL(/\/rides/);
    await page.waitForTimeout(400);

    const scrollAfter = await page.evaluate(() => window.scrollY);
    console.log(`[Mobile Scroll Test] After clicking bottom nav 'Find Rides': scrollY = ${scrollAfter}`);
    expect(scrollAfter).toBe(0);

    // 3. Scroll down on /rides
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(300);

    // 4. Click "Guide" in mobile bottom nav
    const bottomNavGuide = page.locator('#bottom-nav-trips');
    await expect(bottomNavGuide).toBeVisible();
    await bottomNavGuide.click();

    await expect(page).toHaveURL(/\/how-it-works/);
    await page.waitForTimeout(400);

    const scrollAfterGuide = await page.evaluate(() => window.scrollY);
    console.log(`[Mobile Scroll Test] After clicking bottom nav 'Guide': scrollY = ${scrollAfterGuide}`);
    expect(scrollAfterGuide).toBe(0);
  });
});
