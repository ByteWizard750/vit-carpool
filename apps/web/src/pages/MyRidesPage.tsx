import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Car,
  Users,
  Edit2,
  Trash2,
  Ticket,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Phone,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Info,
  Star,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { RouteSpine } from '../components/common/RouteSpine';
import { useAuth } from '../features/auth/AuthContext';
import {
  DriverRideResponseDto,
  DriverBookingResponseDto,
} from '@vit-carpool/contracts';

type RideTab = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';

export const MyRidesPage: React.FC = () => {
  const { user, token } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState<RideTab>('UPCOMING');

  // Rides State
  const [rides, setRides] = useState<DriverRideResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Cancellation Modal State
  const [rideToCancel, setRideToCancel] = useState<DriverRideResponseDto | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Booking Requests Modal State for a specific ride
  const [selectedRideForRequests, setSelectedRideForRequests] = useState<DriverRideResponseDto | null>(null);
  const [rideRequests, setRideRequests] = useState<DriverBookingResponseDto[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestActionLoadingId, setRequestActionLoadingId] = useState<string | null>(null);
  const [requestActionMessage, setRequestActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reject Booking Confirmation State
  const [rejectingBookingId, setRejectingBookingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const fetchMyRides = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/rides/mine', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Failed to load driver rides (${res.status})`);
      }

      const data = await res.json();
      setRides(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve your published rides.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMyRides();
  }, [fetchMyRides]);

  // Fetch booking requests for selected ride
  const fetchRideRequests = useCallback(async (rideId: string) => {
    if (!token) return;
    setLoadingRequests(true);
    setRequestActionMessage(null);

    try {
      const res = await fetch(`/bookings/driver?rideId=${rideId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Failed to load passenger requests (${res.status})`);
      }

      const data = await res.json();
      setRideRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setRequestActionMessage({
        type: 'error',
        text: err.message || 'Failed to load booking requests for this ride.',
      });
    } finally {
      setLoadingRequests(false);
    }
  }, [token]);

  // When a ride is selected to view requests, load its bookings
  useEffect(() => {
    if (selectedRideForRequests) {
      fetchRideRequests(selectedRideForRequests.id);
    } else {
      setRideRequests([]);
      setRequestActionMessage(null);
      setRejectingBookingId(null);
      setRejectReason('');
    }
  }, [selectedRideForRequests, fetchRideRequests]);

  // Handle Driver Decision: Approve Request
  const handleApproveRequest = async (bookingId: string) => {
    if (!token || !selectedRideForRequests) return;
    setRequestActionLoadingId(bookingId);
    setRequestActionMessage(null);

    try {
      const res = await fetch(`/bookings/${bookingId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Approval failed with status ${res.status}`);
      }

      setRequestActionMessage({
        type: 'success',
        text: 'Passenger booking approved! Seats decremented atomically.',
      });

      // Synchronize both the requests list and the rides list
      await fetchRideRequests(selectedRideForRequests.id);
      await fetchMyRides();

      // Update the active ride reference in the modal
      setSelectedRideForRequests((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          availableSeats: Math.max(0, prev.availableSeats - (body.requestedSeats || 1)),
          confirmedBookingsCount: (prev.confirmedBookingsCount || 0) + 1,
          pendingBookingsCount: Math.max(0, (prev.pendingBookingsCount || 1) - 1),
        };
      });
    } catch (err: any) {
      setRequestActionMessage({
        type: 'error',
        text: err.message || 'Unable to approve booking request.',
      });
    } finally {
      setRequestActionLoadingId(null);
    }
  };

  // Handle Driver Decision: Reject Request
  const handleConfirmReject = async (bookingId: string) => {
    if (!token || !selectedRideForRequests) return;
    setRequestActionLoadingId(bookingId);
    setRequestActionMessage(null);

    try {
      const res = await fetch(`/bookings/${bookingId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ reason: rejectReason.trim() || 'Declined by driver' }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Rejection failed with status ${res.status}`);
      }

      setRequestActionMessage({
        type: 'success',
        text: 'Passenger booking request has been rejected.',
      });

      setRejectingBookingId(null);
      setRejectReason('');

      // Refresh both states
      await fetchRideRequests(selectedRideForRequests.id);
      await fetchMyRides();
    } catch (err: any) {
      setRequestActionMessage({
        type: 'error',
        text: err.message || 'Unable to reject booking request.',
      });
    } finally {
      setRequestActionLoadingId(null);
    }
  };

  // Handle Confirm Cancel Ride
  const handleConfirmCancelRide = async () => {
    if (!rideToCancel || !token) return;
    setCancelling(true);
    setCancelError(null);

    try {
      const res = await fetch(`/rides/${rideToCancel.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to cancel ride (${res.status})`);
      }

      setActionSuccess(`Ride from "${rideToCancel.origin}" to "${rideToCancel.destination}" has been cancelled.`);
      setRideToCancel(null);
      await fetchMyRides();
    } catch (err: any) {
      setCancelError(err.message || 'Error occurred while cancelling this ride.');
    } finally {
      setCancelling(false);
    }
  };

  // Complete Ride Action
  const [completingId, setCompletingId] = useState<string | null>(null);

  const handleCompleteRide = async (rideId: string) => {
    if (!token) return;
    setCompletingId(rideId);
    setActionSuccess(null);

    try {
      const res = await fetch(`/rides/${rideId}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to complete ride (${res.status})`);
      }

      setActionSuccess('Ride successfully marked as completed!');
      await fetchMyRides();
      setActiveTab('COMPLETED');
    } catch (err: any) {
      alert(err.message || 'Error occurred while completing ride.');
    } finally {
      setCompletingId(null);
    }
  };

  const formatDeparture = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoDate;
    }
  };

  const isEditable = (ride: DriverRideResponseDto) => {
    if (ride.status !== 'SCHEDULED') return false;
    const depTime = new Date(ride.departureTime).getTime();
    // Cannot modify within 15 minutes of departure or after departure
    return depTime > Date.now() + 15 * 60 * 1000;
  };

  const isLockNoticeApplicable = (ride: DriverRideResponseDto) => {
    if (ride.status !== 'SCHEDULED') return false;
    const depTime = new Date(ride.departureTime).getTime();
    return depTime <= Date.now() + 15 * 60 * 1000 && depTime > Date.now();
  };

  // Categorize rides into categories
  const now = Date.now();
  const upcomingRides = rides.filter(
    (r) => r.status === 'SCHEDULED' && new Date(r.departureTime).getTime() > now
  );
  const completedRides = rides.filter(
    (r) => r.status === 'COMPLETED' || (r.status === 'SCHEDULED' && new Date(r.departureTime).getTime() <= now)
  );
  const cancelledRides = rides.filter((r) => r.status === 'CANCELLED');

  const displayedRides =
    activeTab === 'UPCOMING'
      ? upcomingRides
      : activeTab === 'COMPLETED'
      ? completedRides
      : cancelledRides;

  const totalPendingAcrossRides = rides.reduce(
    (sum, r) => sum + (r.pendingBookingsCount || 0),
    0
  );

  return (
    <div className="container" style={{ padding: '36px 16px 64px', maxWidth: '1140px' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Driver Ride Management
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-brand-100, #e0e7ff)',
                color: 'var(--color-brand-800, #3730a3)',
                textTransform: 'uppercase',
              }}
            >
              {user?.audience || 'Campus'} Driver
            </span>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '6px', marginBottom: 0 }}>
            Manage your published campus commutes, review passenger seat requests, and maintain safe vehicle records.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={fetchMyRides}
            disabled={loading}
            style={{
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--border-medium)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Refresh rides list"
            id="btn-refresh-my-rides"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <Link to="/recurring-commutes" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="md" leftIcon={<RefreshCw size={16} />} id="btn-recurring-commutes-header">
              Recurring Schedules
            </Button>
          </Link>

          <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
            <Button variant="primary" size="md" leftIcon={<PlusCircle size={16} />} id="btn-publish-ride-header">
              Publish New Ride
            </Button>
          </Link>
        </div>
      </div>

      {/* Global Success Notice */}
      {actionSuccess && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '10px',
            color: '#166534',
            fontSize: '0.875rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}
            aria-label="Dismiss notice"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Global Error Notice */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#991b1b',
            fontSize: '0.875rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Attention Banner for Pending Passenger Requests */}
      {totalPendingAcrossRides > 0 && (
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '12px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)',
          }}
          id="banner-pending-requests"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#b45309',
                flexShrink: 0,
              }}
            >
              <Ticket size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#92400e' }}>
                Action Required: {totalPendingAcrossRides} Pending Booking Request{totalPendingAcrossRides > 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: '0.825rem', color: '#b45309' }}>
                Peers from your {user?.audience} cohort have requested seats on your upcoming rides. Review and confirm to reserve their spots.
              </div>
            </div>
          </div>

          <Link to="/bookings?tab=driver" style={{ textDecoration: 'none' }}>
            <Button
              variant="outline"
              size="sm"
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#f59e0b',
                color: '#b45309',
                fontWeight: 700,
              }}
            >
              Review in Bookings
            </Button>
          </Link>
        </div>
      )}

      {/* Segmented Category Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-light, #e2e8f0)',
          marginBottom: '24px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'UPCOMING'}
          onClick={() => setActiveTab('UPCOMING')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'UPCOMING' ? '2px solid var(--color-brand-600, #2563eb)' : '2px solid transparent',
            background: 'none',
            fontSize: '0.9rem',
            fontWeight: activeTab === 'UPCOMING' ? 700 : 500,
            color: activeTab === 'UPCOMING' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
          }}
          id="tab-upcoming-rides"
        >
          <span>Upcoming Rides</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: activeTab === 'UPCOMING' ? 'var(--color-brand-100, #dbeafe)' : '#f1f5f9',
              color: activeTab === 'UPCOMING' ? 'var(--color-brand-800, #1e40af)' : '#64748b',
            }}
          >
            {upcomingRides.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'COMPLETED'}
          onClick={() => setActiveTab('COMPLETED')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'COMPLETED' ? '2px solid var(--color-brand-600, #2563eb)' : '2px solid transparent',
            background: 'none',
            fontSize: '0.9rem',
            fontWeight: activeTab === 'COMPLETED' ? 700 : 500,
            color: activeTab === 'COMPLETED' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
          }}
          id="tab-completed-rides"
        >
          <span>Completed</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: activeTab === 'COMPLETED' ? 'var(--color-brand-100, #dbeafe)' : '#f1f5f9',
              color: activeTab === 'COMPLETED' ? 'var(--color-brand-800, #1e40af)' : '#64748b',
            }}
          >
            {completedRides.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'CANCELLED'}
          onClick={() => setActiveTab('CANCELLED')}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderBottom: activeTab === 'CANCELLED' ? '2px solid var(--color-brand-600, #2563eb)' : '2px solid transparent',
            background: 'none',
            fontSize: '0.9rem',
            fontWeight: activeTab === 'CANCELLED' ? 700 : 500,
            color: activeTab === 'CANCELLED' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
          }}
          id="tab-cancelled-rides"
        >
          <span>Cancelled</span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: activeTab === 'CANCELLED' ? 'var(--color-brand-100, #dbeafe)' : '#f1f5f9',
              color: activeTab === 'CANCELLED' ? 'var(--color-brand-800, #1e40af)' : '#64748b',
            }}
          >
            {cancelledRides.length}
          </span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 12px', color: 'var(--color-brand-600)' }} />
          <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>Loading your driver rides...</div>
        </div>
      ) : displayedRides.length === 0 ? (
        <div
          style={{
            padding: '54px 24px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          }}
        >
          <Calendar size={44} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {activeTab === 'UPCOMING'
              ? 'No Upcoming Rides Scheduled'
              : activeTab === 'COMPLETED'
              ? 'No Completed Rides in History'
              : 'No Cancelled Rides'}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 24px', lineHeight: '1.5' }}>
            {activeTab === 'UPCOMING'
              ? 'You do not have any future campus commutes scheduled. Plan your route, register your car, and help peers get to campus.'
              : activeTab === 'COMPLETED'
              ? 'Rides that have departed and concluded will be archived here for record keeping.'
              : 'Rides you cancel will appear here for audit and tracking.'}
          </p>

          {activeTab === 'UPCOMING' && (
            <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
              <Button variant="primary" size="md" leftIcon={<PlusCircle size={16} />}>
                Publish a Ride Now
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
            gap: '20px',
          }}
        >
          {displayedRides.map((ride) => {
            const hasPending = (ride.pendingBookingsCount || 0) > 0;
            const editable = isEditable(ride);
            const lockNotice = isLockNoticeApplicable(ride);
            const confirmedCount = ride.confirmedBookingsCount ?? Math.max(0, (ride.totalSeats ?? 0) - ride.availableSeats);

            return (
              <div
                key={ride.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '14px',
                  border: hasPending ? '1.5px solid #f59e0b' : '1px solid var(--border-light)',
                  padding: '20px',
                  boxShadow: hasPending ? '0 4px 14px rgba(245, 158, 11, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
                className="my-ride-card"
              >
                <div>
                  {/* Top Status & Price Row */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '12px',
                          backgroundColor:
                            ride.status === 'CANCELLED'
                              ? '#fee2e2'
                              : ride.status === 'COMPLETED'
                              ? '#dcfce7'
                              : activeTab === 'COMPLETED'
                              ? '#f1f5f9'
                              : '#dbeafe',
                          color:
                            ride.status === 'CANCELLED'
                              ? '#991b1b'
                              : ride.status === 'COMPLETED'
                              ? '#166534'
                              : activeTab === 'COMPLETED'
                              ? '#475569'
                              : '#1e40af',
                          textTransform: 'uppercase',
                        }}
                      >
                        {ride.status === 'CANCELLED'
                          ? 'Cancelled'
                          : ride.status === 'COMPLETED'
                          ? 'Completed'
                          : activeTab === 'COMPLETED'
                          ? 'Departed'
                          : 'Upcoming'}
                      </span>

                      {/* Driver Rating Badge */}
                      {ride.driverRating && ride.driverRating.count > 0 && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            color: '#b45309',
                            backgroundColor: '#fef3c7',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          <Star size={11} style={{ fill: '#eab308', color: '#eab308' }} />
                          <span>{ride.driverRating.average?.toFixed(1)}/5 ({ride.driverRating.count})</span>
                        </span>
                      )}

                      {hasPending && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: '#fef3c7',
                            color: '#b45309',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Sparkles size={11} /> {ride.pendingBookingsCount} Pending
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-brand-700)' }}>
                      ₹{ride.costPerSeat ?? 0}{' '}
                      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                        /seat
                      </span>
                    </span>
                  </div>

                  {/* Route Spine Display */}
                  <div style={{ marginBottom: '14px' }}>
                    <RouteSpine
                      origin={ride.origin}
                      destination={ride.destination}
                      variant="compact"
                    />
                  </div>

                  {/* Date, Vehicle, and Seats Specs */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: 'var(--bg-subtle, #f8fafc)',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontSize: '0.825rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={14} style={{ color: 'var(--color-brand-600)' }} />
                      <span style={{ fontWeight: 600 }}>{formatDeparture(ride.departureTime)}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Car size={14} style={{ color: 'var(--color-brand-600)' }} />
                      <span>
                        {ride.vehicle ? (
                          <>
                            <strong>{ride.vehicle.color} {ride.vehicle.make} {ride.vehicle.model}</strong>{' '}
                            <span style={{ color: 'var(--text-muted)' }}>({ride.vehicle.registrationNumber})</span>
                          </>
                        ) : (
                          'Registered Campus Vehicle'
                        )}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} style={{ color: 'var(--color-brand-600)' }} />
                        <span>
                          <strong>{ride.availableSeats}</strong> of {ride.totalSeats} seats open
                        </span>
                      </div>

                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {confirmedCount} confirmed
                      </span>
                    </div>
                  </div>

                  {/* 15-Minute Edit Lock Notice */}
                  {lockNotice && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '6px 10px',
                        backgroundColor: '#fff7ed',
                        border: '1px solid #ffedd5',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        color: '#c2410c',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Info size={13} />
                      <span>Editing locked (within 15 minutes of departure)</span>
                    </div>
                  )}
                </div>

                {/* Bottom Card Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* View Passenger Requests Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedRideForRequests(ride)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        backgroundColor: hasPending ? '#fef3c7' : 'var(--bg-subtle, #f8fafc)',
                        border: hasPending ? '1px solid #f59e0b' : '1px solid var(--border-medium)',
                        borderRadius: '8px',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        color: hasPending ? '#b45309' : 'var(--text-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'background-color 0.1s ease',
                      }}
                      id={`btn-requests-${ride.id}`}
                    >
                      <Ticket size={14} style={{ color: hasPending ? '#d97706' : 'var(--color-brand-600)' }} />
                      <span>Requests</span>
                      {hasPending ? (
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '9999px',
                            backgroundColor: '#d97706',
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                          }}
                        >
                          {ride.pendingBookingsCount}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ({confirmedCount})
                        </span>
                      )}
                    </button>

                    {/* Edit Ride Button */}
                    {ride.status === 'SCHEDULED' && activeTab === 'UPCOMING' && (
                      <Link
                        to={editable ? `/offer-ride?edit=${ride.id}` : '#'}
                        style={{
                          textDecoration: 'none',
                          pointerEvents: editable ? 'auto' : 'none',
                        }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!editable}
                          title={editable ? 'Edit ride schedule/seats' : 'Editing disabled within 15 minutes of departure'}
                          leftIcon={<Edit2 size={13} />}
                          id={`btn-edit-${ride.id}`}
                        />
                      </Link>
                    )}

                    {/* Complete Ride Button */}
                    {ride.status === 'SCHEDULED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={completingId === ride.id}
                        onClick={() => handleCompleteRide(ride.id)}
                        leftIcon={completingId === ride.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} style={{ color: '#16a34a' }} />}
                        id={`btn-complete-${ride.id}`}
                      >
                        Mark Completed
                      </Button>
                    )}

                    {ride.status === 'COMPLETED' && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#166534',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          backgroundColor: '#f0fdf4',
                          borderRadius: '6px',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        <CheckCircle2 size={13} style={{ color: '#16a34a' }} />
                        Completed
                      </span>
                    )}

                    {/* Cancel Ride Button */}
                    {ride.status === 'SCHEDULED' && activeTab === 'UPCOMING' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Cancel this published ride"
                        onClick={() => {
                          setRideToCancel(ride);
                          setCancelError(null);
                        }}
                        leftIcon={<Trash2 size={13} style={{ color: '#dc2626' }} />}
                        id={`btn-cancel-${ride.id}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: PASSENGER REQUESTS & SEAT MANAGEMENT MODAL
          ========================================================================= */}
      {selectedRideForRequests && (
        <Modal
          isOpen={Boolean(selectedRideForRequests)}
          onClose={() => setSelectedRideForRequests(null)}
          title="Passenger Seat Requests"
          maxWidth="640px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Corridor Header Summary */}
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--color-brand-50, #eff6ff)',
                borderRadius: '10px',
                border: '1px solid var(--color-brand-200, #bfdbfe)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-brand-900)' }}>
                  {selectedRideForRequests.origin} &rarr; {selectedRideForRequests.destination}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {formatDeparture(selectedRideForRequests.departureTime)}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-brand-700)' }}>
                  {selectedRideForRequests.availableSeats} of {selectedRideForRequests.totalSeats} seats open
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ₹{selectedRideForRequests.costPerSeat ?? 0} /seat
                </div>
              </div>
            </div>

            {/* Modal Action Messages */}
            {requestActionMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: requestActionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                  border: `1px solid ${requestActionMessage.type === 'success' ? '#86efac' : '#fecaca'}`,
                  borderRadius: '8px',
                  color: requestActionMessage.type === 'success' ? '#166534' : '#991b1b',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {requestActionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{requestActionMessage.text}</span>
              </div>
            )}

            {/* Requests List */}
            {loadingRequests ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.85rem' }}>Loading passenger requests...</div>
              </div>
            ) : rideRequests.length === 0 ? (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-subtle, #f8fafc)',
                  borderRadius: '10px',
                  border: '1px dashed var(--border-medium)',
                }}
              >
                <Ticket size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  No Seat Requests Yet
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Verified peers from your {user?.audience} cohort will appear here when they request seats on this commute.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
                {rideRequests.map((req) => {
                  const isPending = req.status === 'PENDING';
                  const isConfirmed = req.status === 'CONFIRMED';
                  const isProcessing = requestActionLoadingId === req.id;
                  const isRejecting = rejectingBookingId === req.id;
                  const hasEnoughSeats = selectedRideForRequests.availableSeats >= req.requestedSeats;

                  return (
                    <div
                      key={req.id}
                      style={{
                        padding: '14px',
                        backgroundColor: '#ffffff',
                        borderRadius: '10px',
                        border: isPending ? '1.5px solid #fde68a' : '1px solid var(--border-light)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                            {req.passengerName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Requested {req.requestedSeats} seat{req.requestedSeats > 1 ? 's' : ''} &bull; {new Date(req.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor:
                              req.status === 'CONFIRMED'
                                ? '#dcfce7'
                                : req.status === 'PENDING'
                                ? '#fef3c7'
                                : req.status === 'REJECTED'
                                ? '#fee2e2'
                                : '#f1f5f9',
                            color:
                              req.status === 'CONFIRMED'
                                ? '#166534'
                                : req.status === 'PENDING'
                                ? '#b45309'
                                : req.status === 'REJECTED'
                                ? '#991b1b'
                                : '#64748b',
                            textTransform: 'uppercase',
                          }}
                        >
                          {req.status}
                        </span>
                      </div>

                      {/* Confirmed Passenger Contact Details (Privacy-Safe) */}
                      {isConfirmed && req.passengerPhone && (
                        <div
                          style={{
                            padding: '6px 10px',
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: '#166534',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Phone size={12} />
                          <span>Contact: <strong>{req.passengerPhone}</strong> (Confirmed Rider)</span>
                        </div>
                      )}

                      {/* Chat with Passenger Link */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link to={`/messages?bookingId=${req.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<MessageSquare size={13} style={{ color: '#2563eb' }} />}
                            id={`btn-chat-passenger-${req.id}`}
                          >
                            Chat with Passenger
                          </Button>
                        </Link>
                      </div>

                      {/* Rejection / Cancellation Reason Note */}
                      {(req.status === 'REJECTED' || req.status === 'CANCELLED') && req.cancellationReason && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Reason: {req.cancellationReason}
                        </div>
                      )}

                      {/* Pending Action Buttons */}
                      {isPending && (
                        <div>
                          {isRejecting ? (
                            <div style={{ marginTop: '6px', padding: '10px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#991b1b', marginBottom: '6px' }}>
                                Reason for declining (optional):
                              </div>
                              <input
                                type="text"
                                placeholder="e.g. Schedule changed / fully occupied"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '6px 10px',
                                  fontSize: '0.8rem',
                                  borderRadius: '6px',
                                  border: '1px solid #fca5a5',
                                  marginBottom: '8px',
                                  boxSizing: 'border-box',
                                }}
                              />
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRejectingBookingId(null)}
                                  disabled={isProcessing}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={isProcessing}
                                  onClick={() => handleConfirmReject(req.id)}
                                  style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                                >
                                  {isProcessing ? 'Declining...' : 'Confirm Decline'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '4px' }}>
                              {!hasEnoughSeats && (
                                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginRight: 'auto' }}>
                                  ⚠️ Insufficient seats ({selectedRideForRequests.availableSeats} available)
                                </span>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => setRejectingBookingId(req.id)}
                                leftIcon={<X size={12} />}
                                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                              >
                                Decline
                              </Button>

                              <Button
                                variant="primary"
                                size="sm"
                                disabled={isProcessing || !hasEnoughSeats}
                                onClick={() => handleApproveRequest(req.id)}
                                leftIcon={isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                              >
                                {isProcessing ? 'Approving...' : 'Approve Request'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '14px' }}>
              <Button variant="outline" size="sm" onClick={() => setSelectedRideForRequests(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* =========================================================================
          MODAL 2: CONFIRMATION MODAL FOR RIDE CANCELLATION
          ========================================================================= */}
      {rideToCancel && (
        <Modal
          isOpen={Boolean(rideToCancel)}
          onClose={() => setRideToCancel(null)}
          title="Cancel Published Ride"
          maxWidth="460px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <AlertTriangle size={18} style={{ color: '#dc2626', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '0.85rem', color: '#991b1b', lineHeight: '1.4' }}>
                Are you sure you want to cancel your ride from <strong>{rideToCancel.origin}</strong> to <strong>{rideToCancel.destination}</strong> scheduled for <strong>{formatDeparture(rideToCancel.departureTime)}</strong>?
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              <strong>Cancellation Consequences:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                <li>This ride will be removed from campus search corridors immediately.</li>
                <li>Any pending passenger requests will be declined.</li>
                <li>Confirmed riders will receive a cancellation notice.</li>
                <li>This action is permanent and cannot be undone.</li>
              </ul>
            </p>

            {cancelError && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#991b1b',
                  fontSize: '0.8rem',
                }}
              >
                {cancelError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
              <Button variant="outline" size="sm" onClick={() => setRideToCancel(null)} disabled={cancelling}>
                Keep Ride
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={cancelling}
                onClick={handleConfirmCancelRide}
                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
