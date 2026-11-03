import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../features/auth/AuthContext';
import { TrackingMap } from '../components/tracking/TrackingMap';
import {
  Car,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowLeft,
  Navigation,
  Shield,
  Smartphone,
  Compass,
  Gauge,
  X,
  Phone,
  MessageSquare,
  Home,
  KeyRound,
  Copy,
  RotateCw,
  Check,
} from 'lucide-react';
import { TrackingSessionStateDto, BoardingStatus } from '@vit-carpool/contracts';

// Helper to compute distance between two lat/lng coordinates in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const RideTrackingPage: React.FC = () => {
  const { id: rideId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [trackingState, setTrackingState] = useState<TrackingSessionStateDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Connection & GPS Status
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [isGpsActive, setIsGpsActive] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number | null>(null);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<Date | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // E2E testing helper hook to simulate GPS staleness deterministically
  useEffect(() => {
    (window as any).__testSetStale = () => {
      setLastSuccessfulUpdate(new Date(Date.now() - 45000));
    };
    return () => {
      delete (window as any).__testSetStale;
    };
  }, []);
  const [poorAccuracyWarning, setPoorAccuracyWarning] = useState<string | null>(null);

  // Wake Lock state
  const [wakeLockSupported, setWakeLockSupported] = useState<boolean>(true);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // Modals & Action Loaders
  const [showStartConsentModal, setShowStartConsentModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showBoardingPrompt, setShowBoardingPrompt] = useState(false);
  const [isMissedNoticeVisible, setIsMissedNoticeVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Milestone 8: Passenger Boarding OTP state
  const [passengerOtpData, setPassengerOtpData] = useState<any>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);
  const [regenCooldown, setRegenCooldown] = useState(0);

  // Milestone 8: Driver Verification Modal state
  const [selectedPassengerForOtp, setSelectedPassengerForOtp] = useState<any>(null);
  const [otpInput, setOtpInput] = useState('');
  const [otpVerifyError, setOtpVerifyError] = useState<string | null>(null);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpSuccessMessage, setOtpSuccessMessage] = useState<string | null>(null);

  // Milestone 8: Driver No-Show Modal state
  const [selectedPassengerForNoShow, setSelectedPassengerForNoShow] = useState<any>(null);
  const [noShowReason, setNoShowReason] = useState('');
  const [noShowLoading, setNoShowLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const isDriver = trackingState && user ? trackingState.driverId === user.id : false;

  // Periodic tick to evaluate client-side staleness (location > 30s old)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 4000);
    return () => clearInterval(timer);
  }, []);

  // Check Wake Lock support on mount
  useEffect(() => {
    if (!('wakeLock' in navigator)) {
      setWakeLockSupported(false);
    }
  }, []);

  // 1. Initial REST Fetch to populate initial state
  const fetchState = async () => {
    if (!rideId || !token) return;
    try {
      const res = await fetch(`/rides/${rideId}/tracking`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view live tracking for this ride.');
        }
        if (res.status === 404) {
          throw new Error('Ride not found.');
        }
        throw new Error(`Failed to load tracking data (${res.status})`);
      }

      const data: TrackingSessionStateDto = await res.json();
      setTrackingState(data);
      if (data.currentLocation?.recordedAt) {
        setLastSuccessfulUpdate(new Date(data.currentLocation.recordedAt));
      }
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize tracking');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [rideId, token]);

  // 2. WebSocket Connection and Event Handling
  useEffect(() => {
    if (!rideId || !token) return;

    const socketUrl = window.location.origin;
    const socket = io(`${socketUrl}/tracking`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('join_tracking', { rideId });
    });

    socket.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.on('reconnect', () => {
      setConnectionStatus('connected');
      socket.emit('join_tracking', { rideId });
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('tracking_state', (state: TrackingSessionStateDto) => {
      setTrackingState(state);
      if (state.currentLocation?.recordedAt) {
        setLastSuccessfulUpdate(new Date(state.currentLocation.recordedAt));
      }
    });

    socket.on('location_updated', (data: { location: any; passengerETAs: any }) => {
      setLastSuccessfulUpdate(new Date(data.location.recordedAt || Date.now()));
      setTrackingState((prev) => {
        if (!prev) return null;
        const updatedPassengers = prev.passengers.map((p) => {
          const eta = data.passengerETAs?.[p.passengerId];
          return eta
            ? { ...p, etaMinutes: eta.etaMinutes, distanceMeters: eta.distanceMeters }
            : p;
        });

        const myEta = user ? data.passengerETAs?.[user.id] : null;
        const updatedMyPickup = prev.myPickup && myEta
          ? { ...prev.myPickup, etaMinutes: myEta.etaMinutes, distanceMeters: myEta.distanceMeters }
          : prev.myPickup;

        return {
          ...prev,
          currentLocation: data.location,
          isStale: false,
          passengers: updatedPassengers,
          myPickup: updatedMyPickup,
        };
      });
    });

    socket.on('passenger_approaching', (data: { passengerId: string; etaMinutes: number }) => {
      if (user && data.passengerId === user.id) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🚗 Driver is Approaching', {
            body: `Your driver is ~${data.etaMinutes} min away. Head to your pickup point!`,
          });
        }
      }
    });

    socket.on('driver_stopped_near_pickup', (data: { passengerId: string }) => {
      if (user && data.passengerId === user.id) {
        setShowBoardingPrompt(true);
      }
    });

    socket.on('passenger_missed_pickup', (data: { passengerId: string }) => {
      if (user && data.passengerId === user.id) {
        setIsMissedNoticeVisible(true);
      }
    });

    socket.on('tracking_stale', (_data: { rideId: string; isStale: boolean; lastUpdateAt?: string }) => {
      setTrackingState((prev) => (prev ? { ...prev, isStale: true } : null));
    });

    socket.on('tracking_active', (data: { rideId: string; isStale: boolean; resumedAt?: string }) => {
      setTrackingState((prev) => (prev ? { ...prev, isStale: false } : null));
      if (data.resumedAt) {
        setLastSuccessfulUpdate(new Date(data.resumedAt));
      }
    });

    socket.on('boarding_updated', (data: { bookingId: string; passengerId: string; boardingStatus: BoardingStatus }) => {
      setTrackingState((prev) => {
        if (!prev) return null;
        const updatedPassengers = prev.passengers.map((p) =>
          p.bookingId === data.bookingId ? { ...p, boardingStatus: data.boardingStatus } : p,
        );

        const updatedMyPickup =
          prev.myPickup?.bookingId === data.bookingId
            ? { ...prev.myPickup, boardingStatus: data.boardingStatus }
            : prev.myPickup;

        return {
          ...prev,
          passengers: updatedPassengers,
          myPickup: updatedMyPickup,
        };
      });

      if (user && data.passengerId === user.id && data.boardingStatus === 'BOARDED') {
        setShowBoardingPrompt(false);
      }
    });

    socket.on('access_revoked', (data: { rideId: string; reason: string }) => {
      if (data.reason === 'RIDE_COMPLETED') {
        setTrackingState((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));
        stopDriverTracking();
      } else if (data.reason === 'RIDE_CANCELLED') {
        setTrackingState((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
        stopDriverTracking();
      }
    });

    socket.on('error', (err: any) => {
      if (err.code === 'FORBIDDEN') {
        setErrorMessage(err.message || 'Access denied to ride tracking.');
      }
    });

    // Fallback polling every 12s in case WebSocket drops
    const fallbackPoll = setInterval(() => {
      if (!socket.connected) {
        fetchState();
      }
    }, 12000);

    return () => {
      clearInterval(fallbackPoll);
      socket.emit('leave_tracking', { rideId });
      socket.disconnect();
    };
  }, [rideId, token, user?.id]);

  // 3. Screen Wake Lock Helper
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener('release', () => setWakeLockActive(false));
      } catch (err) {
        console.warn('Wake Lock request rejected:', err);
        setWakeLockActive(false);
      }
    } else {
      setWakeLockSupported(false);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Re-acquire wake lock if tab becomes visible again while tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        isDriver &&
        trackingState?.status === 'IN_PROGRESS' &&
        !wakeLockRef.current
      ) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDriver, trackingState?.status]);

  // Fetch passenger boarding OTP
  useEffect(() => {
    if (!token || !trackingState?.myPickup?.bookingId || isDriver) return;
    const fetchOtp = async () => {
      setOtpLoading(true);
      try {
        const res = await fetch(`/bookings/${trackingState.myPickup!.bookingId}/boarding-otp`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPassengerOtpData(data);
          if (data.cooldownSecondsRemaining > 0) {
            setRegenCooldown(data.cooldownSecondsRemaining);
          }
        }
      } catch (err) {
        console.error('Failed to fetch boarding OTP:', err);
      } finally {
        setOtpLoading(false);
      }
    };
    fetchOtp();
  }, [token, trackingState?.myPickup?.bookingId, isDriver]);

  // Cooldown countdown timer tick
  useEffect(() => {
    if (regenCooldown <= 0) return;
    const t = setInterval(() => {
      setRegenCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [regenCooldown]);

  // 4. Driver GPS Geolocation Collection
  const startDriverTracking = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    requestWakeLock();

    // Start watching position
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed, heading } = position.coords;

        // Coordinate range validation
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          console.warn('Invalid GPS coordinate bounds received:', latitude, longitude);
          return;
        }

        const roundedAccuracy = Math.round(accuracy);
        setGpsAccuracy(roundedAccuracy);
        setIsGpsActive(true);
        setGpsError(null);

        // Accuracy warning
        if (roundedAccuracy > 150) {
          setPoorAccuracyWarning(`GPS accuracy is low (±${roundedAccuracy}m). Move toward open sky or verify location mode.`);
        } else {
          setPoorAccuracyWarning(null);
        }

        // Ignore excessively inaccurate readings (> 500m)
        if (roundedAccuracy > 500) {
          return;
        }

        const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : null;
        const headingDeg = heading != null && !isNaN(heading) ? Math.round(heading) : null;

        setCurrentSpeedKmh(speedKmh);
        setCurrentHeading(headingDeg);

        // Adaptive update frequency:
        // Moving: ~5 seconds interval
        // Stationary: ~15 seconds interval
        // Suppress update if distance < 5m and time < 15s
        const now = Date.now();
        const last = lastLocationRef.current;
        const timeDiff = last ? now - last.time : Infinity;
        const distMoved = last ? getDistanceMeters(last.lat, last.lng, latitude, longitude) : Infinity;

        const isMoving = (speedKmh != null && speedKmh > 3) || distMoved > 8;
        const requiredInterval = isMoving ? 5000 : 15000;

        if (!last || timeDiff >= requiredInterval || distMoved >= 25) {
          sendLocationUpdate(latitude, longitude, roundedAccuracy, speedKmh, headingDeg);
          lastLocationRef.current = { lat: latitude, lng: longitude, time: now };
          setLastSuccessfulUpdate(new Date());
        }
      },
      (error) => {
        setIsGpsActive(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError('Location permission denied. Please allow location access in your browser settings to share your live route with passengers.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsError('GPS signal temporarily unavailable. Checking campus positioning...');
        } else if (error.code === error.TIMEOUT) {
          setGpsError('GPS positioning timed out. Retrying...');
        } else {
          setGpsError(`GPS signal weak or unavailable (${error.message}). Retrying...`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );

    watchIdRef.current = watchId;
  };

  const stopDriverTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
    setIsGpsActive(false);
  };

  const sendLocationUpdate = async (
    latitude: number,
    longitude: number,
    accuracy: number,
    speedKmh: number | null,
    heading: number | null,
  ) => {
    if (!rideId || !token) return;

    // WebSocket emission first
    if (socketRef.current?.connected) {
      socketRef.current.emit('location_update', {
        rideId,
        location: { latitude, longitude, accuracy, speedKmh, heading },
      });
    } else {
      // REST fallback bridge
      try {
        await fetch(`/rides/${rideId}/location-update`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ latitude, longitude, accuracy, speedKmh, heading }),
        });
      } catch (err) {
        console.error('REST location update failed:', err);
      }
    }
  };

  // Auto-start GPS if driver reloads page and ride is already IN_PROGRESS
  useEffect(() => {
    if (isDriver && trackingState?.status === 'IN_PROGRESS' && !isGpsActive && watchIdRef.current === null) {
      startDriverTracking();
    }

    return () => {
      stopDriverTracking();
    };
  }, [isDriver, trackingState?.status]);

  // 5. Driver Consent & Start Ride Flow
  const handleConfirmStartRide = async () => {
    if (!rideId || !token) return;

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser. Live tracking cannot be initiated.');
      return;
    }

    setActionLoading(true);
    setGpsError(null);

    // Request GPS position first to test permission before backend ride activation
    navigator.geolocation.getCurrentPosition(
      async (initialPos) => {
        try {
          const res = await fetch(`/rides/${rideId}/start`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          });

          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || 'Failed to start ride');
          }

          setShowStartConsentModal(false);
          await fetchState();

          // Begin continuous watching
          startDriverTracking();

          // Immediately send initial position
          const { latitude, longitude, accuracy, speed, heading } = initialPos.coords;
          const speedKmh = speed != null && speed >= 0 ? Math.round(speed * 3.6) : null;
          const headingDeg = heading != null && !isNaN(heading) ? Math.round(heading) : null;
          sendLocationUpdate(latitude, longitude, Math.round(accuracy), speedKmh, headingDeg);
        } catch (err: any) {
          alert(err.message || 'Error activating ride');
        } finally {
          setActionLoading(false);
        }
      },
      (geoError) => {
        setActionLoading(false);
        setShowStartConsentModal(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setGpsError('Location permission was denied. Live tracking requires location access. The ride was not started.');
        } else {
          setGpsError(`Unable to acquire GPS coordinates (${geoError.message}). The ride was not started.`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const handleCompleteRide = async () => {
    if (!rideId || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/rides/${rideId}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to complete ride');
      }

      stopDriverTracking();
      setShowCompleteModal(false);
      navigate('/my-rides');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRide = async () => {
    if (!rideId || !token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/rides/${rideId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to cancel ride');
      }

      stopDriverTracking();
      setShowCancelModal(false);
      navigate('/my-rides');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateOtp = async () => {
    if (!token || !trackingState?.myPickup?.bookingId || regenCooldown > 0) return;
    setOtpLoading(true);
    try {
      const res = await fetch(`/bookings/${trackingState.myPickup.bookingId}/boarding-otp/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPassengerOtpData(data);
        setRegenCooldown(60);
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to regenerate OTP');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async () => {
    if (!selectedPassengerForOtp || !token) return;
    const cleanOtp = otpInput.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanOtp)) {
      setOtpVerifyError('Boarding OTP must be exactly 6 digits.');
      return;
    }

    setOtpVerifyLoading(true);
    setOtpVerifyError(null);
    try {
      const res = await fetch(`/bookings/${selectedPassengerForOtp.bookingId}/verify-boarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ otp: cleanOtp }),
      });

      const body = await res.json();
      if (!res.ok) {
        setOtpVerifyError(body.message || 'Verification failed. Please check the OTP.');
        return;
      }

      // Success! Update local tracking state
      setTrackingState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          passengers: prev.passengers.map((p) =>
            p.bookingId === selectedPassengerForOtp.bookingId
              ? { ...p, boardingStatus: 'BOARDED' as BoardingStatus }
              : p,
          ),
        };
      });

      setOtpSuccessMessage(`✓ Verified! ${selectedPassengerForOtp.passengerName} is now marked as BOARDED.`);
      setTimeout(() => {
        setSelectedPassengerForOtp(null);
        setOtpInput('');
        setOtpSuccessMessage(null);
      }, 1000);
    } catch (err: any) {
      setOtpVerifyError(err.message || 'An error occurred during verification.');
    } finally {
      setOtpVerifyLoading(false);
    }
  };

  const handleMarkNoShowSubmit = async () => {
    if (!selectedPassengerForNoShow || !token) return;
    setNoShowLoading(true);
    try {
      const res = await fetch(`/bookings/${selectedPassengerForNoShow.bookingId}/mark-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: noShowReason || undefined }),
      });

      const body = await res.json();
      if (!res.ok) {
        alert(body.message || 'Failed to mark passenger as no-show.');
        return;
      }

      setTrackingState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          passengers: prev.passengers.map((p) =>
            p.bookingId === selectedPassengerForNoShow.bookingId
              ? { ...p, boardingStatus: 'MISSED' as BoardingStatus }
              : p,
          ),
        };
      });

      setSelectedPassengerForNoShow(null);
      setNoShowReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to mark passenger as no-show.');
    } finally {
      setNoShowLoading(false);
    }
  };

  const handleUpdateBoarding = async (bookingId: string, status: BoardingStatus) => {
    if (!rideId || !token) return;
    setActionLoading(true);

    // Optimistically update local tracking state
    setTrackingState((prev) => {
      if (!prev) return null;
      const updatedPassengers = prev.passengers.map((p) =>
        p.bookingId === bookingId ? { ...p, boardingStatus: status } : p,
      );
      const updatedMyPickup =
        prev.myPickup?.bookingId === bookingId
          ? { ...prev.myPickup, boardingStatus: status }
          : prev.myPickup;

      return {
        ...prev,
        passengers: updatedPassengers,
        myPickup: updatedMyPickup,
      };
    });

    try {
      const res = await fetch(`/rides/${rideId}/boarding`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId, boardingStatus: status }),
      });

      if (!res.ok) {
        console.warn('Boarding REST update returned status', res.status);
      }

      if (socketRef.current?.connected) {
        socketRef.current.emit('boarding_update', {
          rideId,
          bookingId,
          boardingStatus: status,
        });
      }

      if (status === 'BOARDED') {
        setShowBoardingPrompt(false);
      }
    } catch (err: any) {
      console.error('Failed to update boarding status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Format stale elapsed time string for requirements ("Last known location — updated X minutes ago.")
  const formatStaleElapsed = (date: Date | null): string => {
    if (!date) return '1 minute ago';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const minutes = Math.max(1, Math.floor(elapsedSeconds / 60));
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  };

  const isLocationStale = Boolean(
    trackingState?.isStale ||
      (lastSuccessfulUpdate && now - lastSuccessfulUpdate.getTime() > 30000)
  );

  // Determine overall tracking status text and theme
  const getOverallTrackingStatus = () => {
    if (trackingState?.status === 'COMPLETED') {
      return { text: 'Ride Completed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e', pulse: false };
    }
    if (trackingState?.status === 'CANCELLED') {
      return { text: 'Ride Cancelled', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', pulse: false };
    }
    if (connectionStatus === 'reconnecting') {
      return { text: 'Reconnecting', color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b', pulse: true };
    }
    if (gpsError || (!isGpsActive && trackingState?.status === 'IN_PROGRESS' && isDriver)) {
      return { text: 'Location Temporarily Unavailable', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', pulse: false };
    }
    if (isLocationStale && trackingState?.status === 'IN_PROGRESS') {
      return { text: 'Tracking Stale', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', dot: '#f97316', pulse: false };
    }
    if (trackingState?.status === 'IN_PROGRESS') {
      return { text: 'Tracking Active', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0', dot: '#10b981', pulse: true };
    }
    return { text: 'Scheduled Ride', color: '#475569', bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', pulse: false };
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '1000px', margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: '14px', color: '#64748b', fontSize: '14px' }}>Connecting to live campus tracking channel...</p>
      </div>
    );
  }

  if (errorMessage || !trackingState) {
    return (
      <div style={{ maxWidth: '600px', margin: '60px auto', padding: '24px', background: 'white', borderRadius: '12px', border: '1px solid #fee2e2', textAlign: 'center' }}>
        <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Tracking Unavailable</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>{errorMessage || 'Unable to access live tracking.'}</p>
        <Link to="/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> Return to Bookings
        </Link>
      </div>
    );
  }

  const { origin, destination, vehicle, driverName, currentLocation, passengers, myPickup, status } = trackingState;
  const statusInfo = getOverallTrackingStatus();

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px 16px 60px' }}>
      {/* Back navigation */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <Link
          to={isDriver ? '/my-rides' : '/bookings'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}
        >
          <ArrowLeft size={16} /> {isDriver ? 'Back to My Rides' : 'Back to Bookings'}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/dashboard"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}
          >
            Dashboard
          </Link>
          <Link
            to="/"
            id="tracking-nav-home"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }}
          >
            <Home size={15} /> Home
          </Link>
        </div>
      </div>

      {/* Top Banner / Route Summary */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{origin}</span>
            <span style={{ color: '#94a3b8' }}>→</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{destination}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#64748b', flexWrap: 'wrap' }}>
            {vehicle && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Car size={14} color="#64748b" /> {vehicle.make} {vehicle.model} ({vehicle.color})
                {vehicle.registrationNumber && (
                  <strong style={{ color: '#0f172a', marginLeft: '4px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                    {vehicle.registrationNumber}
                  </strong>
                )}
              </span>
            )}
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {trackingState.driverAvatarUrl ? (
                <img
                  src={trackingState.driverAvatarUrl}
                  alt={driverName}
                  style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : null}
              <span>Driver: <strong>{driverName}</strong></span>
            </span>
            {lastSuccessfulUpdate && (
              <>
                <span>•</span>
                <span style={{ color: '#94a3b8' }}>
                  Last updated {lastSuccessfulUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            id="tracking-status-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: statusInfo.bg,
              color: statusInfo.color,
              border: `1px solid ${statusInfo.border}`,
              borderRadius: '20px',
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: statusInfo.dot,
                animation: statusInfo.pulse ? 'map-pulse 1.5s infinite' : 'none',
              }}
            />
            {statusInfo.text}
          </div>
        </div>
      </div>

      {/* Screen Wake Lock Fallback Warning Banner if Unsupported */}
      {isDriver && !wakeLockSupported && status === 'IN_PROGRESS' && (
        <div
          id="wake-lock-unsupported-banner"
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#b45309',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Smartphone size={16} />
          <span>Keep VIT Carpool open and your screen awake during this ride. Location sharing may pause if your browser is suspended.</span>
        </div>
      )}

      {/* Driver Controls / Start Banner (Driver only) */}
      {isDriver && status === 'SCHEDULED' && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#166534', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} color="#16a34a" /> Ready to Start Your Ride?
          </h3>
          <p style={{ fontSize: '14px', color: '#15803d', marginBottom: '16px', lineHeight: 1.5 }}>
            Your live location will be shared with passengers who have confirmed bookings for this ride. Keep this browser tab open while driving.
          </p>
          <button
            id="btn-start-ride"
            onClick={() => setShowStartConsentModal(true)}
            disabled={actionLoading}
            style={{
              background: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 22px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(22,163,74,0.3)',
            }}
          >
            <Radio size={16} /> START RIDE
          </button>
        </div>
      )}

      {/* GPS Active HUD for Driver (Large touch targets, uncluttered for safety) */}
      {isDriver && status === 'IN_PROGRESS' && (
        <div
          id="driver-active-hud"
          style={{
            background: isLocationStale ? '#fff7ed' : '#eff6ff',
            border: isLocationStale ? '1.5px solid #fed7aa' : '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isLocationStale ? '#f97316' : '#2563eb',
                  animation: isLocationStale ? 'none' : 'map-pulse 1.5s infinite',
                }}
              />
              <strong style={{ fontSize: '15px', color: isLocationStale ? '#c2410c' : '#1e40af' }}>
                {isLocationStale ? 'GPS Broadcast Signal Stale' : 'Live GPS Broadcasting Active'}
              </strong>
              {gpsAccuracy && (
                <span style={{ fontSize: '12px', color: isLocationStale ? '#ea580c' : '#3b82f6' }}>
                  (±{gpsAccuracy}m accuracy)
                </span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginTop: '6px',
                fontSize: '13px',
                color: isLocationStale ? '#9a3412' : '#3b82f6',
                flexWrap: 'wrap',
              }}
            >
              {isLocationStale ? (
                <span>
                  No confirmed GPS updates received by server in {formatStaleElapsed(lastSuccessfulUpdate)}. Keep browser in foreground.
                </span>
              ) : (
                <>
                  {currentSpeedKmh !== null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Gauge size={14} /> {currentSpeedKmh} km/h
                    </span>
                  )}
                  {currentHeading !== null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Compass size={14} /> {currentHeading}°
                    </span>
                  )}
                  <span>
                    {wakeLockActive ? '✓ Screen wake lock active' : 'Keep browser open'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Prominent End Ride Control */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              id="btn-complete-ride-hud"
              onClick={() => setShowCompleteModal(true)}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(220,38,38,0.3)',
                minHeight: '44px',
              }}
            >
              <CheckCircle2 size={16} /> End Ride
            </button>
            <button
              id="btn-cancel-ride-hud"
              onClick={() => setShowCancelModal(true)}
              style={{
                background: 'white',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* GPS Error Banner */}
      {gpsError && (
        <div
          id="gps-error-banner"
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#e11d48',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} /> {gpsError}
        </div>
      )}

      {/* Poor Accuracy Warning Banner */}
      {poorAccuracyWarning && (
        <div
          id="gps-accuracy-warning-banner"
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#b45309',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} /> {poorAccuracyWarning}
        </div>
      )}

      {/* Stale Signal Notice */}
      {statusInfo.text === 'Tracking Stale' && (
        <div
          id="stale-signal-banner"
          style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: '8px',
            padding: '12px 16px',
            color: '#c2410c',
            fontSize: '13px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertTriangle size={16} color="#ea580c" />
          <span>Last known location — updated {formatStaleElapsed(lastSuccessfulUpdate)}.</span>
        </div>
      )}

      {/* Driver Moving Safety Warning */}
      {isDriver && currentSpeedKmh != null && currentSpeedKmh > 15 && (
        <div
          id="driver-safety-motion-banner"
          style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Shield size={16} color="#0284c7" />
          <span>⚠️ Vehicle in motion ({currentSpeedKmh} km/h). Please focus on driving; confirm passenger boarding only when safely stopped.</span>
        </div>
      )}

      {/* Passenger Approaching Banner */}
      {!isDriver && myPickup && myPickup.etaMinutes != null && myPickup.etaMinutes <= 5 && myPickup.boardingStatus === 'WAITING' && (
        <div
          id="passenger-approaching-banner"
          style={{
            background: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Radio size={24} color="#d97706" style={{ animation: 'map-pulse 1s infinite' }} />
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>
              Your driver is approximately {myPickup.etaMinutes} minute{myPickup.etaMinutes !== 1 ? 's' : ''} away.
            </h4>
            <p style={{ fontSize: '13px', color: '#b45309', margin: 0 }}>
              Please get ready at <strong>{myPickup.pickupAddress || myPickup.pickupDescription || origin}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Milestone 8: Passenger Boarding OTP Card */}
      {!isDriver && myPickup && (
        <div
          id="passenger-boarding-otp-card"
          style={{
            background: myPickup.boardingStatus === 'BOARDED' ? '#f0fdf4' : '#eff6ff',
            border: `2px solid ${myPickup.boardingStatus === 'BOARDED' ? '#86efac' : '#93c5fd'}`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          {myPickup.boardingStatus === 'BOARDED' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: '#22c55e',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Check size={26} strokeWidth={3} />
              </div>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#15803d', margin: '0 0 3px 0' }}>
                  ✓ Boarding Verified
                </h4>
                <p style={{ fontSize: '13px', color: '#166534', margin: 0 }}>
                  Driver has verified your boarding OTP. You are safely onboard and en route!
                </p>
              </div>
            </div>
          ) : (
            <div>
              {showBoardingPrompt && (
                <div
                  id="driver-arrived-banner"
                  style={{
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    marginBottom: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#92400e',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  <Radio size={16} color="#d97706" />
                  <span>Driver has arrived near your pickup point! Please board and share your OTP.</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <KeyRound size={20} color="#2563eb" />
                  <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a8a', margin: 0 }}>
                    Your Boarding OTP
                  </h4>
                </div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                  Pickup: <strong>{myPickup.pickupAddress || myPickup.pickupDescription || origin}</strong>
                </span>
              </div>

              <p style={{ fontSize: '13px', color: '#3b82f6', margin: '0 0 14px 0' }}>
                Show this 6-digit code to your driver upon entering the vehicle. Only after verification will your seat be confirmed as boarded.
              </p>

              {otpLoading && !passengerOtpData ? (
                <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                  Loading secure boarding OTP...
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Large formatted OTP box */}
                  <div
                    id="passenger-otp-display"
                    style={{
                      background: 'white',
                      border: '2px dashed #2563eb',
                      borderRadius: '10px',
                      padding: '10px 24px',
                      fontSize: '28px',
                      fontWeight: 800,
                      letterSpacing: '6px',
                      color: '#1d4ed8',
                      fontFamily: 'monospace',
                    }}
                  >
                    {passengerOtpData?.otp || '••••••'}
                  </div>

                  <button
                    id="btn-copy-otp"
                    onClick={() => {
                      if (passengerOtpData?.rawOtp) {
                        navigator.clipboard.writeText(passengerOtpData.rawOtp);
                        setOtpCopied(true);
                        setTimeout(() => setOtpCopied(false), 2000);
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    {otpCopied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                    {otpCopied ? 'Copied!' : 'Copy Code'}
                  </button>

                  <button
                    id="btn-regenerate-otp"
                    onClick={handleRegenerateOtp}
                    disabled={otpLoading || regenCooldown > 0 || (passengerOtpData && passengerOtpData.regenCountRemaining <= 0)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'transparent',
                      border: '1px solid #94a3b8',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: regenCooldown > 0 ? '#94a3b8' : '#475569',
                      cursor: regenCooldown > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <RotateCw size={15} className={otpLoading ? 'spin' : ''} />
                    {regenCooldown > 0 ? `Regenerate in ${regenCooldown}s` : 'Regenerate Code'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Missed Pickup Alert Banner */}
      {!isDriver && myPickup && (myPickup.boardingStatus === 'MISSED' || isMissedNoticeVisible) && (
        <div
          id="passenger-missed-pickup-banner"
          style={{
            background: '#fef2f2',
            border: '2px solid #ef4444',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={24} color="#dc2626" />
            <div>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#991b1b', marginBottom: '2px' }}>
                Missed Pickup Point
              </h4>
              <p style={{ fontSize: '13px', color: '#b91c1c', margin: 0 }}>
                Your driver appears to have passed your pickup point. If you were not able to board, you can message the driver or review your trip.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="btn-message-driver-missed"
              onClick={() => navigate(`/messages?bookingId=${myPickup.bookingId}`)}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MessageSquare size={14} /> Message Driver
            </button>
            {myPickup.boardingStatus !== 'MISSED' && (
              <button
                id="btn-mark-as-missed"
                onClick={() => handleUpdateBoarding(myPickup.bookingId, 'MISSED')}
                disabled={actionLoading}
                style={{
                  background: 'white',
                  color: '#991b1b',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark as Missed
              </button>
            )}
          </div>
        </div>
      )}

      {/* Passenger Information Card (!isDriver) */}
      {!isDriver && (
        <div
          id="passenger-information-card"
          style={{
            background: 'white',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '18px 20px',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '12px',
              borderBottom: '1px solid #f1f5f9',
              paddingBottom: '14px',
              marginBottom: '14px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {trackingState.driverAvatarUrl ? (
                  <img
                    src={trackingState.driverAvatarUrl}
                    alt={driverName}
                    style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #cbd5e1', flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      backgroundColor: '#dbeafe',
                      color: '#1d4ed8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '16px',
                      flexShrink: 0,
                    }}
                  >
                    {driverName.charAt(0)}
                  </div>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Your Ride Driver
                    </span>
                  </div>
                  <h3 id="passenger-card-driver-name" style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    {driverName}
                  </h3>
                </div>
              </div>
              {vehicle && (
                <div style={{ marginTop: '4px' }}>
                  <div id="passenger-card-vehicle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', flexWrap: 'wrap' }}>
                    <Car size={15} color="#64748b" />
                    <span>{vehicle.make} {vehicle.model} • {vehicle.color}</span>
                    {vehicle.registrationNumber && (
                      <strong style={{ background: '#f1f5f9', color: '#0f172a', padding: '2px 6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                        {vehicle.registrationNumber}
                      </strong>
                    )}
                  </div>
                  {vehicle.imageUrl && (
                    <div
                      id="tracking-vehicle-appearance-card"
                      style={{
                        marginTop: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <img
                        src={vehicle.imageUrl}
                        alt="Vehicle appearance"
                        style={{ width: '56px', height: '42px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid #cbd5e1' }}
                      />
                      <div style={{ fontSize: '12px', minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          Vehicle Appearance &bull; Look for this car
                        </span>
                        <span style={{ color: '#64748b', fontSize: '11px' }}>
                          {vehicle.color} {vehicle.make} {vehicle.model}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message Driver Action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                to={myPickup?.bookingId ? `/messages?bookingId=${myPickup.bookingId}` : '/messages'}
                id="btn-message-driver"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: '#2563eb',
                  color: 'white',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
                  minHeight: '40px',
                }}
              >
                <MessageSquare size={16} />
                Message Driver
              </Link>
            </div>
          </div>

          {/* Details Grid: Pickup Point, Estimated Arrival, Tracking Status, Last Update */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
            }}
          >
            {/* Pickup Point */}
            <div id="passenger-card-pickup" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Designated Pickup Point
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Navigation size={14} color="#059669" />
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                  {myPickup?.pickupAddress || myPickup?.pickupDescription || origin}
                </strong>
              </div>
            </div>

            {/* Estimated Arrival Placeholder */}
            <div id="passenger-card-eta" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Estimated Arrival
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Clock size={14} color="#2563eb" />
                <span style={{ fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>
                  {myPickup?.boardingStatus === 'BOARDED'
                    ? '✓ Onboard vehicle'
                    : myPickup?.etaMinutes != null
                    ? `Arriving in approximately ${myPickup.etaMinutes} minute${myPickup.etaMinutes !== 1 ? 's' : ''}.`
                    : status === 'IN_PROGRESS'
                    ? 'Calculating live arrival estimate...'
                    : 'Awaiting ride departure'}
                </span>
                {myPickup?.distanceMeters != null && myPickup.boardingStatus !== 'BOARDED' && (
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    (~{(myPickup.distanceMeters / 1000).toFixed(1)} km)
                  </span>
                )}
                {myPickup?.isApproximate && myPickup.boardingStatus !== 'BOARDED' && (
                  <span
                    id="passenger-eta-approximate-badge"
                    style={{
                      fontSize: '10px',
                      color: '#b45309',
                      background: '#fef3c7',
                      border: '1px solid #fde68a',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}
                  >
                    Approximate
                  </span>
                )}
              </div>
            </div>

            {/* Tracking Status */}
            <div id="passenger-card-status" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Tracking Status
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: statusInfo.color }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: statusInfo.dot,
                    animation: statusInfo.pulse ? 'map-pulse 1.5s infinite' : 'none',
                  }}
                />
                {statusInfo.text}
              </div>
            </div>

            {/* Last Update Timestamp */}
            <div id="passenger-card-last-update" style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Last Update
              </span>
              <span style={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                {lastSuccessfulUpdate
                  ? lastSuccessfulUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'Awaiting signal'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Leaflet Map */}
      <div style={{ marginBottom: '20px' }}>
        <TrackingMap
          driverLocation={
            currentLocation
              ? {
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                  heading: currentLocation.heading,
                  accuracy: currentLocation.accuracy,
                  speedKmh: currentSpeedKmh ?? currentLocation.speedKmh,
                }
              : null
          }
          origin={{
            latitude: trackingState.originLatitude,
            longitude: trackingState.originLongitude,
            label: trackingState.origin,
          }}
          destination={{
            latitude: trackingState.destinationLatitude,
            longitude: trackingState.destinationLongitude,
            label: trackingState.destination,
          }}
          myPickup={
            myPickup
              ? {
                  latitude: myPickup.pickupLatitude,
                  longitude: myPickup.pickupLongitude,
                  label: myPickup.pickupAddress || myPickup.pickupDescription,
                }
              : null
          }
          otherPickups={
            isDriver
              ? trackingState.passengers
                  .filter((p) => p.pickupLatitude && p.pickupLongitude)
                  .map((p) => ({
                    latitude: p.pickupLatitude!,
                    longitude: p.pickupLongitude!,
                    label: p.passengerName || p.pickupAddress || 'Stop',
                    boardingStatus: p.boardingStatus || 'WAITING',
                  }))
              : []
          }
          isStale={isLocationStale}
        />
      </div>

      {/* Passenger Boarding Roster & Pickup Details */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Passenger Roster Card */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation size={16} color="#2563eb" /> Confirmed Passengers ({passengers.length})
            </h3>
            {passengers.length > 0 && (
              <span
                id="driver-boarding-progress-pill"
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  background: passengers.every((p) => p.boardingStatus === 'BOARDED') ? '#dcfce7' : '#eff6ff',
                  color: passengers.every((p) => p.boardingStatus === 'BOARDED') ? '#15803d' : '#1d4ed8',
                }}
              >
                Boarding: {passengers.filter((p) => p.boardingStatus === 'BOARDED').length} / {passengers.length} Verified
              </span>
            )}
          </div>

          {passengers.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#64748b' }}>No confirmed passengers on this trip yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[...passengers]
                .sort((a, b) => {
                  if (a.boardingStatus === 'BOARDED' && b.boardingStatus !== 'BOARDED') return 1;
                  if (a.boardingStatus !== 'BOARDED' && b.boardingStatus === 'BOARDED') return -1;
                  const etaA = a.etaMinutes ?? 999;
                  const etaB = b.etaMinutes ?? 999;
                  return etaA - etaB;
                })
                .map((p, idx) => {
                  const isMe = user && p.passengerId === user.id;
                  const isUnboarded = p.boardingStatus !== 'BOARDED';

                  return (
                    <div
                      key={p.bookingId}
                      className="passenger-roster-item"
                      style={{
                        padding: '12px',
                        background: isMe ? '#f0f9ff' : '#f8fafc',
                        borderRadius: '8px',
                        border: isMe ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {p.passengerAvatarUrl ? (
                            <img
                              src={p.passengerAvatarUrl}
                              alt={p.passengerName}
                              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #cbd5e1', flexShrink: 0 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: isMe ? '#dbeafe' : '#e2e8f0',
                                color: isMe ? '#1d4ed8' : '#475569',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '12px',
                                flexShrink: 0,
                              }}
                            >
                              {p.passengerName.charAt(0)}
                            </div>
                          )}
                          {isDriver && isUnboarded && (
                            <span
                              className="pickup-stop-badge"
                              style={{
                                background: '#dbeafe',
                                color: '#1e40af',
                                border: '1px solid #bfdbfe',
                                borderRadius: '12px',
                                padding: '1px 7px',
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              Stop {idx + 1}
                            </span>
                          )}
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                            {p.passengerName} {isMe && '(You)'}
                          </strong>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            textTransform: 'uppercase',
                            background:
                              p.boardingStatus === 'BOARDED'
                                ? '#dcfce7'
                                : p.boardingStatus === 'BOARDING'
                                ? '#fef3c7'
                                : p.boardingStatus === 'MISSED'
                                ? '#fee2e2'
                                : '#f1f5f9',
                            color:
                              p.boardingStatus === 'BOARDED'
                                ? '#15803d'
                                : p.boardingStatus === 'BOARDING'
                                ? '#b45309'
                                : p.boardingStatus === 'MISSED'
                                ? '#991b1b'
                                : '#475569',
                          }}
                        >
                          {p.boardingStatus}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                        Pickup: <strong>{p.pickupAddress || p.pickupDescription || origin}</strong>
                      </div>

                      {/* Individual Passenger ETA & Distance */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1e40af', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <Clock size={13} color="#2563eb" />
                        <span>
                          {p.boardingStatus === 'BOARDED'
                            ? 'Onboard'
                            : p.etaMinutes != null
                            ? `Arriving in approximately ${p.etaMinutes} min${p.etaMinutes !== 1 ? 's' : ''}`
                            : status === 'IN_PROGRESS'
                            ? 'Calculating ETA...'
                            : 'Awaiting departure'}
                        </span>
                        {p.distanceMeters != null && p.boardingStatus !== 'BOARDED' && (
                          <span style={{ color: '#64748b' }}>
                            (~{(p.distanceMeters / 1000).toFixed(1)} km)
                          </span>
                        )}
                        {p.isApproximate && p.boardingStatus !== 'BOARDED' && (
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '1px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            Approximate
                          </span>
                        )}
                      </div>

                    {/* Boarding Status Controls */}
                    {status === 'IN_PROGRESS' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {isDriver && p.boardingStatus !== 'BOARDED' && (
                          <button
                            id={`btn-verify-otp-${p.bookingId}`}
                            onClick={() => {
                              setSelectedPassengerForOtp(p);
                              setOtpInput('');
                              setOtpVerifyError(null);
                              setOtpSuccessMessage(null);
                            }}
                            disabled={actionLoading}
                            style={{
                              background: '#2563eb',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'white',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 1px 3px rgba(37, 99, 235, 0.25)',
                            }}
                          >
                            <KeyRound size={14} /> Verify OTP
                          </button>
                        )}
                        {isDriver && p.boardingStatus !== 'BOARDED' && p.boardingStatus !== 'MISSED' && (
                          <button
                            id={`btn-mark-noshow-${p.bookingId}`}
                            onClick={() => {
                              setSelectedPassengerForNoShow(p);
                              setNoShowReason('');
                            }}
                            disabled={actionLoading}
                            style={{
                              background: '#fee2e2',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#991b1b',
                              cursor: 'pointer',
                            }}
                          >
                            ✕ No-Show
                          </button>
                        )}
                        {p.boardingStatus === 'BOARDED' && (
                          <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> Boarded
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Safety & Corridor Guidelines Card */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} color="#16a34a" /> Campus Safety & Privacy
          </h3>
          <ul style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, paddingLeft: '18px', margin: 0 }}>
            <li>Location coordinates are only broadcast while the ride is actively <strong>IN_PROGRESS</strong>.</li>
            <li>GPS tracking stops immediately when the driver completes or cancels the ride.</li>
            <li>Vehicle registration plate is revealed only to confirmed passengers on this specific ride.</li>
            <li>Temporary snapshots are continuously pruned to maintain passenger privacy.</li>
            <li>Institutional cohort boundaries are strictly preserved.</li>
          </ul>

          <div style={{ marginTop: '20px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
              Campus Security Helpline
            </span>
            <span style={{ fontSize: '13px', color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={14} /> 044-3993-1555 (VIT Chennai Control Room)
            </span>
          </div>
        </div>
      </div>

      {/* START RIDE CONSENT MODAL (Driver Only) */}
      {showStartConsentModal && (
        <div
          id="start-consent-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={20} color="#16a34a" /> Start Ride & Share Location
              </h3>
              <button
                onClick={() => setShowStartConsentModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', color: '#166534', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                “Your live location will be shared with passengers who have confirmed bookings for this ride.”
              </p>
            </div>

            <ul style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, paddingLeft: '18px', marginBottom: '24px' }}>
              <li>Your browser will ask for Geolocation permission.</li>
              <li>Location updates will pause if permission is revoked or browser is closed.</li>
              <li>Screen wake lock will keep your display awake while driving.</li>
            </ul>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowStartConsentModal(false)}
                disabled={actionLoading}
                style={{
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="btn-confirm-start-ride"
                onClick={handleConfirmStartRide}
                disabled={actionLoading}
                style={{
                  background: '#16a34a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {actionLoading ? 'Activating...' : 'Confirm & Start Ride'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE RIDE MODAL */}
      {showCompleteModal && (
        <div
          id="complete-ride-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              End Ride & Complete Tracking?
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to end this ride? GPS broadcasting will stop immediately, screen wake lock will be released, and all confirmed passengers will be notified of arrival.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowCompleteModal(false)}
                disabled={actionLoading}
                style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                Continue Driving
              </button>
              <button
                id="btn-confirm-complete-ride"
                onClick={handleCompleteRide}
                disabled={actionLoading}
                style={{ background: '#dc2626', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: 'white', cursor: 'pointer' }}
              >
                {actionLoading ? 'Ending Ride...' : 'Yes, Complete Ride'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL RIDE MODAL */}
      {showCancelModal && (
        <div
          id="cancel-ride-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c', marginBottom: '8px' }}>
              Cancel Active Ride?
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, marginBottom: '20px' }}>
              Cancelling will immediately terminate the ride, stop GPS tracking, and notify all passengers that the trip was cancelled.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={actionLoading}
                style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
              >
                Keep Active
              </button>
              <button
                id="btn-confirm-cancel-ride"
                onClick={handleCancelRide}
                disabled={actionLoading}
                style={{ background: '#b91c1c', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, color: 'white', cursor: 'pointer' }}
              >
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Milestone 8: VERIFY BOARDING OTP MODAL */}
      {selectedPassengerForOtp && (
        <div
          id="verify-boarding-otp-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Verify Passenger Boarding
                </h3>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Passenger: <strong>{selectedPassengerForOtp.passengerName}</strong>
                </span>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                marginBottom: '18px',
                fontSize: '13px',
                color: '#475569',
              }}
            >
              Pickup: <strong>{selectedPassengerForOtp.pickupAddress || selectedPassengerForOtp.pickupDescription || 'Campus corridor'}</strong>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5, marginBottom: '16px' }}>
              Enter the 6-digit code shown on {selectedPassengerForOtp.passengerName}’s device. Each passenger has a unique, secure boarding OTP.
            </p>

            {otpVerifyError && (
              <div
                id="otp-verify-error"
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#b91c1c',
                  fontSize: '13px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{otpVerifyError}</span>
              </div>
            )}

            {otpSuccessMessage && (
              <div
                id="otp-verify-success"
                style={{
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#065f46',
                  fontSize: '13px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Check size={16} />
                <span>{otpSuccessMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyOtpSubmit();
              }}
            >
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="input-boarding-otp"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#475569',
                    marginBottom: '6px',
                    letterSpacing: '0.5px',
                  }}
                >
                  6-Digit Boarding Code
                </label>
                <input
                  id="input-boarding-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="e.g. 482916"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '22px',
                    fontWeight: 700,
                    letterSpacing: '6px',
                    textAlign: 'center',
                    border: '2px solid #cbd5e1',
                    borderRadius: '10px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    color: '#0f172a',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  id="btn-cancel-verify-otp"
                  onClick={() => {
                    setSelectedPassengerForOtp(null);
                    setOtpInput('');
                    setOtpVerifyError(null);
                  }}
                  disabled={otpVerifyLoading}
                  style={{
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '10px 18px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-submit-verify-otp"
                  disabled={otpVerifyLoading || otpInput.trim().length === 0}
                  style={{
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 22px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'white',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {otpVerifyLoading ? 'Verifying...' : 'Verify Boarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Milestone 8: MARK NO-SHOW MODAL */}
      {selectedPassengerForNoShow && (
        <div
          id="mark-noshow-modal"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#b91c1c', marginBottom: '8px' }}>
              Mark {selectedPassengerForNoShow.passengerName} as No-Show?
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, marginBottom: '16px' }}>
              This records that the passenger was not physically present at the designated pickup point. The passenger will be notified immediately.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="input-noshow-reason"
                style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}
              >
                Reason (optional)
              </label>
              <input
                id="input-noshow-reason"
                type="text"
                placeholder="e.g. Passenger not present after 10-minute wait"
                value={noShowReason}
                onChange={(e) => setNoShowReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                id="btn-cancel-noshow"
                onClick={() => setSelectedPassengerForNoShow(null)}
                disabled={noShowLoading}
                style={{
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                type="button"
                id="btn-confirm-noshow"
                onClick={handleMarkNoShowSubmit}
                disabled={noShowLoading}
                style={{
                  background: '#b91c1c',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {noShowLoading ? 'Marking...' : 'Confirm No-Show'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
