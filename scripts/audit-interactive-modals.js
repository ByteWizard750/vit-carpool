const path = require('path');
const { chromium } = require(path.join(process.cwd(), 'apps/web/node_modules/@playwright/test'));
const fs = require('fs');

const VIEWPORTS = [
  { name: 'small-mobile', width: 320, height: 700 },
  { name: 'modern-mobile', width: 390, height: 844 },
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

async function testInteractiveModals(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const studentAuth = await getAuthToken('qa.student@vitstudent.ac.in');
  const adminAuth = await getAuthToken('admin.safety@vitstudent.ac.in');
  const adminUser = { ...adminAuth.user, role: 'SUPER_ADMIN' };

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- TESTING INTERACTIVE MODALS IN ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    // 1. Verification Modal (from Landing)
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const verifyPill = page.locator('button:has-text("Verify"), button:has-text("Verification")').first();
      if (await verifyPill.isVisible()) {
        await verifyPill.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(outputDir, `modal_verification_${vp.name}.png`) });
        console.log(`  [${vp.name}] Verification Modal: Captured`);
      }
    } catch (e) {
      console.log(`  [${vp.name}] Verification Modal: ${e.message}`);
    }

    // 2. Dev Diagnostics Drawer
    try {
      await page.goto(`${BASE_URL}/#diagnostics`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outputDir, `drawer_diagnostics_${vp.name}.png`) });
      console.log(`  [${vp.name}] Dev Diagnostics Drawer: Captured`);
    } catch (e) {
      console.log(`  [${vp.name}] Dev Diagnostics Drawer: ${e.message}`);
    }

    // Authenticate Student
    await page.addInitScript(({ t, u }) => {
      window.localStorage.setItem('vit_auth_token', t);
      window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
    }, { t: studentAuth.token, u: studentAuth.user });

    // 3. Rides Discovery - Ride Details Modal & Filters Modal
    try {
      await page.goto(`${BASE_URL}/rides`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      
      // Filters Modal if button exists
      const filterBtn = page.locator('button:has-text("Filters"), button:has-text("Filter")').first();
      if (await filterBtn.isVisible()) {
        await filterBtn.click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(outputDir, `modal_filters_${vp.name}.png`) });
        console.log(`  [${vp.name}] Filters Modal: Captured`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Ride Details Modal
      const rideCard = page.locator('.ride-summary-card, [id^="ride-card-"]').first();
      if (await rideCard.isVisible()) {
        await rideCard.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `modal_ride_details_${vp.name}.png`) });
        console.log(`  [${vp.name}] Ride Details Modal: Captured`);

        // Request Seat button
        const reqBtn = page.locator('button:has-text("Request Seat"), button:has-text("Join Cab")').first();
        if (await reqBtn.isVisible()) {
          await reqBtn.click();
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(outputDir, `modal_request_seat_${vp.name}.png`) });
          console.log(`  [${vp.name}] Request Seat Modal: Captured`);
        }
      }
    } catch (e) {
      console.log(`  [${vp.name}] Rides Modals: ${e.message}`);
    }

    // 4. My Rides - Modals (Update Fare / Manage Bookings)
    try {
      await page.goto(`${BASE_URL}/my-rides`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);

      // Look for Update Fare button
      const fareBtn = page.locator('button:has-text("Update Fare"), button:has-text("Revise Fare")').first();
      if (await fareBtn.isVisible()) {
        await fareBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `modal_update_fare_${vp.name}.png`) });
        console.log(`  [${vp.name}] Update Fare Modal: Captured`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }

      // Look for Manage Bookings button
      const manageBtn = page.locator('button:has-text("Manage"), button:has-text("Bookings")').first();
      if (await manageBtn.isVisible()) {
        await manageBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `modal_manage_bookings_${vp.name}.png`) });
        console.log(`  [${vp.name}] Manage Bookings Modal: Captured`);
      }
    } catch (e) {
      console.log(`  [${vp.name}] My Rides Modals: ${e.message}`);
    }

    // 5. Bookings Page - Boarding Pass Modal
    try {
      await page.goto(`${BASE_URL}/bookings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const passBtn = page.locator('button:has-text("Boarding Pass"), button:has-text("View Pass")').first();
      if (await passBtn.isVisible()) {
        await passBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `modal_boarding_pass_${vp.name}.png`) });
        console.log(`  [${vp.name}] Boarding Pass Modal: Captured`);
      }
    } catch (e) {
      console.log(`  [${vp.name}] Bookings Pass Modal: ${e.message}`);
    }

    // 6. Messages Page - Chat Viewport & Input Bar
    try {
      await page.goto(`${BASE_URL}/messages`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      const convItem = page.locator('.conversation-list-item, [id^="conv-"]').first();
      if (await convItem.isVisible()) {
        await convItem.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `view_active_chat_${vp.name}.png`) });
        console.log(`  [${vp.name}] Active Chat Thread View: Captured`);
      }
    } catch (e) {
      console.log(`  [${vp.name}] Messages View: ${e.message}`);
    }

    // 7. Admin Dashboard Modals & Tables (Admin session)
    try {
      await page.addInitScript(({ t, u }) => {
        window.localStorage.setItem('vit_auth_token', t);
        window.localStorage.setItem('vit_auth_user', JSON.stringify(u));
      }, { t: adminAuth.token, u: adminUser });

      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);

      // Open Safety Moderation tab
      const safetyTab = page.locator('button[id="admin-tab-safety"], button:has-text("Moderation")').first();
      if (await safetyTab.isVisible()) {
        await safetyTab.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(outputDir, `admin_moderation_table_${vp.name}.png`) });
        console.log(`  [${vp.name}] Admin Moderation Table: Captured`);
      }
    } catch (e) {
      console.log(`  [${vp.name}] Admin Modals: ${e.message}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\nInteractive Modals Inspection complete!');
}

const targetDir = process.argv[2] || 'docs/mobile-qa-evidence/after';
testInteractiveModals(targetDir).catch(console.error);
