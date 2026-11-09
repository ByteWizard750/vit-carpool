/**
 * Verification Script for Non-Material vs Material Fare Revision Fix
 */

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000';
const SUPP_DIR = path.resolve(__dirname, '../docs/manual-qa-evidence/supplementary');

async function devLogin(email, fullName, audience = 'STUDENT') {
  const res = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, fullName, audience }),
  });
  if (!res.ok) throw new Error(`devLogin failed: ${res.status}`);
  return await res.json();
}

async function injectAuth(page, token, user) {
  await page.goto(`${BASE_URL}/auth`);
  await page.evaluate(({ t, u }) => {
    localStorage.setItem('vit_auth_token', t);
    localStorage.setItem('vit_auth_user', JSON.stringify(u));
  }, { t: token, u: user });
}

async function run() {
  console.log('Testing Non-Material vs Material Fare Revision Fix in real browser...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const ts = Date.now();
  const org = await devLogin(`org.${ts}@vitstudent.ac.in`, 'Organiser User');
  const pass = await devLogin(`pass.${ts}@vitstudent.ac.in`, 'Passenger User');

  // 1. Publish cab share: 4 capacity, ₹600 estimated fare
  const depTime = new Date(Date.now() + 48 * 3600 * 1000);
  const deadlineTime = new Date(depTime.getTime() - 4 * 3600 * 1000);

  const pubRes = await fetch(`${API_URL}/api/rides/cab-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({
      origin: 'Tambaram Railway Station',
      destination: 'VIT Chennai Campus',
      departureTime: depTime.toISOString(),
      bookingDeadline: deadlineTime.toISOString(),
      totalCapacity: 4,
      estimatedTotalFare: 600,
    }),
  });
  const cabRide = await pubRes.json();
  console.log('Published cab ride:', cabRide.id);

  // 2. Passenger requests 1 seat and Organiser approves
  const bookRes = await fetch(`${API_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pass.token}` },
    body: JSON.stringify({ rideId: cabRide.id, requestedSeats: 1 }),
  });
  const booking = await bookRes.json();

  await fetch(`${API_URL}/api/bookings/${booking.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${org.token}` },
  });
  console.log('Booking approved:', booking.id);

  // 3. Non-material fare revision: ₹600 -> ₹630 (+5%)
  const nonMatRes = await fetch(`${API_URL}/api/rides/${cabRide.id}/cab-fare`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ finalTotalFare: 630, reason: 'Small toll adjustment' }),
  });
  const nonMatRide = await nonMatRes.json();
  console.log('Non-material update: fareRevision =', nonMatRide.cabShare?.fareRevision);

  // 4. Check Passenger UI
  await injectAuth(page, pass.token, pass.user);
  await page.goto(`${BASE_URL}/bookings`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const hasAckNoticeNonMat = await page.locator(`[id^="fare-revision-notice-"]`).isVisible().catch(() => false);
  const hasAckBtnNonMat = await page.locator(`[id^="btn-ack-fare-"]`).isVisible().catch(() => false);
  console.log('Non-material revision: Notice visible =', hasAckNoticeNonMat, '| Button visible =', hasAckBtnNonMat);

  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-01-non-material-fare-revision.png'), fullPage: true });

  // 5. Material fare increase: ₹630 -> ₹750 (+25%)
  const matRes = await fetch(`${API_URL}/api/rides/${cabRide.id}/cab-fare`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org.token}` },
    body: JSON.stringify({ finalTotalFare: 750, reason: 'Heavy traffic surge + toll' }),
  });
  const matRide = await matRes.json();
  console.log('Material update: fareRevision =', matRide.cabShare?.fareRevision);

  // 6. Reload Passenger UI
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);

  const hasAckNoticeMat = await page.locator(`[id^="fare-revision-notice-"]`).isVisible().catch(() => false);
  const hasAckBtnMat = await page.locator(`[id^="btn-ack-fare-"]`).isVisible().catch(() => false);
  console.log('Material revision: Notice visible =', hasAckNoticeMat, '| Button visible =', hasAckBtnMat);

  // 7. Click Acknowledge Updated Fare
  if (hasAckBtnMat) {
    await page.locator(`[id^="btn-ack-fare-"]`).first().click();
    await page.waitForTimeout(1200);
  }

  const hasAckedBadge = await page.locator(`[id^="fare-ack-badge-"]`).isVisible().catch(() => false);
  const ackBadgeText = hasAckedBadge ? await page.locator(`[id^="fare-ack-badge-"]`).innerText() : '';
  console.log('After clicking acknowledge: Badge visible =', hasAckedBadge, '| Text =', ackBadgeText.replace(/\n/g, ' '));

  await page.screenshot({ path: path.join(SUPP_DIR, 'supp-02-material-fare-acknowledgement.png'), fullPage: true });

  await browser.close();

  const success = !hasAckNoticeNonMat && hasAckNoticeMat && hasAckedBadge;
  console.log('\nVerification Result:', success ? 'ALL CRITERIA PASSED' : 'VERIFICATION FAILED');
  if (!success) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

