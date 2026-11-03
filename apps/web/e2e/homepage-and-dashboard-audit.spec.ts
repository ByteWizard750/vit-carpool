import { test, expect } from '@playwright/test';
import { loginAsDevUser } from './helpers/auth';
import * as path from 'path';
import * as fs from 'fs';

test.describe('Homepage Baseline Preservation & Dashboard Audit', () => {
  const screenshotDir = path.resolve(
    '/Users/rohan/.gemini/antigravity/brain/9141eb33-59c5-45d8-9543-45d77099395b/product_refinement_screenshots'
  );

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Capture 6 verification screenshots: Home and Dashboard across Desktop and Mobile', async ({
    page,
    browser,
  }) => {
    // ───────────────────────────────────────────────────────────────────────────
    // 1. Logged-out Home – desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedOutDesktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const loggedOutDesktopPage = await loggedOutDesktopContext.newPage();
    await loggedOutDesktopPage.goto('http://127.0.0.1:5173/');
    await loggedOutDesktopPage.waitForSelector('#hero');
    await loggedOutDesktopPage.waitForTimeout(1000);
    await loggedOutDesktopPage.screenshot({
      path: path.join(screenshotDir, '01_logged_out_home_desktop.png'),
      fullPage: false,
    });
    await loggedOutDesktopContext.close();

    // ───────────────────────────────────────────────────────────────────────────
    // 2. Logged-out Home – mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedOutMobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const loggedOutMobilePage = await loggedOutMobileContext.newPage();
    await loggedOutMobilePage.goto('http://127.0.0.1:5173/');
    await loggedOutMobilePage.waitForSelector('#hero');
    await loggedOutMobilePage.waitForTimeout(1000);
    await loggedOutMobilePage.screenshot({
      path: path.join(screenshotDir, '02_logged_out_home_mobile.png'),
      fullPage: false,
    });
    await loggedOutMobileContext.close();

    // ───────────────────────────────────────────────────────────────────────────
    // 3. Logged-in Home – desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedInDesktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const loggedInDesktopPage = await loggedInDesktopContext.newPage();
    await loginAsDevUser(loggedInDesktopPage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await loggedInDesktopPage.goto('http://127.0.0.1:5173/');
    await loggedInDesktopPage.waitForSelector('#hero');
    await loggedInDesktopPage.waitForTimeout(1000);
    await loggedInDesktopPage.screenshot({
      path: path.join(screenshotDir, '03_logged_in_home_desktop.png'),
      fullPage: false,
    });

    // ───────────────────────────────────────────────────────────────────────────
    // 4. Logged-in Home – mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    const loggedInMobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const loggedInMobilePage = await loggedInMobileContext.newPage();
    await loginAsDevUser(loggedInMobilePage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await loggedInMobilePage.goto('http://127.0.0.1:5173/');
    await loggedInMobilePage.waitForSelector('#hero');
    await loggedInMobilePage.waitForTimeout(1000);
    await loggedInMobilePage.screenshot({
      path: path.join(screenshotDir, '04_logged_in_home_mobile.png'),
      fullPage: false,
    });
    await loggedInMobileContext.close();

    // ───────────────────────────────────────────────────────────────────────────
    // 5. Dashboard – desktop (1440 x 900)
    // ───────────────────────────────────────────────────────────────────────────
    await loggedInDesktopPage.goto('http://127.0.0.1:5173/dashboard');
    await loggedInDesktopPage.waitForSelector('.dashboard-grid, .container', { timeout: 10000 });
    await loggedInDesktopPage.waitForTimeout(1500);
    await loggedInDesktopPage.screenshot({
      path: path.join(screenshotDir, '05_dashboard_desktop.png'),
      fullPage: false,
    });
    await loggedInDesktopContext.close();

    // ───────────────────────────────────────────────────────────────────────────
    // 6. Dashboard – mobile (390 x 844)
    // ───────────────────────────────────────────────────────────────────────────
    const dashMobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const dashMobilePage = await dashMobileContext.newPage();
    await loginAsDevUser(dashMobilePage, {
      email: 'arjun.verma2023@vitstudent.ac.in',
      fullName: 'Arjun Verma',
      audience: 'STUDENT',
      status: 'VERIFIED',
    });
    await dashMobilePage.goto('http://127.0.0.1:5173/dashboard');
    await dashMobilePage.waitForSelector('.dashboard-grid, .container', { timeout: 10000 });
    await dashMobilePage.waitForTimeout(1500);
    await dashMobilePage.screenshot({
      path: path.join(screenshotDir, '06_dashboard_mobile.png'),
      fullPage: false,
    });
    await dashMobileContext.close();
  });
});

