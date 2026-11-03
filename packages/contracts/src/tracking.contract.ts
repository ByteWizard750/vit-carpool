import { z } from 'zod';
import { RideStatusSchema } from './ride.contract';
import { BoardingStatusSchema } from './booking.contract';

/**
 * Driver GPS location update payload from client or REST endpoint.
 */
export const DriverLocationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(5000).optional().nullable(),
  speedKmh: z.number().min(0).max(300).optional().nullable(),
  heading: z.number().min(0).max(360).optional().nullable(),
  timestamp: z.string().optional(),
});

export type DriverLocationUpdateDto = z.infer<typeof DriverLocationUpdateSchema>;

/**
 * Passenger boarding status transition payload.
 */
export const UpdateBoardingStatusSchema = z.object({
  bookingId: z.string().uuid(),
  boardingStatus: BoardingStatusSchema,
});

export type UpdateBoardingStatusDto = z.infer<typeof UpdateBoardingStatusSchema>;

/**
 * Source of ETA calculation.
 */
export const EtaSourceSchema = z.enum([
  'MAPBOX_DIRECTIONS',
  'CAMPUS_ESTIMATE_FALLBACK',
  'CACHED',
  'UNAVAILABLE',
]);
export type EtaSource = z.infer<typeof EtaSourceSchema>;

/**
 * Live passenger tracking info on active ride.
 */
export const PassengerTrackingInfoSchema = z.object({
  bookingId: z.string().uuid(),
  passengerId: z.string().uuid(),
  passengerName: z.string(),
  passengerAvatarUrl: z.string().nullable().optional(),
  pickupAddress: z.string().nullable().optional(),
  pickupLatitude: z.number().nullable().optional(),
  pickupLongitude: z.number().nullable().optional(),
  pickupDescription: z.string().nullable().optional(),
  boardingStatus: BoardingStatusSchema,
  boardedAt: z.string().nullable().optional(),
  proximityNotifiedAt: z.string().nullable().optional(),
  etaMinutes: z.number().nullable().optional(),
  etaSeconds: z.number().nullable().optional(),
  distanceMeters: z.number().nullable().optional(),
  etaCalculatedAt: z.string().nullable().optional(),
  etaSource: EtaSourceSchema.optional(),
  isApproximate: z.boolean().optional(),
});

export type PassengerTrackingInfoDto = z.infer<typeof PassengerTrackingInfoSchema>;

/**
 * Live snapshot of a driver location.
 */
export const DriverLocationSnapshotSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nullable().optional(),
  speedKmh: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  recordedAt: z.string(),
});

export type DriverLocationSnapshotDto = z.infer<typeof DriverLocationSnapshotSchema>;

/**
 * Complete active tracking session response for a ride.
 */
export const TrackingSessionStateSchema = z.object({
  rideId: z.string().uuid(),
  status: RideStatusSchema,
  isTrackingActive: z.boolean(),
  isStale: z.boolean(),
  startedAt: z.string().nullable().optional(),
  lastUpdateAt: z.string().nullable().optional(),
  driverId: z.string().uuid(),
  driverName: z.string(),
  driverAvatarUrl: z.string().nullable().optional(),
  vehicle: z
    .object({
      make: z.string(),
      model: z.string(),
      color: z.string(),
      registrationNumber: z.string().optional(), // Driver or confirmed passenger only
      imageUrl: z.string().nullable().optional(),
    })
    .optional(),
  origin: z.string(),
  originAddress: z.string().nullable().optional(),
  originLatitude: z.number().nullable().optional(),
  originLongitude: z.number().nullable().optional(),
  destination: z.string(),
  destinationAddress: z.string().nullable().optional(),
  destinationLatitude: z.number().nullable().optional(),
  destinationLongitude: z.number().nullable().optional(),
  currentLocation: DriverLocationSnapshotSchema.nullable().optional(),
  passengers: z.array(PassengerTrackingInfoSchema),
  // For the current viewer if they are a passenger:
  myPickup: z
    .object({
      bookingId: z.string().uuid(),
      pickupAddress: z.string().nullable().optional(),
      pickupLatitude: z.number().nullable().optional(),
      pickupLongitude: z.number().nullable().optional(),
      pickupDescription: z.string().nullable().optional(),
      boardingStatus: BoardingStatusSchema,
      etaMinutes: z.number().nullable().optional(),
      etaSeconds: z.number().nullable().optional(),
      distanceMeters: z.number().nullable().optional(),
      etaCalculatedAt: z.string().nullable().optional(),
      etaSource: EtaSourceSchema.optional(),
      isApproximate: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});

export type TrackingSessionStateDto = z.infer<typeof TrackingSessionStateSchema>;

