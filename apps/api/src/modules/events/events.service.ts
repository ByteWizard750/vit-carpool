import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
    this.logger.log('WebSocket Server registered in EventsService');
  }

  getServer(): Server | null {
    return this.server;
  }

  /**
   * Emit an event specifically to a targeted user room: user:{userId}
   */
  emitToUser(userId: string, event: string, payload: any): void {
    if (!this.server) {
      this.logger.debug(`[EventsService] Cannot emit '${event}' to user:${userId} (server not yet initialized)`);
      return;
    }
    const room = `user:${userId}`;
    this.server.to(room).emit(event, payload);
    this.logger.debug(`[EventsService] Emitted '${event}' to room ${room}`);
  }

  /**
   * Emit an event to all subscribers of a ride room: ride:{rideId}
   */
  emitToRide(rideId: string, event: string, payload: any): void {
    if (!this.server) return;
    const room = `ride:${rideId}`;
    this.server.to(room).emit(event, payload);
    this.logger.debug(`[EventsService] Emitted '${event}' to room ${room}`);
  }

  /**
   * Emit an event to all subscribers of a conversation room: conversation:{conversationId}
   */
  emitToConversation(conversationId: string, event: string, payload: any): void {
    if (!this.server) return;
    const room = `conversation:${conversationId}`;
    this.server.to(room).emit(event, payload);
    this.logger.debug(`[EventsService] Emitted '${event}' to room ${room}`);
  }

  /**
   * Emit an event to the public rides discovery feed
   */
  emitToFeed(event: string, payload: any): void {
    if (!this.server) return;
    const room = 'rides_feed';
    this.server.to(room).emit(event, payload);
    this.logger.debug(`[EventsService] Emitted '${event}' to room ${room}`);
  }

  /**
   * Broadcast an event to every connected client on the /events namespace
   */
  broadcast(event: string, payload: any): void {
    if (!this.server) return;
    this.server.emit(event, payload);
    this.logger.debug(`[EventsService] Broadcasted '${event}' to all clients`);
  }
}
