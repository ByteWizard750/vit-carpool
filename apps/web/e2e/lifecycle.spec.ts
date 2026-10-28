import { test, expect } from '@playwright/test';
import { loginAsStudentDriver, loginAsStudentPassenger } from './helpers/auth';

test.describe('Milestone 16: Complete Student Ride Lifecycle', () => {
  test('Complete 23-step student ride lifecycle from offer to rating across driver & passenger', async ({
    browser,
  }) => {
    // -------------------------------------------------------------------------
    // Phase 1: Driver Setup & Ride Publication
    // -------------------------------------------------------------------------
    const driverContext = await browser.newContext();
    const driverPage = await driverContext.newPage();

    // 1. Log in as eligible student driver
    const driverAuth = await loginAsStudentDriver(driverPage);
    expect(driverAuth.user.audience).toBe('STUDENT');
    expect(driverAuth.user.verificationStatus).toBe('VERIFIED');

    // 2. Verify student dashboard loads
    await driverPage.goto('/dashboard');
    await expect(driverPage.getByRole('heading', { name: /Welcome back/i })).toBeVisible();

    // 3. Navigate to vehicle management
    await driverPage.goto('/vehicles');
    await expect(driverPage.getByRole('heading', { name: /Registered Vehicles/i })).toBeVisible();

    // 4. Verify registered vehicle exists (e.g. Hyundai i20 or Tata Nexon)
    const vehicleCard = driverPage.locator('.vehicle-card').first();
    await expect(vehicleCard).toBeVisible();

    // 5. Navigate to offer-ride form
    await driverPage.goto('/offer-ride');
    await expect(driverPage.getByRole('heading', { name: /Offer a Campus Ride/i })).toBeVisible();

    // 6. Switch to Custom Ride mode & fill fields
    const customTab = driverPage.locator('#tab-custom-ride, button:has-text("Custom Ride")').first();
    if (await customTab.isVisible()) {
      await customTab.click();
    }

    // Set origin
    const originInput = driverPage.locator('#offer-origin-autocomplete');
    await originInput.fill('Tambaram');
    // Wait for dropdown and select first option
    const originOpt = driverPage.locator('#offer-origin-autocomplete-opt-0, [role="option"]').first();
    await originOpt.waitFor({ state: 'visible', timeout: 5000 });
    await originOpt.click();

    // Set destination
    const destInput = driverPage.locator('#offer-destination-autocomplete');
    await destInput.fill('VIT Chennai');
    const destOpt = driverPage.locator('#offer-destination-autocomplete-opt-0, [role="option"]').first();
    await destOpt.waitFor({ state: 'visible', timeout: 5000 });
    await destOpt.click();

    // Set departure time: 5 days from now 09:30 AM in Asia/Kolkata
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const yyyy = futureDate.getFullYear();
    const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
    const dd = String(futureDate.getDate()).padStart(2, '0');
    const timeValue = `${yyyy}-${mm}-${dd}T09:30`;
    await driverPage.locator('#offer-departure-time').fill(timeValue);

    // Set seats and unique cost (between ₹55 and ₹95) to isolate from prior test runs
    const uniqueCost = String(55 + (Date.now() % 40));
    await driverPage.locator('#offer-seats-select').selectOption('3');
    await driverPage.locator('#offer-cost-input').fill(uniqueCost);

    // Add private pickup landmark instruction
    const pickupInput = driverPage.locator('input[placeholder*="Near Station Gate 2"], input[placeholder*="Pickup Instructions"]').first();
    if (await pickupInput.isVisible()) {
      await pickupInput.fill('Gate 1 parking entrance near ATM');
    }

    // 7. Publish ride
    const publishBtn = driverPage.getByRole('button', { name: /Publish Ride to Campus/i });
    await publishBtn.click();

    // 8. Verify ride appears in driver's ride management interface (/my-rides)
    await driverPage.waitForURL(/\/my-rides/);
    await expect(driverPage.getByRole('heading', { name: /Driver Ride Management/i })).toBeVisible();
    await expect(driverPage.getByText(/Tambaram/i).first()).toBeVisible();
    await expect(driverPage.getByText(/VIT Chennai/i).first()).toBeVisible();

    // -------------------------------------------------------------------------
    // Phase 2: Passenger Search, Privacy Verification & Booking
    // -------------------------------------------------------------------------
    const passengerContext = await browser.newContext();
    const passengerPage = await passengerContext.newPage();

    // 9. Log in as eligible student passenger
    const passAuth = await loginAsStudentPassenger(passengerPage);
    expect(passAuth.user.audience).toBe('STUDENT');

    // 10. Search for the published ride
    await passengerPage.goto('/rides');
    await expect(passengerPage.getByRole('heading', { name: /Campus Ride Discovery/i })).toBeVisible();

    const searchOrigin = passengerPage.locator('#rides-search-origin');
    await searchOrigin.fill('Tambaram');
    const searchOrigOpt = passengerPage.locator('[role="option"]').first();
    await searchOrigOpt.waitFor({ state: 'visible', timeout: 5000 });
    await searchOrigOpt.click();

    const searchDest = passengerPage.locator('#rides-search-destination');
    await searchDest.fill('VIT Chennai');
    const searchDestOpt = passengerPage.locator('[role="option"]').first();
    await searchDestOpt.waitFor({ state: 'visible', timeout: 5000 });
    await searchDestOpt.click();

    await passengerPage.locator('#rides-filter-date').fill(`${yyyy}-${mm}-${dd}`);

    const searchBtn = passengerPage.getByRole('button', { name: /Search Rides/i });
    await searchBtn.click();

    // 11. Open ride details modal for the just-published ride
    const targetCard = passengerPage.locator('.ride-result-card').filter({ hasText: `₹${uniqueCost}` }).first();
    const viewBtn = targetCard.getByRole('button', { name: /View Details & Book/i });
    await expect(viewBtn).toBeVisible();
    await viewBtn.click();

    // 12. Verify private pickup notes are NOT exposed before confirmation
    await expect(passengerPage.getByText(/Gate 1 parking entrance near ATM/i)).not.toBeVisible();

    // 13. Request seats
    const confirmRequestBtn = passengerPage.locator('#btn-confirm-seat-request');
    await expect(confirmRequestBtn).toBeVisible();
    await confirmRequestBtn.click();

    await expect(passengerPage.getByText(/Request Submitted!|Seat request submitted/i).first()).toBeVisible();

    // -------------------------------------------------------------------------
    // Phase 3: Driver Booking Approval & Atomic Seat Decrement
    // -------------------------------------------------------------------------
    // 14. Switch to driver context on /my-rides
    await driverPage.goto('/my-rides');
    const driverRideCard = driverPage.locator('.my-ride-card').filter({ hasText: `₹${uniqueCost}` }).first();
    const requestsBtn = driverRideCard.locator('button:has-text("Requests")');
    await expect(requestsBtn).toBeVisible();
    await requestsBtn.click();

    // 15. Driver approves passenger request
    const approveBtn = driverPage.getByRole('button', { name: /Approve/i }).first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // 16. Verify approval feedback and updated seats
    await expect(driverPage.getByRole('dialog').getByText('CONFIRMED')).toBeVisible();
    await expect(driverPage.getByRole('dialog').getByText(/2 of 3 seats open/i)).toBeVisible();
    const closeRequestsModal = driverPage.getByRole('dialog').getByRole('button', { name: 'Close', exact: true });
    await closeRequestsModal.click();

    // -------------------------------------------------------------------------
    // Phase 4: Passenger Confirmed Details & Chat Interaction
    // -------------------------------------------------------------------------
    // 17. Switch to passenger on /bookings
    await passengerPage.goto('/bookings');
    await expect(passengerPage.getByRole('heading', { name: /Carpool Bookings/i })).toBeVisible();

    const bookingCard = passengerPage.locator('.passenger-booking-card').filter({ hasText: `₹${uniqueCost}` }).first();
    await expect(bookingCard.getByText('CONFIRMED', { exact: true })).toBeVisible();

    // 18. Verify confirmed private details are now visible
    await expect(bookingCard.getByText(/Gate 1 parking entrance near ATM/i)).toBeVisible();

    // 19. Open private conversation with driver
    const chatBtn = bookingCard.locator('button:has-text("Chat with Driver")');
    await expect(chatBtn).toBeVisible();
    await chatBtn.click();

    await passengerPage.waitForURL(/\/messages/);
    await expect(passengerPage.getByRole('heading', { name: /Ride Messages/i })).toBeVisible();

    // 20. Send a message and verify it appears
    const chatInput = passengerPage.locator('#input-chat-message');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Hi Arjun! I am waiting near the campus gate.');
    const sendBtn = passengerPage.locator('#btn-send-message');
    await sendBtn.click();

    await expect(passengerPage.locator('#chat-messages-scroll-area').getByText('Hi Arjun! I am waiting near the campus gate.')).toBeVisible();

    // -------------------------------------------------------------------------
    // Phase 5: Ride Completion & Passenger Driver Rating
    // -------------------------------------------------------------------------
    // 21. Driver marks ride completed
    await driverPage.goto('/my-rides');
    const driverRideCard2 = driverPage.locator('.my-ride-card').filter({ hasText: `₹${uniqueCost}` }).first();
    const completeBtn = driverRideCard2.locator('button:has-text("Mark Completed")').first();
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();
    await expect(driverPage.getByText(/Ride successfully marked as completed!/i)).toBeVisible();

    // 22. Passenger submits driver rating on /bookings
    await passengerPage.goto('/bookings');
    const bookingCardAfterComplete = passengerPage.locator('.passenger-booking-card').filter({ hasText: `₹${uniqueCost}` }).first();
    const rateDriverBtn = bookingCardAfterComplete.locator('button:has-text("Rate Driver")');
    await expect(rateDriverBtn).toBeVisible();
    await rateDriverBtn.click();

    // Modal opens
    await expect(passengerPage.getByRole('heading', { name: /Rate Your Campus Ride/i })).toBeVisible();
    const star5 = passengerPage.locator('#btn-star-5');
    await star5.click();
    await passengerPage.locator('#review-textarea').fill('Excellent driving and punctual pickup!');
    const submitRatingBtn = passengerPage.getByRole('button', { name: /Submit Rating/i });
    await submitRatingBtn.click();

    // 23. Verify rating is persisted and displayed
    await expect(bookingCardAfterComplete.getByText(/Rated \(5\/5\)/i)).toBeVisible();

    // Teardown isolated browser contexts
    await driverContext.close();
    await passengerContext.close();
  });
});
