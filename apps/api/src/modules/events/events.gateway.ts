import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TrackingAuthService } from '../tracking/tracking-auth.service';
import { EventsService } from './events.service';
import { User } from '@vit-carpool/db';

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
  namespace: '/events',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly trackingAuthService: TrackingAuthService,
  ) {}

  afterInit(server: Server): void {
    this.eventsService.setServer(server);
    this.logger.log('EventsGateway initialized on namespace /events');
  }

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
      this.logger.warn(`[EventsGateway] Client ${client.id} rejected: missing authentication token`);
      client.emit('error', { code: 'UNAUTHORIZED', message: 'Authentication token required' });
      client.disconnect(true);
      return;
    }

    client.data.authPromise = this.trackingAuthService
      .authenticateToken(token)
      .then((user) => {
        client.data.user = user;
        // Automatically join the user's private notification/event room
        const userRoom = `user:${user.id}`;
        client.join(userRoom);
        this.logger.log(
          `[EventsGateway] Client ${client.id} authenticated as ${user.email} (${user.id}), auto-joined ${userRoom}`,
        );
        client.emit('connected', { userId: user.id });
        return user;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        this.logger.warn(`[EventsGateway] Client ${client.id} authentication error: ${message}`);
        client.emit('error', { code: 'UNAUTHORIZED', message });
        client.disconnect(true);
        return null as any;
      });
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const user = client.data.user;
    this.logger.log(
      `[EventsGateway] Client ${client.id} disconnected (${user?.email || 'unauthenticated'})`,
    );
  }

  @SubscribeMessage('subscribe_ride')
  async handleSubscribeRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideId: string },
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) return;
    if (!data?.rideId) return;

    const room = `ride:${data.rideId}`;
    await client.join(room);
    this.logger.debug(`[EventsGateway] User ${user.email} subscribed to ${room}`);
  }

  @SubscribeMessage('unsubscribe_ride')
  async handleUnsubscribeRide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { rideId: string },
  ): Promise<void> {
    if (!data?.rideId) return;
    const room = `ride:${data.rideId}`;
    await client.leave(room);
    this.logger.debug(`[EventsGateway] Client ${client.id} unsubscribed from ${room}`);
  }

  @SubscribeMessage('subscribe_conversation')
  async handleSubscribeConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) return;
    if (!data?.conversationId) return;

    const room = `conversation:${data.conversationId}`;
    await client.join(room);
    this.logger.debug(`[EventsGateway] User ${user.email} subscribed to ${room}`);
  }

  @SubscribeMessage('unsubscribe_conversation')
  async handleUnsubscribeConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    if (!data?.conversationId) return;
    const room = `conversation:${data.conversationId}`;
    await client.leave(room);
    this.logger.debug(`[EventsGateway] Client ${client.id} unsubscribed from ${room}`);
  }

  @SubscribeMessage('subscribe_feed')
  async handleSubscribeFeed(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    const user = await this.getAuthenticatedUser(client);
    if (!user) return;

    await client.join('rides_feed');
    this.logger.debug(`[EventsGateway] User ${user.email} subscribed to rides_feed`);
  }

  @SubscribeMessage('unsubscribe_feed')
  async handleUnsubscribeFeed(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
    await client.leave('rides_feed');
  }
}
