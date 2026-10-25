import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { VerifiedUserGuard } from '../auth/guards/verified-user.guard';
import { LocationRateLimiterGuard } from './guards/location-rate-limiter.guard';
import {
  LocationAutocompleteQuerySchema,
  LocationAutocompleteResponseDto,
} from '@vit-carpool/contracts';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(VerifiedUserGuard, LocationRateLimiterGuard)
@Controller('locations')
export class LocationsController {
  private readonly logger = new Logger(LocationsController.name);

  constructor(private readonly locationsService: LocationsService) {}

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Search locations for autocomplete (Verified community members only)',
  })
  async autocomplete(@Query() query: unknown): Promise<LocationAutocompleteResponseDto> {
    // If q is completely absent or empty, return empty list
    const rawQ = typeof query === 'object' && query !== null && 'q' in query ? (query as any).q : '';
    if (typeof rawQ === 'string' && rawQ.trim().length < 2) {
      return { suggestions: [] };
    }

    const parsed = LocationAutocompleteQuerySchema.safeParse(query);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new BadRequestException({
        statusCode: 400,
        message: messages.join('; '),
        error: 'Bad Request',
      });
    }

    this.logger.debug?.(`Location autocomplete query: "${parsed.data.q}" (limit: ${parsed.data.limit})`);
    return this.locationsService.autocomplete(parsed.data.q, parsed.data.limit);
  }
}
