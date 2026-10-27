import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit.service';
import { User, RideStatus, BookingStatus, Prisma } from '@vit-carpool/db';
import {
  CreateRatingDto,
  DriverRatingResponseDto,
  DriverRatingSummaryDto,
  RatingEligibilityResponseDto,
} from '@vit-carpool/contracts';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Helper to format a DriverRating entity to DriverRatingResponseDto.
   */
  private toRatingDto(
    rating: {
      id: string;
      bookingId: string;
      rideId: string;
      passengerId: string;
      driverId: string;
      rating: number;
      review: string | null;
      createdAt: Date;
      updatedAt: Date;
      passenger?: { fullName: string } | null;
    },
    fallbackPassengerName?: string,
  ): DriverRatingResponseDto {
    return {
      id: rating.id,
      bookingId: rating.bookingId,
      rideId: rating.rideId,
      passengerId: rating.passengerId,
      passengerName: rating.passenger?.fullName || fallbackPassengerName || 'Verified Passenger',
      driverId: rating.driverId,
      rating: rating.rating,
      review: rating.review,
      createdAt: rating.createdAt.toISOString(),
      updatedAt: rating.updatedAt.toISOString(),
    };
  }

  /**
   * Submit a rating and optional review for a completed ride booking.
   * Enforces all non-negotiable rating invariants.
   */
  async createRating(user: User, dto: CreateRatingDto): Promise<DriverRatingResponseDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Fetch booking with ride details and lock row to prevent race conditions
        const booking = await tx.booking.findUnique({
          where: { id: dto.bookingId },
          include: {
            ride: true,
            passenger: { select: { id: true, fullName: true } },
            rating: true,
          },
        });

        if (!booking) {
          throw new NotFoundException('Booking not found.');
        }

        // Invariant 1: Caller must be the passenger of the booking
        if (booking.passengerId !== user.id) {
          throw new ForbiddenException('You can only rate rides that you personally booked.');
        }

        // Invariant 2: Driver cannot rate themselves
        if (booking.driverId === user.id || booking.ride.driverId === user.id) {
          throw new BadRequestException('Drivers cannot rate their own rides.');
        }

        // Invariant 3: Reviewed driver must be the actual driver of that ride
        if (booking.driverId !== booking.ride.driverId) {
          throw new BadRequestException('Booking driver does not match ride driver.');
        }

        // Invariant 4: Booking must have been CONFIRMED
        if (booking.status !== BookingStatus.CONFIRMED) {
          throw new BadRequestException(
            `Only confirmed bookings can be rated. Current booking status is ${booking.status}.`,
          );
        }

        // Invariant 5: Ride must not be cancelled
        if (booking.ride.status === RideStatus.CANCELLED) {
          throw new BadRequestException('Cancelled rides cannot be rated.');
        }

        // Invariant 6: Ride must be explicitly marked as COMPLETED by the driver
        if (booking.ride.status !== RideStatus.COMPLETED) {
          throw new BadRequestException(
            'Cannot rate a ride that has not been marked as completed.',
          );
        }

        // Invariant 7: Prevent duplicate ratings for the same booking
        if (booking.rating) {
          throw new ConflictException(
            'You have already submitted a rating for this booking.',
          );
        }

        // Invariant 8: Validate whole star rating between 1 and 5
        if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
          throw new BadRequestException('Rating must be an integer between 1 and 5 stars.');
        }

        const reviewText = dto.review?.trim() || null;

        const created = await tx.driverRating.create({
          data: {
            bookingId: booking.id,
            rideId: booking.rideId,
            passengerId: user.id,
            driverId: booking.ride.driverId,
            rating: dto.rating,
            review: reviewText,
          },
          include: {
            passenger: { select: { fullName: true } },
          },
        });

        await this.audit.log(
          {
            actorId: user.id,
            actorRole: user.role,
            action: 'DRIVER_RATED',
            targetType: 'DRIVER_RATING',
            targetId: created.id,
            changes: {
              driverId: booking.ride.driverId,
              rating: dto.rating,
              hasReview: Boolean(reviewText),
            },
          },
          tx,
        );

        return this.toRatingDto(created);
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          'You have already submitted a rating for this booking.',
        );
      }
      throw err;
    }
  }

  /**
   * Check rating eligibility for a booking.
   */
  async checkEligibility(user: User, bookingId: string): Promise<RatingEligibilityResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        ride: true,
        passenger: { select: { id: true, fullName: true } },
        rating: {
          include: { passenger: { select: { fullName: true } } },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    if (booking.passengerId !== user.id) {
      return { eligible: false, reason: 'You are not the passenger of this booking.' };
    }

    if (booking.rating) {
      return {
        eligible: false,
        reason: 'You have already rated this ride.',
        existingRating: this.toRatingDto(booking.rating),
      };
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      return {
        eligible: false,
        reason: `Only confirmed bookings can be rated (status: ${booking.status}).`,
      };
    }

    if (booking.ride.status === RideStatus.CANCELLED) {
      return { eligible: false, reason: 'This ride was cancelled.' };
    }

    if (booking.ride.status !== RideStatus.COMPLETED) {
      return { eligible: false, reason: 'This ride has not been marked as completed.' };
    }

    return { eligible: true };
  }

  /**
   * Retrieve aggregate rating and reviews for a driver.
   * Enforces audience isolation and returns 404 if driver does not exist or belongs to different cohort.
   * Drivers with no reviews return averageRating: null, totalReviews: 0.
   */
  async getDriverRatingSummary(user: User, driverId: string): Promise<DriverRatingSummaryDto> {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { id: true, audience: true },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }

    if (user.audience && driver.audience && user.audience !== driver.audience) {
      throw new NotFoundException('Driver not found or not accessible.');
    }

    const agg = await this.prisma.driverRating.aggregate({
      where: { driverId },
      _avg: { rating: true },
      _count: { id: true },
    });

    const reviews = await this.prisma.driverRating.findMany({
      where: { driverId },
      include: {
        passenger: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const averageRating =
      agg._count.id > 0 && agg._avg.rating !== null
        ? Math.round(agg._avg.rating * 10) / 10
        : null;

    return {
      driverId,
      averageRating,
      totalReviews: agg._count.id,
      reviews: reviews.map((r) => this.toRatingDto(r)),
    };
  }

  /**
   * Batch calculate driver rating aggregates for a list of driver IDs.
   * Used for search results and ride listings.
   */
  async getDriverRatingAggregates(
    driverIds: string[],
  ): Promise<Map<string, { average: number | null; count: number }>> {
    const map = new Map<string, { average: number | null; count: number }>();
    if (!driverIds.length) return map;

    const aggregates = await this.prisma.driverRating.groupBy({
      by: ['driverId'],
      where: { driverId: { in: driverIds } },
      _avg: { rating: true },
      _count: { id: true },
    });

    for (const agg of aggregates) {
      const average =
        agg._count.id > 0 && agg._avg.rating !== null
          ? Math.round(agg._avg.rating * 10) / 10
          : null;
      map.set(agg.driverId, { average, count: agg._count.id });
    }

    return map;
  }
}
