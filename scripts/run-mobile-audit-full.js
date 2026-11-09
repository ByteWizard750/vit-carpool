const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'apps/web/node_modules/@playwright/test'));
const fs = require('fs');

const VIEWPORTS = [
  { name: 'small-mobile', width: 320, height: 700 },
  { name: 'standard-mobile', width: 360, height: 800 },
  { name: 'modern-mobile', width: 390, height: 844 },
  { name: 'large-mobile', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';

async function getAuthToken(email) {
  const res = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Dev login failed for ${email}: ${res.status}`);
  return await res.json();
}

const PAGES = [
  // Public Pages (Unauthenticated)
  { id: '01_landing', path: '/', auth: 'none' },
  { id: '02_auth', path: '/auth', auth: 'none' },
  { id: '03_how_it_works', path: '/how-it-works', auth: 'none' },
  { id: '04_safety', path: '/safety', auth: 'none' },
  { id: '05_rides_public', path: '/rides', auth: 'none' },
  { id: '06_admin_login', path: '/admin/login', auth: 'none' },

  // Authenticated Student Pages
  { id: '07_dashboard', path: '/dashboard', auth: 'student' },
  { id: '08_profile', path: '/profile', auth: 'student' },
  { id: '09_notifications', path: '/notifications', auth: 'student' },
  { id: '10_offer_ride_vehicle', path: '/offer-ride', auth: 'student' },
  { id: '11_offer_ride_cab', path: '/offer-ride', auth: 'student', action: 'cab-tab' },
  { id: '12_my_rides', path: '/my-rides', auth: 'student' },
  { id: '13_bookings', path: '/bookings', auth: 'student' },
  { id: '14_vehicles', path: '/vehicles', auth: 'student' },
  { id: '15_recurring_commutes', path: '/recurring-commutes', auth: 'student' },
  { id: '16_messages', path: '/messages', auth: 'student' },
  { id: '17_ride_alerts', path: '/ride-alerts', auth: 'student' },
  { id: '18_ride_tracking', path: '/rides/b5b6d48a-58f9-4b70-a047-9bdf6945e870/track', auth: 'student' },

  // Admin Dashboard Tabs
  { id: '19_admin_overview', path: '/admin', auth: 'admin', tab: 'overview' },
  { id: '20_admin_users', path: '/admin', auth: 'admin', tab: 'users' },
  { id: '21_admin_rides', path: '/admin', auth: 'admin', tab: 'rides' },
  { id: '22_admin_bookings', path: '/admin', auth: 'admin', tab: 'bookings' },
  { id: '23_admin_moderation', path: '/admin', auth: 'admin', tab: 'safety' },
  { id: '24_admin_audit', path: '/admin', auth: 'admin', tab: 'audit' },
  { id: '25_admin_health', path: '/admin', auth: 'admin', tab: 'health' },
  { id: '26_admin_settings', path: '/admin', auth: 'admin', tab: 'settings' },
];

async function runAudit(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Authenticating test accounts...');
  const studentAuth = await getAuthToken('qa.student@vitstudent.ac.in');
  
  // Build admin user object
  const adminAuth = await getAuthToken('admin.safety@vitstudent.ac.in');
  const adminUser = {
    ...adminAuth.user,
    role: 'SUPER_ADMIN',
  };

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`INSPECTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();

    for (const pageDef of PAGES) {
      const pageResult = {
        id: pageDef.id,
        path: pageDef.path,
        viewport: `${vp.width}x${vp.height}`,
        viewportName: vp.name,
        overflow: false,
        overflowPixels: 0,
        bottomNavVisible: false,
        bottomNavExpected: vp.width < 768,
        bottomNavError: false,
        errors: [],
        screenshot: '',
      };

      try {
        // Set up authentication state in localStorage before navigation
        if (pageDef.auth === 'student') {
          await page.addInitScript(({ t, u }) => {
            window.localStorage.setItem('vit_auth_token', t);
            window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
          }, { t: studentAuth.token, u: studentAuth.user });
        } else if (pageDef.auth === 'admin') {
          await page.addInitScript(({ t, u }) => {
            window.localStorage.setItem('vit_auth_token', t);
            window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
          }, { t: adminAuth.token, u: adminUser });
        } else {
          await page.addInitScript(() => {
            window.localStorage.removeItem('vit_auth_token');
            window.localStorage.removeItem('vit_auth_user');
          });
        }

        // Navigate
        await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(600);

        // Perform custom action if needed
        if (pageDef.action === 'cab-tab') {
          const cabTabBtn = page.locator('button:has-text("Shared Cab"), #btn-tab-cab-share').first();
          if (await cabTabBtn.isVisible()) {
            await cabTabBtn.click();
            await page.waitForTimeout(400);
          }
        }

        // Switch admin tab if specified
        if (pageDef.tab && pageDef.tab !== 'overview') {
          const tabBtn = page.locator(`button[id="admin-tab-${pageDef.tab}"], nav button:has-text("${pageDef.tab}")`).first();
          if (await tabBtn.isVisible()) {
            await tabBtn.click();
            await page.waitForTimeout(400);
          }
        }

        // 1. Check for horizontal overflow
        const overflowMetrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientW = docEl.clientWidth;
          const diff = scrollW - clientW;
          
          // Find the overflowing element if any
          let overflowingElements = [];
          if (diff > 0) {
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
              const r = el.getBoundingClientRect();
              if (r.right > clientW + 1) {
                overflowingElements.push({
                  tag: el.tagName,
                  className: el.className?.toString?.() || '',
                  id: el.id || '',
                  right: r.right,
                  overflowBy: Math.round(r.right - clientW),
                });
              }
            }
          }
          return { scrollW, clientW, diff, overflowingElements: overflowingElements.slice(0, 5) };
        });

        if (overflowMetrics.diff > 1) {
          pageResult.overflow = true;
          pageResult.overflowPixels = overflowMetrics.diff;
          pageResult.overflowDetails = overflowMetrics.overflowingElements;
        }

        // 2. Check BottomNav visibility
        const bottomNavLoc = page.locator('nav.bottom-nav');
        const isBottomNavVisible = await bottomNavLoc.isVisible().catch(() => false);
        pageResult.bottomNavVisible = isBottomNavVisible;

        if (pageDef.auth !== 'admin') {
          // BottomNav expected on mobile (<768px), hidden on desktop (>=768px)
          if (vp.width < 768 && !isBottomNavVisible) {
            pageResult.bottomNavError = true;
            pageResult.errors.push('Bottom navigation expected on mobile (<768px) but not visible');
          } else if (vp.width >= 768 && isBottomNavVisible) {
            pageResult.bottomNavError = true;
            pageResult.errors.push('Bottom navigation should be hidden on desktop/tablet (>=768px) but is visible');
          }
        }

        // 3. Capture screenshot
        const screenshotFileName = `${pageDef.id}_${vp.width}x${vp.height}.png`;
        const screenshotFilePath = path.join(outputDir, screenshotFileName);
        await page.screenshot({ path: screenshotFilePath, fullPage: false });
        pageResult.screenshot = screenshotFileName;

        const statusIcon = pageResult.overflow ? '❌ OVERFLOW' : '✅ PASS';
        console.log(`  [${vp.name}] ${pageDef.id}: ${statusIcon} (diff: ${overflowMetrics.diff}px)`);
        if (pageResult.overflow) {
          console.log(`     -> Overflow elements:`, JSON.stringify(overflowMetrics.overflowingElements));
        }

      } catch (err) {
        pageResult.errors.push(err.message);
        console.error(`  [${vp.name}] ${pageDef.id}: ⚠️ ERROR: ${err.message}`);
      }

      results.push(pageResult);
    }

    await context.close();
  }

  await browser.close();

  const reportPath = path.join(outputDir, 'audit-results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAudit completed! Report saved to: ${reportPath}`);

  // Summary counts
  const total = results.length;
  const overflows = results.filter((r) => r.overflow).length;
  const errs = results.filter((r) => r.errors.length > 0).length;
  console.log(`Summary: Total Tested: ${total} | Overflows: ${overflows} | Errors: ${errs}`);
  return results;
}

const targetDir = process.argv[2] || 'docs/mobile-qa-evidence/after';
runAudit(targetDir).catch(console.error);
