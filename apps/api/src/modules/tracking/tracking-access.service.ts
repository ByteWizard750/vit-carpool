import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, BookingStatus, RideStatus } from '@vit-carpool/db';

export interface TrackingAccessContext {
  isDriver: boolean;
  confirmedBooking: any | null;
  ride: any;
}

@Injectable()
export class TrackingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Authorize a user to view tracking for a given ride.
   * Access is granted exclusively to:
   * 1. The ride's assigned driver.
   * 2. Passengers with a CONFIRMED booking for that ride.
   * Cohort isolation (student vs. faculty) is strictly preserved.
   */
  async authorizeRideTracking(user: User, rideId: string): Promise<TrackingAccessContext> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: { select: { id: true, fullName: true, phoneNumber: true } },
        vehicle: true,
        trackingSession: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    // Cohort isolation: Prevent access across student / faculty cohorts
    if (user.audience && ride.audience !== user.audience) {
      throw new ForbiddenException('Audience cohort mismatch');
    }

    const isDriver = ride.driverId === user.id;
    if (isDriver) {
      return { isDriver: true, confirmedBooking: null, ride };
    }

    // Check passenger booking
    const booking = await this.prisma.booking.findFirst({
      where: {
        rideId,
        passengerId: user.id,
      },
    });

    if (!booking) {
      throw new ForbiddenException('You do not have a booking for this ride');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ForbiddenException(
        `Tracking is only accessible with a confirmed booking. Current status: ${booking.status}`,
      );
    }

    return { isDriver: false, confirmedBooking: booking, ride };
  }

  /**
   * Authorize driver to submit GPS location updates.
   * Only the assigned driver can submit location updates, and only for active rides.
   */
  async authorizeDriverLocationUpdate(user: User, rideId: string): Promise<any> {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        trackingSession: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.driverId !== user.id) {
      throw new ForbiddenException('Only the assigned driver can update ride location');
    }

    if (ride.status !== RideStatus.IN_PROGRESS && ride.status !== RideStatus.SCHEDULED) {
      throw new ForbiddenException(`Cannot update location for ride with status ${ride.status}`);
    }

    return ride;
  }

  /**
   * Authorize passenger or driver to update passenger boarding status.
   */
  async authorizeBoardingUpdate(user: User, bookingId: string): Promise<any> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { ride: true, passenger: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const isPassenger = booking.passengerId === user.id;
    const isDriver = booking.ride.driverId === user.id;

    if (!isPassenger && !isDriver) {
      throw new ForbiddenException('You do not have permission to update boarding status for this booking');
    }

    return booking;
  }
}

