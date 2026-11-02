import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TrackingService } from './tracking.service';
import { TrackingAuthService } from './tracking-auth.service';
import { DriverLocationUpdateSchema, UpdateBoardingStatusSchema } from '@vit-carpool/contracts';
import { User, BoardingStatus } from '@vit-carpool/db';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: User;
    authPromise?: Promise<User>;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/tracking',
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly trackingService: TrackingService,
    private readonly trackingAuthService: TrackingAuthService,
  ) {}

  private async getAuthenticatedUser(client: AuthenticatedSocket): Promise<User | null> {
    if (client.data.user) return client.data.user;
    if (client.data.authPromise) {
      try {
        return await client.data.authPromise;
      } catch {
        return null;
      }
    }
    return null;
  }

  handleConnection(client: AuthenticatedSocket): void {
    const token =
      client.handshake.auth?.token ||
      (client.handshake.headers?.authorization as string) ||
      (client.handshake.query?.token as string);

    if (!token) {
      this.logger.warn(`[TrackingGateway] Client ${client.id} rejected: missing authentication token`);
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Authentication token required' });
      client.disconnect(true);
      return;
    }

    client.data.authPromise = this.trackingAuthService
      .authenticateToken(token)
      .then((user) => {
        client.data.user = user;
        this.logger.log(`[TrackingGateway] Client ${client.id} authenticated as ${user.email} (${user.id})`);
        return user;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        this.logger.warn(`[TrackingGateway] Client ${client.id} authentication error: ${message}`);
        client.emit('error', { code: 'UNAUTHORIZED', message });
        client.disconnect(true);
        return null as any;
      });
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const user = client.data.user;
    this.logger.log(`[TrackingGateway] Client ${client.id} disconnected (${user?.email || 'unauthenticated'})`);
  }

  /**
   * Client joins the tracking room for a specific ride.
   */
  @SubscribeMessage('join_tracking')
  async handleJoinTracking(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideId: string },
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const rideId = data?.rideId;
    if (!rideId) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'rideId is required' });
      return;
    }

    try {
      // Validate access authorization
      await this.trackingService.authorizeTrackingAccess(user, rideId);

      const room = `ride:${rideId}:tracking`;
      await client.join(room);
      this.logger.log(`[TrackingGateway] User ${user.email} joined ${room}`);

      // Fetch and emit current state to the joining client
      const state = await this.trackingService.getTrackingState(user, rideId);
      client.emit('tracking_state', state);
    } catch (err: any) {
      const message = err.message || 'Access denied to ride tracking';
      client.emit('error', { code: 'FORBIDDEN', message });
    }
  }

  /**
   * Client leaves the tracking room.
   */
  @SubscribeMessage('leave_tracking')
  async handleLeaveTracking(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideId: string },
  ): Promise<void> {
    if (data?.rideId) {
      const room = `ride:${data.rideId}:tracking`;
      await client.leave(room);
      this.logger.log(`[TrackingGateway] Client ${client.id} left ${room}`);
    }
  }

  /**
   * Driver sends GPS coordinates via WebSocket.
   */
  @SubscribeMessage('location_update')
  async handleLocationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { rideId: string; location: unknown },
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const { rideId, location } = payload || {};
    if (!rideId) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'rideId is required' });
      return;
    }

    const parsed = DriverLocationUpdateSchema.safeParse(location);
    if (!parsed.success) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'Invalid location payload format' });
      return;
    }

    try {
      const result = await this.trackingService.recordDriverLocation(user, rideId, parsed.data);

      const room = `ride:${rideId}:tracking`;

      // Broadcast location update to all listeners in the ride room
      this.server.to(room).emit('location_updated', {
        rideId,
        location: {
          latitude: result.snapshot.latitude,
          longitude: result.snapshot.longitude,
          accuracy: result.snapshot.accuracy,
          speedKmh: result.snapshot.speedKmh,
          heading: result.snapshot.heading,
          recordedAt: result.snapshot.recordedAt.toISOString(),
        },
        passengerETAs: result.passengerETAs,
      });

      // Individual proximity events
      for (const passengerId of result.approachingPassengerIds) {
        this.server.to(room).emit('passenger_approaching', {
          rideId,
          passengerId,
          etaMinutes: result.passengerETAs[passengerId]?.etaMinutes ?? 5,
        });
      }

      for (const passengerId of result.stoppedNearPassengerIds) {
        this.server.to(room).emit('driver_stopped_near_pickup', {
          rideId,
          passengerId,
        });
      }

      for (const passengerId of result.missedPickupPassengerIds) {
        this.server.to(room).emit('passenger_missed_pickup', {
          rideId,
          passengerId,
        });
      }
    } catch (err: any) {
      client.emit('error', { code: 'LOCATION_REJECTED', message: err.message || 'Failed to record location' });
    }
  }

  /**
   * Passenger or driver updates boarding status.
   */
  @SubscribeMessage('boarding_update')
  async handleBoardingUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { rideId: string; bookingId: string; boardingStatus: BoardingStatus },
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) {
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Not authenticated' });
      return;
    }

    const { rideId, bookingId, boardingStatus } = payload || {};
    if (!rideId || !bookingId || !boardingStatus) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'rideId, bookingId, and boardingStatus are required' });
      return;
    }

    try {
      const updated = await this.trackingService.updateBoardingStatus(user, bookingId, boardingStatus);

      const room = `ride:${rideId}:tracking`;
      this.server.to(room).emit('boarding_updated', {
        rideId,
        bookingId,
        passengerId: updated.passengerId,
        boardingStatus: updated.boardingStatus,
        boardedAt: updated.boardedAt ? updated.boardedAt.toISOString() : null,
      });
    } catch (err: any) {
      client.emit('error', { code: 'BOARDING_REJECTED', message: err.message || 'Failed to update boarding status' });
    }
  }

  /**
   * Revoke tracking access for all clients in a ride room (e.g. ride cancelled or completed).
   */
  async revokeRideAccess(rideId: string, reason: string): Promise<void> {
    const room = `ride:${rideId}:tracking`;
    if (this.server) {
      this.server.to(room).emit('access_revoked', { rideId, reason });
      this.server.in(room).socketsLeave(room);
      this.logger.log(`[TrackingGateway] Revoked access for room ${room}: ${reason}`);
    }
  }

  /**
   * Revoke tracking access for a specific passenger whose booking was cancelled.
   */
  async revokePassengerAccess(rideId: string, passengerId: string, reason: string): Promise<void> {
    const room = `ride:${rideId}:tracking`;
    if (!this.server) return;

    const sockets = await this.server.in(room).fetchSockets();
    for (const socket of sockets) {
      const socketUser = (socket as any).data?.user;
      if (socketUser && socketUser.id === passengerId) {
        socket.emit('access_revoked', { rideId, passengerId, reason });
        socket.leave(room);
        this.logger.log(`[TrackingGateway] Revoked access for passenger ${passengerId} from ${room}: ${reason}`);
      }
    }
  }

  /**
   * Helper to broadcast a location update from REST controller.
   */
  broadcastLocation(
    rideId: string,
    snapshot: any,
    passengerETAs: any,
    approachingPassengerIds: string[] = [],
    stoppedNearPassengerIds: string[] = [],
    missedPickupPassengerIds: string[] = [],
  ): void {
    if (this.server) {
      const room = `ride:${rideId}:tracking`;
      this.server.to(room).emit('location_updated', {
        rideId,
        location: {
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          accuracy: snapshot.accuracy,
          speedKmh: snapshot.speedKmh,
          heading: snapshot.heading,
          recordedAt: snapshot.recordedAt.toISOString(),
        },
        passengerETAs,
      });

      for (const passengerId of approachingPassengerIds) {
        this.server.to(room).emit('passenger_approaching', {
          rideId,
          passengerId,
          etaMinutes: passengerETAs[passengerId]?.etaMinutes ?? 5,
        });
      }

      for (const passengerId of stoppedNearPassengerIds) {
        this.server.to(room).emit('driver_stopped_near_pickup', {
          rideId,
          passengerId,
        });
      }

      for (const passengerId of missedPickupPassengerIds) {
        this.server.to(room).emit('passenger_missed_pickup', {
          rideId,
          passengerId,
        });
      }

      // Restore active tracking state across all listeners
      this.server.to(room).emit('tracking_active', {
        rideId,
        isStale: false,
        resumedAt: snapshot.recordedAt.toISOString(),
      });
    }
  }

  /**
   * Helper to broadcast staleness notice to a ride room.
   */
  broadcastStale(rideId: string, lastUpdateAt: string | null): void {
    if (this.server) {
      const room = `ride:${rideId}:tracking`;
      this.server.to(room).emit('tracking_stale', {
        rideId,
        isStale: true,
        lastUpdateAt,
      });
      this.logger.log(`[TrackingGateway] Broadcast tracking_stale for ride ${rideId}`);
    }
  }

  /**
   * Helper to broadcast active restoration to a ride room.
   */
  broadcastActive(rideId: string, resumedAt: string): void {
    if (this.server) {
      const room = `ride:${rideId}:tracking`;
      this.server.to(room).emit('tracking_active', {
        rideId,
        isStale: false,
        resumedAt,
      });
      this.logger.log(`[TrackingGateway] Broadcast tracking_active for ride ${rideId}`);
    }
  }

  /**
   * Helper to broadcast boarding update from REST controller.
   */
  broadcastBoarding(rideId: string, bookingId: string, passengerId: string, status: string, boardedAt: string | null): void {
    if (this.server) {
      this.server.to(`ride:${rideId}:tracking`).emit('boarding_updated', {
        rideId,
        bookingId,
        passengerId,
        boardingStatus: status,
        boardedAt,
      });
    }
  }
}

