import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Calendar,
  Ticket,
  ShieldCheck,
  Search,
  PlusCircle,
  RefreshCw,
  Bell,
  Radio,
  Navigation,
  Clock,
  CheckCircle2,
  AlertCircle,
  Check,
  X,
  MessageSquare,
  Home,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { RouteSpine } from '../components/common/RouteSpine';
import { PageShell } from '../components/layout/PageShell';
import { useAuth } from '../features/auth/AuthContext';
import {
  PassengerBookingResponseDto,
  DriverRideResponseDto,
  VehicleResponseDto,
  DriverBookingResponseDto,
} from '@vit-carpool/contracts';
import {
  registerServiceWorker,
  getExistingPushSubscription,
  requestAndSubscribePush,
} from '../features/notifications/webPush';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);

    const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

    if (diffMins < 0 && diffMins > -120) {
      return `Started ${Math.abs(diffMins)}m ago`;
    }
    if (diffMins >= 0 && diffMins < 60) {
      return `In ${diffMins} min${diffMins === 1 ? '' : 's'} (${timeStr})`;
    }
    if (diffHours >= 1 && diffHours < 24) {
      return `In ${diffHours} hr${diffHours === 1 ? '' : 's'} (${timeStr})`;
    }
    if (diffDays === 1) {
      return `Tomorrow at ${timeStr}`;
    }
    return `${dateStr} at ${timeStr}`;
  } catch {
    return dateString;
  }
}

