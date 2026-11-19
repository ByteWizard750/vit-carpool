import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext';
import { triggerAppSync } from '../../hooks/useDataSync';
import { APP_SOCKET_EVENTS } from '@vit-carpool/contracts';

interface EventsContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribeRide: (rideId: string) => void;
  unsubscribeRide: (rideId: string) => void;
  subscribeConversation: (conversationId: string) => void;
  unsubscribeConversation: (conversationId: string) => void;
  subscribeFeed: () => void;
  unsubscribeFeed: () => void;
}

const EventsContext = createContext<EventsContextType>({
  socket: null,
  isConnected: false,
  subscribeRide: () => {},
  unsubscribeRide: () => {},
  subscribeConversation: () => {},
  unsubscribeConversation: () => {},
  subscribeFeed: () => {},
  unsubscribeFeed: () => {},
});

export const useEvents = () => useContext(EventsContext);

export const EventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketUrl = window.location.origin;
    const socketInstance = io(`${socketUrl}/events`, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Automatically subscribe to the public rides feed for live seat/ride discovery
      socketInstance.emit('subscribe_feed');
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    // Real-time booking events -> instant app sync & custom event dispatch
    const handleBookingEvent = (payload: any) => {
      triggerAppSync();
      window.dispatchEvent(new CustomEvent('app:booking_event', { detail: payload }));
    };

    socketInstance.on(APP_SOCKET_EVENTS.BOOKING_CREATED, handleBookingEvent);
    socketInstance.on(APP_SOCKET_EVENTS.BOOKING_UPDATED, handleBookingEvent);
    socketInstance.on(APP_SOCKET_EVENTS.BOOKING_CANCELLED, handleBookingEvent);

    // Real-time ride events -> instant app sync & custom event dispatch
    const handleRideEvent = (payload: any) => {
      triggerAppSync();
      window.dispatchEvent(new CustomEvent('app:ride_event', { detail: payload }));
    };

    socketInstance.on(APP_SOCKET_EVENTS.RIDE_CREATED, handleRideEvent);
    socketInstance.on(APP_SOCKET_EVENTS.RIDE_UPDATED, handleRideEvent);
    socketInstance.on(APP_SOCKET_EVENTS.RIDE_SEATS_CHANGED, handleRideEvent);
    socketInstance.on(APP_SOCKET_EVENTS.RIDE_CANCELLED, handleRideEvent);
    socketInstance.on(APP_SOCKET_EVENTS.RIDE_COMPLETED, handleRideEvent);

    // Real-time chat messages & unread events
    socketInstance.on(APP_SOCKET_EVENTS.CHAT_MESSAGE, (payload: any) => {
      window.dispatchEvent(new CustomEvent('app:chat_message', { detail: payload }));
      window.dispatchEvent(new CustomEvent('app:chat_unread', { detail: payload }));
    });

    socketInstance.on(APP_SOCKET_EVENTS.CHAT_UNREAD, (payload: any) => {
      window.dispatchEvent(new CustomEvent('app:chat_unread', { detail: payload }));
    });

    // Real-time notifications
    socketInstance.on(APP_SOCKET_EVENTS.NOTIFICATION_NEW, (payload: any) => {
      triggerAppSync();
      window.dispatchEvent(new CustomEvent('app:notification_new', { detail: payload }));
    });

    return () => {
      socketInstance.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [token, user?.id]);

  const subscribeRide = useCallback((rideId: string) => {
    if (socketRef.current?.connected && rideId) {
      socketRef.current.emit('subscribe_ride', { rideId });
    }
  }, []);

  const unsubscribeRide = useCallback((rideId: string) => {
    if (socketRef.current?.connected && rideId) {
      socketRef.current.emit('unsubscribe_ride', { rideId });
    }
  }, []);

  const subscribeConversation = useCallback((conversationId: string) => {
    if (socketRef.current?.connected && conversationId) {
      socketRef.current.emit('subscribe_conversation', { conversationId });
    }
  }, []);

  const unsubscribeConversation = useCallback((conversationId: string) => {
    if (socketRef.current?.connected && conversationId) {
      socketRef.current.emit('unsubscribe_conversation', { conversationId });
    }
  }, []);

  const subscribeFeed = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_feed');
    }
  }, []);

  const unsubscribeFeed = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_feed');
    }
  }, []);

  return (
    <EventsContext.Provider
      value={{
        socket,
        isConnected,
        subscribeRide,
        unsubscribeRide,
        subscribeConversation,
        unsubscribeConversation,
        subscribeFeed,
        unsubscribeFeed,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
};
