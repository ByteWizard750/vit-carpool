import { Test, TestingModule } from '@nestjs/testing';
import { EventsModule } from '../src/modules/events/events.module';
import { EventsService } from '../src/modules/events/events.service';
import { EventsGateway } from '../src/modules/events/events.gateway';
import { TrackingAuthService } from '../src/modules/tracking/tracking-auth.service';
import { APP_SOCKET_EVENTS } from '@vit-carpool/contracts';

describe('Real-Time WebSocket Event Architecture (e2e/unit)', () => {
  let eventsService: EventsService;
  let eventsGateway: EventsGateway;
  let mockServer: any;

  beforeEach(async () => {
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        EventsGateway,
        {
          provide: TrackingAuthService,
          useValue: { authenticateToken: jest.fn() },
        },
      ],
    }).compile();

    eventsService = module.get<EventsService>(EventsService);
    eventsGateway = module.get<EventsGateway>(EventsGateway);
    eventsService.setServer(mockServer as any);
  });

  it('should define all core application socket event constants', () => {
    expect(APP_SOCKET_EVENTS.BOOKING_CREATED).toBe('booking:created');
    expect(APP_SOCKET_EVENTS.BOOKING_UPDATED).toBe('booking:updated');
    expect(APP_SOCKET_EVENTS.BOOKING_CANCELLED).toBe('booking:cancelled');
    expect(APP_SOCKET_EVENTS.RIDE_CREATED).toBe('ride:created');
    expect(APP_SOCKET_EVENTS.RIDE_UPDATED).toBe('ride:updated');
    expect(APP_SOCKET_EVENTS.RIDE_SEATS_CHANGED).toBe('ride:seats_changed');
    expect(APP_SOCKET_EVENTS.CHAT_MESSAGE).toBe('chat:message');
    expect(APP_SOCKET_EVENTS.CHAT_UNREAD).toBe('chat:unread');
    expect(APP_SOCKET_EVENTS.NOTIFICATION_NEW).toBe('notification:new');
  });

  it('should initialize EventsGateway and register server in EventsService', () => {
    expect(eventsGateway).toBeDefined();
    expect(eventsService).toBeDefined();
    expect(eventsService.getServer()).toBe(mockServer);
  });

  it('emitToUser should target user:{userId} room with the payload', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const payload = { bookingId: 'b-1', status: 'CONFIRMED' };

    eventsService.emitToUser(userId, APP_SOCKET_EVENTS.BOOKING_UPDATED, payload);

    expect(mockServer.to).toHaveBeenCalledWith(`user:${userId}`);
    expect(mockServer.emit).toHaveBeenCalledWith(APP_SOCKET_EVENTS.BOOKING_UPDATED, payload);
  });

  it('emitToRide should target ride:{rideId} room with updated seat info', () => {
    const rideId = '22222222-2222-2222-2222-222222222222';
    const payload = { rideId, availableSeats: 3 };

    eventsService.emitToRide(rideId, APP_SOCKET_EVENTS.RIDE_SEATS_CHANGED, payload);

    expect(mockServer.to).toHaveBeenCalledWith(`ride:${rideId}`);
    expect(mockServer.emit).toHaveBeenCalledWith(APP_SOCKET_EVENTS.RIDE_SEATS_CHANGED, payload);
  });

  it('emitToConversation should target conversation:{conversationId} room', () => {
    const convId = '33333333-3333-3333-3333-333333333333';
    const payload = { id: 'msg-1', content: 'Hey, I reached the pickup point' };

    eventsService.emitToConversation(convId, APP_SOCKET_EVENTS.CHAT_MESSAGE, payload);

    expect(mockServer.to).toHaveBeenCalledWith(`conversation:${convId}`);
    expect(mockServer.emit).toHaveBeenCalledWith(APP_SOCKET_EVENTS.CHAT_MESSAGE, payload);
  });

  it('emitToFeed should target rides_feed room for public real-time discovery', () => {
    const payload = { rideId: 'ride-new', origin: 'VIT Campus', destination: 'Central' };

    eventsService.emitToFeed(APP_SOCKET_EVENTS.RIDE_CREATED, payload);

    expect(mockServer.to).toHaveBeenCalledWith('rides_feed');
    expect(mockServer.emit).toHaveBeenCalledWith(APP_SOCKET_EVENTS.RIDE_CREATED, payload);
  });

  it('broadcast should emit to all connected clients', () => {
    const payload = { maintenance: false };

    eventsService.broadcast('system:status', payload);

    expect(mockServer.emit).toHaveBeenCalledWith('system:status', payload);
  });
});
