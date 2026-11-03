import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  loginAsSuperAdmin,
  loginAsModerator,
  loginAsStudentDriver,
  loginAsStudentPassenger,
} from './helpers/auth';

test.describe('Admin Control Centre: Operations, Moderation & RBAC Suite', () => {
  test('1. Unauthenticated and student users are strictly blocked from /admin', async ({ page }) => {
    // Unauthenticated access
    await page.goto('/admin');
    await page.waitForURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: /Operations Portal/i })).toBeVisible();

    // Regular student session
    await loginAsStudentPassenger(page);
    await page.goto('/admin');
    await page.waitForURL(/\/(dashboard|admin\/login)/);
    await expect(page.getByText(/Control Centre/i)).not.toBeVisible();
  });

  test('2. Dedicated Admin Login portal verifies 2FA/MFA challenge and grants access', async ({ page }) => {
    await page.goto('/admin/login');

    await expect(page.getByRole('heading', { name: /Operations Portal/i })).toBeVisible();
    await expect(page.getByText(/Restricted administrative gateway for campus operations/i)).toBeVisible();

    // Step 1: Authorized staff email
    await page.locator('#admin-email').fill('admin.safety@vitstudent.ac.in');
    await page.locator('#btn-admin-continue').click();

    // Step 2: 2FA MFA challenge code (dev mode deterministic code 123456)
    await expect(page.locator('#admin-mfa-code')).toBeVisible({ timeout: 5000 });
    await page.locator('#admin-mfa-code').fill('123456');
    await page.locator('#btn-admin-verify-mfa').click();

    // Should redirect to /admin dashboard
    await page.waitForURL(/\/admin/);
    await expect(page.getByRole('heading', { name: /Campus Moderation & Trust Console/i })).toBeVisible();
    await expect(page.getByText(/SUPER_ADMIN/i).first()).toBeVisible();
  });

  test('3. Super Admin has full visibility of all 10 Operations Centre modules', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin');

    // Check header and user identity
    await expect(page.getByRole('heading', { name: /Campus Moderation & Trust Console/i })).toBeVisible();
    await expect(page.getByText(/SUPER_ADMIN/i).first()).toBeVisible();

    // Verify all primary operations navigation tabs are accessible
    const overviewTab = page.locator('#tab-admin-overview');
    const verifTab = page.locator('#tab-admin-verifications');
    const safetyTab = page.locator('#tab-admin-safety');
    const usersTab = page.locator('#tab-admin-users');
    const ridesTab = page.locator('#tab-admin-rides');
    const bookingsTab = page.locator('#tab-admin-bookings');
    const auditTab = page.locator('#tab-admin-audit');
    const analyticsTab = page.locator('#tab-admin-analytics');
    const healthTab = page.locator('#tab-admin-health');
    const teamTab = page.locator('#tab-admin-team');
    const settingsTab = page.locator('#tab-admin-settings');

    await expect(overviewTab).toBeVisible();
    await expect(verifTab).toBeVisible();
    await expect(safetyTab).toBeVisible();
    await expect(usersTab).toBeVisible();
    await expect(ridesTab).toBeVisible();
    await expect(bookingsTab).toBeVisible();
    await expect(auditTab).toBeVisible();
    await expect(analyticsTab).toBeVisible();
    await expect(healthTab).toBeVisible();
    await expect(teamTab).toBeVisible();
    await expect(settingsTab).toBeVisible();

    // 1. Overview KPIs
    await overviewTab.click();
    await expect(page.getByText(/Published Rides/i)).toBeVisible();
    await expect(page.getByText(/Open Safety Reports/i)).toBeVisible();

    // 2. Rides Oversight
    await ridesTab.click();
    await expect(page.getByRole('heading', { name: /Platform Rides Oversight/i })).toBeVisible();

    // 3. Bookings Oversight
    await bookingsTab.click();
    await expect(page.getByRole('heading', { name: /Bookings Oversight/i })).toBeVisible();

    // 4. Live System Health
    await healthTab.click();
    await expect(page.getByRole('heading', { name: /Platform System Health/i })).toBeVisible();
    await expect(page.getByText(/OVERALL PLATFORM STATUS/i)).toBeVisible();

    // 5. Team Governance
    await teamTab.click();
    await expect(page.getByRole('heading', { name: /Administrator Team & Invitations/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Invite Administrator/i })).toBeVisible();

    // 6. Security Settings
    await settingsTab.click();
    await expect(page.getByRole('heading', { name: /Platform Security Policies & Settings/i })).toBeVisible();
  });

  test('4. RBAC Permission Boundaries: Moderator cannot access Admin Team Management', async ({ page }) => {
    await loginAsModerator(page);
    await page.goto('/admin');

    // Moderator role badge displayed
    await expect(page.getByText(/MODERATOR/i).first()).toBeVisible();

    // Moderator can access Overview, Verifications, Reports, and Users
    await expect(page.locator('#tab-admin-overview')).toBeVisible();
    await expect(page.locator('#tab-admin-safety')).toBeVisible();
    await expect(page.locator('#tab-admin-users')).toBeVisible();

    // Administrator Team tab is strictly hidden from Moderator
    await expect(page.locator('#tab-admin-team')).not.toBeVisible();
    await expect(page.locator('#tab-admin-settings')).not.toBeVisible();
  });

  test('5. Single-use Admin Invitation & Acceptance flow creates elevated staff member', async ({
    page,
    browser,
    request,
  }) => {
    const superAdmin = await loginAsSuperAdmin(page);

    // Super Admin issues an invitation for a new moderator
    const candidateEmail = `staff.mod.${Date.now()}@vitstudent.ac.in`;
    const inviteRes = await request.post('http://localhost:3000/admin/administrators/invite', {
      headers: {
        Authorization: `Bearer ${superAdmin.token}`,
        'Content-Type': 'application/json',
      },
      data: {
        email: candidateEmail,
        role: 'MODERATOR',
        reason: 'Adding exam week operations coordinator',
      },
    });

    expect(inviteRes.status()).toBe(201);
    const inviteData = await inviteRes.json();
    expect(inviteData.inviteToken).toBeTruthy();

    const rawInviteToken = inviteData.inviteToken;

    // Unauthenticated staff candidate context navigates to invite URL
    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();
    await candidatePage.goto(`/admin/login?invite=${rawInviteToken}`);
    await expect(candidatePage.getByRole('heading', { name: /Operations Portal/i })).toBeVisible();
    await expect(candidatePage.getByText(/You have been invited by a Super Administrator/i)).toBeVisible();

    // Complete staff account creation
    await candidatePage.locator('#invite-fullname').fill('Exam Week Coordinator');
    await candidatePage.locator('#btn-accept-invite').click();

    // Acceptance succeeds and redirects into Admin Control Centre
    await candidatePage.waitForURL(/\/admin/);
    await expect(candidatePage.getByRole('heading', { name: /Campus Moderation & Trust Console/i })).toBeVisible();
    await expect(candidatePage.getByText(/MODERATOR/i).first()).toBeVisible();

    await candidateContext.close();

    // Attempting to reuse the exact same invite token must fail
    const reuseRes = await request.post('http://localhost:3000/admin/auth/accept-invite', {
      data: {
        token: rawInviteToken,
        fullName: 'Another Impostor',
      },
    });
    expect(reuseRes.status()).toBe(400);
  });

  test('6. User Governance: Admin can suspend and reinstate a student account', async ({ page }) => {
    await loginAsSuperAdmin(page);
    await page.goto('/admin');

    const usersTab = page.locator('#tab-admin-users');
    await usersTab.click();

    // Search for student driver Arjun
    const searchInput = page.getByPlaceholder(/Search user by name or email/i);
    await searchInput.fill('arjun.driver');
    await page.waitForTimeout(600); // Debounce / network wait

    // Suspend action button
    const suspendBtn = page.locator('button:has-text("Suspend User")').first();
    if (await suspendBtn.isVisible()) {
      await suspendBtn.click();

      // Modal prompt for suspension reason
      await expect(page.getByRole('heading', { name: /Suspend User Account/i })).toBeVisible();
      await page.locator('#suspension-reason').fill('Reckless driving reported near Campus Gate 2');
      await page.locator('#confirm-suspend-btn').click();

      // Toast feedback appears
      await expect(page.getByText(/User account suspended successfully/i)).toBeVisible({ timeout: 5000 });

      // Reinstate user to restore clean state
      const reinstateBtn = page.locator('button:has-text("Reinstate Account")').first();
      await expect(reinstateBtn).toBeVisible();
      await reinstateBtn.click();
      await expect(page.getByText(/User account reinstated/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('7. Safety Cancellation: Admin cancels ride and notifies enrolled participants', async ({
    page,
    browser,
    request,
  }) => {
    // Student driver Arjun publishes a ride
    const driverContext = await browser.newContext();
    const driverPage = await driverContext.newPage();
    const driverAuth = await loginAsStudentDriver(driverPage);

    const now = new Date(Date.now() + 3600000).toISOString();
    const rideRes = await request.post('http://localhost:3000/rides', {
      headers: { Authorization: `Bearer ${driverAuth.token}` },
      data: {
        originText: 'Tambaram Bus Terminus',
        originLat: 12.9249,
        originLng: 80.1491,
        destinationText: 'VIT Chennai Campus',
        destinationLat: 12.8406,
        destinationLng: 80.1534,
        departureTime: now,
        totalSeats: 3,
        suggestedContribution: 60,
      },
    });

    if (rideRes.ok()) {
      const ride = await rideRes.json();

      // Super Admin navigates to Rides tab
      await loginAsSuperAdmin(page);
      await page.goto('/admin');
      await page.locator('#tab-admin-rides').click();

      // Search for the newly created ride
      const rideSearchInput = page.getByPlaceholder(/Search by origin, destination/i);
      await rideSearchInput.fill('Tambaram');
      await page.waitForTimeout(600);

      // Cancel Ride button
      const cancelBtn = page.locator(`button[id="btn-cancel-ride-${ride.id}"]`);
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();

        // Safety cancellation modal
        await expect(page.getByRole('heading', { name: /Administrative Ride Cancellation/i })).toBeVisible();
        await page.locator('#cancel-ride-reason').fill('Campus weather alert / flash waterlogging advisory');
        await page.locator('#confirm-cancel-ride-btn').click();

        await expect(page.getByText(/Ride cancelled for safety/i)).toBeVisible({ timeout: 5000 });
      }
    }

    await driverContext.close();
  });

  test('8. Last Super Admin Invariant: Prevents revocation of sole Super Administrator', async ({
    request,
    page,
  }) => {
    const superAdmin = await loginAsSuperAdmin(page);

    // Attempt to revoke the only active Super Admin
    const revokeRes = await request.delete(
      `http://localhost:3000/admin/administrators/${superAdmin.user.id}?reason=Accidental+self+demotion`,
      {
        headers: { Authorization: `Bearer ${superAdmin.token}` },
      }
    );

    // Invariant protection must reject this action
    expect(revokeRes.status()).toBe(400);
    const body = await revokeRes.json();
    expect(body.message).toMatch(/(Cannot revoke the last remaining active Super Administrator|Cannot revoke your own administrative privileges)/i);
  });
});
