import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
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
  BoardingOtpResponseDto,
  VerifyBoardingOtpSchema,
  VerifyBoardingResponseDto,
  MarkNoShowSchema,
  MarkNoShowResponseDto,
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

  @Get(':id/boarding-otp')
  @ApiOperation({ summary: 'Retrieve unique boarding OTP (Passenger only)' })
  async getBoardingOtp(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<BoardingOtpResponseDto> {
    return this.bookingsService.getPassengerBoardingOtp(user, id);
  }

  @Post(':id/boarding-otp/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate boarding OTP with 60s cooldown (Passenger only)' })
  async regenerateBoardingOtp(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<BoardingOtpResponseDto> {
    return this.bookingsService.regeneratePassengerBoardingOtp(user, id);
  }

  @Post(':id/verify-boarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify passenger boarding OTP and mark BOARDED (Driver only)' })
  async verifyBoarding(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<VerifyBoardingResponseDto> {
    const parsed = VerifyBoardingOtpSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e: { message: string }) => e.message).join('; '));
    }
    return this.bookingsService.verifyBoardingOtp(user, id, parsed.data.otp);
  }

  @Post(':id/mark-no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark passenger as no-show / missed pickup (Driver only)' })
  async markNoShow(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<MarkNoShowResponseDto> {
    const parsed = MarkNoShowSchema.safeParse(body || {});
    return this.bookingsService.markNoShow(user, id, parsed.success ? parsed.data.reason : undefined);
  }
}