export const DashboardPage: React.FC = () => {
  const { user, token } = useAuth();

  const [bookings, setBookings] = useState<PassengerBookingResponseDto[]>([]);
  const [rides, setRides] = useState<DriverRideResponseDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [pendingDriverBookings, setPendingDriverBookings] = useState<DriverBookingResponseDto[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Web Push status
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [pushLoading, setPushLoading] = useState<boolean>(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  // Action status message
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [bookingsRes, ridesRes, vehiclesRes, notifsRes, alertsRes, pendingRes] = await Promise.all([
        fetch('/bookings/mine', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : [])),
        fetch('/rides/mine', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : [])),
        fetch('/vehicles', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : [])),
        fetch('/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : { unreadCount: 0 })),
        fetch('/ride-alerts', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : [])),
        fetch('/bookings/driver?status=PENDING', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }).then((r) => (r.ok ? r.json() : [])),
      ]);

      setBookings(Array.isArray(bookingsRes) ? bookingsRes : bookingsRes?.bookings || []);
      setRides(Array.isArray(ridesRes) ? ridesRes : []);
      setVehicles(Array.isArray(vehiclesRes) ? vehiclesRes : []);
      setUnreadNotifCount(
        typeof notifsRes?.unreadCount === 'number'
          ? notifsRes.unreadCount
          : typeof notifsRes?.count === 'number'
          ? notifsRes.count
          : 0,
      );
      setAlertsCount(Array.isArray(alertsRes) ? alertsRes.length : 0);
      setPendingDriverBookings(Array.isArray(pendingRes) ? pendingRes : []);
    } catch (err) {
      console.warn('Dashboard data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Check Web Push subscription on mount
  useEffect(() => {
    const checkPush = async () => {
      try {
        await registerServiceWorker();
        const sub = await getExistingPushSubscription();
        if (sub && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          setPushEnabled(true);
        }
      } catch {
        // Ignore push check errors
      }
    };
    checkPush();
  }, []);

  const handleEnablePush = async () => {
    if (!token) return;
    setPushLoading(true);
    setPushMessage(null);
    try {
      const ok = await requestAndSubscribePush(token);
      if (ok) {
        setPushEnabled(true);
        setPushMessage('Web Push notifications successfully activated on this device.');
      } else {
        setPushMessage('Could not activate push notifications. Please check browser permissions.');
      }
    } catch {
      setPushMessage('Error requesting push permission.');
    } finally {
      setPushLoading(false);
    }
  };

  const handleApproveBooking = async (bookingId: string) => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Approval failed with status ${res.status}`);
      }
      setActionFeedback({ type: 'success', text: 'Passenger booking confirmed! Seats updated.' });
      await fetchDashboardData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err?.message || 'Failed to approve booking' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/bookings/${bookingId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ reason: 'Declined by driver from dashboard' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || `Decline failed with status ${res.status}`);
      }
      setActionFeedback({ type: 'success', text: 'Booking request declined.' });
      await fetchDashboardData();
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err?.message || 'Failed to decline booking' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // 1. ACTIVE RIDES (Highest priority)
  const activeDrivingRides = rides.filter((r) => r.status === 'IN_PROGRESS');
  const activePassengerBookings = bookings.filter(
    (b) => b.status === 'CONFIRMED' && b.ride?.status === 'IN_PROGRESS'
  );
  const hasActiveRides = activeDrivingRides.length > 0 || activePassengerBookings.length > 0;

  // 2. UPCOMING SCHEDULED (Future rides only)
  const nowMs = Date.now();
  const upcomingDrivingRides = rides.filter(
    (r) => r.status === 'SCHEDULED' && new Date(r.departureTime).getTime() > nowMs
  );
  const upcomingPassengerBookings = bookings.filter(
    (b) =>
      (b.status === 'CONFIRMED' || b.status === 'PENDING') &&
      b.ride?.status === 'SCHEDULED' &&
      new Date(b.ride.departureTime).getTime() > nowMs
  );

  // 3. PENDING DRIVER REQUESTS (Actionable items)
  // Only surface requests for rides that are scheduled or active and haven't departed
  const actionablePendingBookings = pendingDriverBookings.filter((b) => {
    const isRideActiveOrScheduled = b.ride.status === 'SCHEDULED' || b.ride.status === 'IN_PROGRESS';
    const hasNotDeparted = new Date(b.ride.departureTime).getTime() > nowMs;
    return isRideActiveOrScheduled && hasNotDeparted;
  });

  return (
    <PageShell width="wide">
      {/* Welcome & Command Center Header */}
      <div
        style={{
          padding: '20px 20px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle, #e5e7eb)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          boxSizing: 'border-box',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: user?.audience === 'FACULTY' ? '#f3e8ff' : '#dcfce7',
                  color: user?.audience === 'FACULTY' ? '#6b21a8' : '#15803d',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <ShieldCheck size={13} />
                {user?.audience === 'FACULTY' ? 'Faculty Verified' : 'Student Verified'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                VIT Chennai Campus &bull; {user?.audience === 'FACULTY' ? 'Faculty Circle' : 'Student Circle'}
              </span>
              {pushEnabled ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#ecfdf5',
                    color: '#065f46',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: '1px solid #a7f3d0',
                  }}
                >
                  <Bell size={12} style={{ color: '#059669' }} />
                  Push Active
                </span>
              ) : (
                <button
                  onClick={handleEnablePush}
                  disabled={pushLoading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: '1px solid #bfdbfe',
                    cursor: 'pointer',
                  }}
                  title="Enable browser push notifications for approaching driver alerts"
                >
                  <Bell size={12} />
                  {pushLoading ? 'Activating...' : 'Enable Push Alerts'}
                </button>
              )}
            </div>
            <h1 style={{ fontSize: '1.6rem', color: 'var(--text-primary)', margin: 0, fontWeight: 800, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              Welcome back, {user?.fullName}!
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '4px 0 0', wordBreak: 'break-all' }}>
              Signed in as <strong>{user?.email}</strong>
            </p>
          </div>

          {/* Top Quick Actions */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="md" leftIcon={<Home size={16} />}>
                Home
              </Button>
            </Link>
            <Link to="/rides">
              <Button variant="primary" size="md" leftIcon={<Search size={16} />}>
                Find Rides
              </Button>
            </Link>
            <Link to="/offer-ride">
              <Button variant="outline" size="md" leftIcon={<PlusCircle size={16} />}>
                Offer a Ride
              </Button>
            </Link>
            <Button
              variant="outline"
              size="md"
              leftIcon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
              onClick={fetchDashboardData}
              disabled={loading}
              title="Refresh dashboard data"
            >
              Refresh
            </Button>
          </div>
        </div>

        {pushMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: pushEnabled ? '#ecfdf5' : '#fef2f2',
              color: pushEnabled ? '#065f46' : '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {pushEnabled ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {pushMessage}
          </div>
        )}

        {actionFeedback && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: actionFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: actionFeedback.type === 'success' ? '#065f46' : '#991b1b',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {actionFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {actionFeedback.text}
          </div>
        )}

        {/* Streamlined Metrics Bar */}
        <div
          className="responsive-metrics-grid"
          style={{
            paddingTop: '16px',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Bookings</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
              {bookings.filter((b) => (b.status === 'CONFIRMED' || b.status === 'PENDING') && b.ride?.status !== 'CANCELLED' && b.ride?.status !== 'COMPLETED').length}
            </div>
          </div>
          <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Published Rides</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>
              {rides.filter((r) => r.status === 'SCHEDULED' || r.status === 'IN_PROGRESS').length}
            </div>
          </div>
          <Link to="/notifications" style={{ textDecoration: 'none' }}>
            <div
              style={{
                backgroundColor: unreadNotifCount > 0 ? '#fef2f2' : '#f8fafc',
                padding: '12px 16px',
                borderRadius: '10px',
                border: unreadNotifCount > 0 ? '1.5px solid #f87171' : '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: unreadNotifCount > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: 600 }}>
                Unread Alerts
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: unreadNotifCount > 0 ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                {unreadNotifCount}
              </div>
            </div>
          </Link>
          <Link to="/vehicles" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>My Vehicles</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7c3aed', marginTop: '2px' }}>
                {vehicles.length}
              </div>
            </div>
          </Link>
          <Link to="/ride-alerts" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Saved Alerts</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7c3aed', marginTop: '2px' }}>
                {alertsCount}
              </div>
            </div>
          </Link>
          <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Campus Audience</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {user?.audience || 'COMMUNITY'}
            </div>
          </div>
        </div>
      </div>

      {/* Prominent Offer a Ride Quick Action Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '16px 20px',
          backgroundColor: '#f0fdf4',
          borderRadius: '14px',
          border: '1.5px solid #bbf7d0',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
        id="dashboard-offer-ride-callout"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '260px', flex: 1 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: '#dcfce7',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <PlusCircle size={24} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#14532d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Driving to Campus or Heading Home?
              <span
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 700,
                  backgroundColor: '#bbf7d0',
                  color: '#166534',
                  padding: '2px 7px',
                  borderRadius: '12px',
                }}
              >
                HOST A RIDE
              </span>
            </div>
            <div style={{ fontSize: '0.825rem', color: '#166534', marginTop: '2px', lineHeight: '1.4' }}>
              Publish your commute schedule in 30 seconds, share fuel expenses with verified campus peers, and cut campus traffic.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
          <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
            <Button
              variant="primary"
              size="md"
              leftIcon={<PlusCircle size={16} />}
              style={{
                backgroundColor: '#16a34a',
                borderColor: '#15803d',
                fontWeight: 700,
                boxShadow: '0 2px 4px rgba(22, 163, 74, 0.25)',
              }}
              id="btn-prominent-offer-ride"
            >
              Offer a Ride Now
            </Button>
          </Link>
          <Link to="/vehicles" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="md" leftIcon={<Car size={15} />} id="btn-dashboard-vehicles">
              My Vehicles ({vehicles.length})
            </Button>
          </Link>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          1. ACTIVE RIDE IN PROGRESS ELEVATION (HIGHEST PRIORITY)
          Front-and-center when active rides or active passenger journeys exist.
         ───────────────────────────────────────────────────────────────────────────── */}
      {hasActiveRides && (
        <section
          data-testid="active-rides-section"
          style={{
            marginBottom: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.25)',
                animation: 'pulse 1.8s infinite',
              }}
            />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Live Ride in Progress
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: '#fee2e2',
                color: '#991b1b',
                letterSpacing: '0.04em',
              }}
            >
              LIVE TRACKING ACTIVE
            </span>
          </div>

          {/* Driver Active Rides */}
          {activeDrivingRides.map((ride) => (
            <div
              key={ride.id}
              data-testid={`active-driver-ride-${ride.id}`}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '2px solid #10b981',
                padding: '18px 20px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '12px',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      YOU ARE DRIVING
                    </span>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Radio size={12} />
                      IN PROGRESS
                    </span>
                    {ride.vehicle && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {ride.vehicle.make} {ride.vehicle.model} ({ride.vehicle.registrationNumber})
                      </span>
                    )}
                  </div>
                  <h3
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      margin: '0 0 4px',
                      color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {ride.origin} &rarr; {ride.destination}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {ride.confirmedBookingsCount || 0} passenger(s) booked &bull; {ride.availableSeats} of{' '}
                    {ride.totalSeats} seats open &bull; ₹{ride.costPerSeat}/seat
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to={`/rides/${ride.id}/track`} style={{ textDecoration: 'none' }}>
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<Navigation size={18} />}
                      style={{
                        backgroundColor: '#059669',
                        borderColor: '#059669',
                        fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
                        minHeight: '44px',
                      }}
                    >
                      OPEN LIVE TRACKING
                    </Button>
                  </Link>
                  <Link to="/my-rides" style={{ textDecoration: 'none' }}>
                    <Button variant="outline" size="md" style={{ minHeight: '44px' }}>
                      Manage Ride
                    </Button>
                  </Link>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                <RouteSpine
                  origin={ride.origin}
                  destination={ride.destination}
                  departureTime={new Date(ride.departureTime).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  variant="compact"
                />
              </div>
            </div>
          ))}

          {/* Passenger Active Bookings */}
          {activePassengerBookings.map((b) => (
            <div
              key={b.id}
              data-testid={`active-passenger-booking-${b.id}`}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '2px solid #2563eb',
                padding: '18px 20px',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxSizing: 'border-box',
                width: '100%',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '12px',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      YOU ARE PASSENGER
                    </span>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor:
                          b.boardingStatus === 'BOARDED'
                            ? '#dcfce7'
                            : b.boardingStatus === 'BOARDING'
                            ? '#fef3c7'
                            : '#eff6ff',
                        color:
                          b.boardingStatus === 'BOARDED'
                            ? '#15803d'
                            : b.boardingStatus === 'BOARDING'
                            ? '#92400e'
                            : '#1d4ed8',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      {b.boardingStatus === 'BOARDED'
                        ? 'BOARDED & EN ROUTE'
                        : b.boardingStatus === 'BOARDING'
                        ? 'BOARDING NOW'
                        : 'WAITING FOR DRIVER'}
                    </span>
                  </div>
                  <h3
                    style={{
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      margin: '0 0 4px',
                      color: 'var(--text-primary)',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                  >
                    Driver: {b.ride.driverName}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {b.ride.vehicle
                      ? `${b.ride.vehicle.color || ''} ${b.ride.vehicle.make} ${b.ride.vehicle.model}`.trim()
                      : 'Verified Campus Vehicle'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px', wordBreak: 'break-word' }}>
                    Pickup Point: <strong>{b.pickupAddress || b.ride.origin}</strong>
                  </div>
                </div>

                {/* Direct Action Button */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to={`/rides/${b.rideId}/track`} style={{ textDecoration: 'none' }}>
                    <Button
                      variant="primary"
                      size="md"
                      leftIcon={<Navigation size={18} />}
                      style={{
                        backgroundColor: '#2563eb',
                        borderColor: '#2563eb',
                        fontWeight: 700,
                        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                        minHeight: '44px',
                      }}
                    >
                      TRACK YOUR RIDE
                    </Button>
                  </Link>
                  <Link to="/bookings?tab=passenger" style={{ textDecoration: 'none' }}>
                    <Button variant="outline" size="md" style={{ minHeight: '44px' }}>
                      Booking Details
                    </Button>
                  </Link>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                <RouteSpine
                  origin={b.ride.origin}
                  destination={b.ride.destination}
                  departureTime={new Date(b.ride.departureTime).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  variant="compact"
                />
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          2. ACTION ITEMS & ATTENTION NEEDED SECTION
          Surfaces driver booking requests to approve/decline and immediate items.
         ───────────────────────────────────────────────────────────────────────────── */}
      {actionablePendingBookings.length > 0 && (
        <section
          data-testid="action-items-section"
          style={{
            marginBottom: '28px',
            backgroundColor: '#fffbeb',
            borderRadius: '12px',
            border: '1.5px solid #fde68a',
            padding: '16px 18px',
            boxSizing: 'border-box',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={20} style={{ color: '#d97706' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#92400e' }}>
                Action Items ({actionablePendingBookings.length} Pending Approval)
              </h2>
            </div>
            <Link to="/my-rides" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b45309' }}>
              View in My Rides &rarr;
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {actionablePendingBookings.slice(0, 3).map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#ffffff',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                  boxSizing: 'border-box',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {item.passengerName} requested {item.requestedSeats} seat{item.requestedSeats > 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Pickup: {item.pickupAddress || 'Along corridor'} &bull; Ride: {item.ride.origin} &rarr;{' '}
                    {item.ride.destination}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Check size={14} />}
                    onClick={() => handleApproveBooking(item.id)}
                    disabled={actionLoadingId === item.id}
                    style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', minHeight: '38px' }}
                    id={`btn-approve-${item.id}`}
                  >
                    {actionLoadingId === item.id ? 'Approving...' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<X size={14} />}
                    onClick={() => handleRejectBooking(item.id)}
                    disabled={actionLoadingId === item.id}
                    style={{ color: '#dc2626', borderColor: '#fca5a5', minHeight: '38px' }}
                    id={`btn-decline-${item.id}`}
                  >
                    {actionLoadingId === item.id ? 'Declining...' : 'Decline'}
                  </Button>
                  <Link to="/my-rides">
                    <Button variant="outline" size="sm" style={{ minHeight: '38px' }}>
                      Review
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────────
          3. UPCOMING SCHEDULE (DRIVER & PASSENGER)
         ───────────────────────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
          Upcoming Schedule
        </h2>

        <div className="responsive-two-col" style={{ gap: '20px' }}>
          {/* Column A: Rides You Are Driving */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid var(--border-light, #e5e7eb)',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} style={{ color: '#16a34a' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Rides You Are Driving</h3>
              </div>
              <Link to="/my-rides" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16a34a' }}>
                Manage All &rarr;
              </Link>
            </div>

            {loading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading upcoming rides...
              </div>
            ) : upcomingDrivingRides.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-subtle, #f8fafc)',
                  borderRadius: '8px',
                }}
              >
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem' }}>No scheduled upcoming driver rides.</p>
                <Link to="/offer-ride">
                  <Button variant="outline" size="sm" leftIcon={<PlusCircle size={14} />}>
                    Publish a Campus Ride
                  </Button>
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcomingDrivingRides.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e5e7eb)',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Clock size={11} />
                        {formatRelativeTime(r.departureTime)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {r.availableSeats} open seat(s) &bull; ₹{r.costPerSeat}/seat
                      </span>
                    </div>

                    <RouteSpine
                      origin={r.origin}
                      destination={r.destination}
                      departureTime={new Date(r.departureTime).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      variant="compact"
                    />

                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <Link to={`/rides/${r.id}/track`} style={{ textDecoration: 'none' }}>
                        <Button variant="outline" size="sm" leftIcon={<Radio size={12} />}>
                          Tracking Console
                        </Button>
                      </Link>
                      <Link to="/my-rides" style={{ textDecoration: 'none' }}>
                        <Button variant="outline" size="sm">
                          Manage
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column B: Bookings as Passenger */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid var(--border-light, #e5e7eb)',
              padding: '22px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ticket size={18} style={{ color: '#2563eb' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>My Passenger Bookings</h3>
              </div>
              <Link to="/bookings?tab=passenger" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#2563eb' }}>
                View All &rarr;
              </Link>
            </div>

            {loading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading bookings...
              </div>
            ) : upcomingPassengerBookings.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-subtle, #f8fafc)',
                  borderRadius: '8px',
                }}
              >
                <p style={{ margin: '0 0 12px', fontSize: '0.875rem' }}>No upcoming scheduled bookings.</p>
                <Link to="/rides">
                  <Button variant="outline" size="sm" leftIcon={<Search size={14} />}>
                    Explore Corridors
                  </Button>
                </Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcomingPassengerBookings.slice(0, 3).map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light, #e5e7eb)',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: b.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7',
                          color: b.status === 'CONFIRMED' ? '#166534' : '#92400e',
                        }}
                      >
                        {b.status} &bull; {formatRelativeTime(b.ride.departureTime)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {b.requestedSeats} Seat{b.requestedSeats > 1 ? 's' : ''}
                      </span>
                    </div>

                    <RouteSpine
                      origin={b.ride.origin}
                      destination={b.ride.destination}
                      departureTime={new Date(b.ride.departureTime).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      variant="compact"
                    />

                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 0 }}>
                        {b.ride.vehicle?.imageUrl && (
                          <img
                            src={b.ride.vehicle.imageUrl}
                            alt="Vehicle"
                            style={{ width: '22px', height: '18px', borderRadius: '3px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light, #e2e8f0)' }}
                          />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Pickup: {b.pickupAddress || b.ride.origin}
                        </span>
                      </div>
                      {b.status === 'CONFIRMED' && (
                        <Link to={`/rides/${b.rideId}/track`} style={{ textDecoration: 'none' }}>
                          <Button variant="outline" size="sm" leftIcon={<Radio size={12} />}>
                            Track
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────────────────
          4. QUICK ACTIONS BAR
          Touch-friendly command center for frequent carpool actions.
         ───────────────────────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px', color: 'var(--text-primary)' }}>
          Quick Actions
        </h2>
        <div className="rides-cards-grid" style={{ gap: '16px' }}>
          <Link to="/rides" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <Search size={24} style={{ color: '#2563eb', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Find Rides</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Search Chennai transit corridors & book verified seats
              </div>
            </div>
          </Link>

          <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <PlusCircle size={24} style={{ color: '#16a34a', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Offer a Ride</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Publish your commute and share fuel costs with peers
              </div>
            </div>
          </Link>

          <Link to="/bookings" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <Ticket size={24} style={{ color: '#d97706', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>My Bookings</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Track passenger tickets and review ride receipts
              </div>
            </div>
          </Link>

          <Link to="/my-rides" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <Calendar size={24} style={{ color: '#059669', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>My Driving</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Manage published rides and review passenger requests
              </div>
            </div>
          </Link>

          <Link to="/messages" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <MessageSquare size={24} style={{ color: '#8b5cf6', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Messages</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Chat securely with verified drivers and confirmed co-riders
              </div>
            </div>
          </Link>

          <Link to="/vehicles" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light, #e5e7eb)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              className="dashboard-nav-card"
            >
              <Car size={24} style={{ color: '#4f46e5', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>My Vehicles</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Register personal cars and update vehicle profiles
              </div>
            </div>
          </Link>
        </div>
      </section>
    </PageShell>
  );
};
