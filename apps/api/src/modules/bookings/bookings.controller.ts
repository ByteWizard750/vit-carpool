import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, BookingStatus } from '@vit-carpool/db';
import {
  CreateBookingRequestSchema,
  CancelBookingSchema,
  RejectBookingSchema,
  PassengerBookingResponseDto,
  DriverBookingResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({ summary: 'Request seats on a scheduled ride (Verified passengers only)' })
  async requestBooking(
    @CurrentUser() user: User,
    @Body() body: unknown,
  ): Promise<PassengerBookingResponseDto> {
    const parsed = CreateBookingRequestSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    return this.bookingsService.requestBooking(user, parsed.data);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List all bookings where the caller is the passenger' })
  async getMyBookings(@CurrentUser() user: User): Promise<PassengerBookingResponseDto[]> {
    return this.bookingsService.getMyBookings(user);
  }

  @Get('driver')
  @ApiOperation({ summary: 'List booking requests for rides published by the driver' })
  async getDriverBookings(
    @CurrentUser() user: User,
    @Query('rideId') rideId?: string,
    @Query('status') status?: BookingStatus,
  ): Promise<DriverBookingResponseDto[]> {
    return this.bookingsService.getDriverBookings(user, rideId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve booking details (Passenger or Driver)' })
  async getBookingById(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<PassengerBookingResponseDto | DriverBookingResponseDto> {
    return this.bookingsService.getBookingById(user, id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending booking request (Driver only)' })
  async approveBooking(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<DriverBookingResponseDto> {
    return this.bookingsService.approveBooking(user, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending booking request (Driver only)' })
  async rejectBooking(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<DriverBookingResponseDto> {
    const parsed = RejectBookingSchema.safeParse(body || {});
    const dto = parsed.success ? parsed.data : undefined;
    return this.bookingsService.rejectBooking(user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or confirmed booking (Passenger only)' })
  async cancelBooking(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PassengerBookingResponseDto> {
    const parsed = CancelBookingSchema.safeParse(body || {});
    const dto = parsed.success ? parsed.data : undefined;
    return this.bookingsService.cancelBooking(user, id, dto);
  }
}
