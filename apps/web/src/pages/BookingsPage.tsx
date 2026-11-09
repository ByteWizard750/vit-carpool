import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Ticket,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Ban,
  Check,
  X,
  Search,
  MessageSquare,
  Star,
  Radio,
  Car,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { RouteSpine } from '../components/common/RouteSpine';
import { RateDriverModal } from '../components/ratings/RateDriverModal';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { MyTripsTabs } from '../components/navigation/MyTripsTabs';
import { useAuth } from '../features/auth/AuthContext';
import {
  PassengerBookingResponseDto,
  DriverBookingResponseDto,
  DriverRatingResponseDto,
} from '@vit-carpool/contracts';

export const BookingsPage: React.FC = () => {
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'driver' ? 'DRIVER' : 'PASSENGER';
  const filterRideId = searchParams.get('rideId');

  const [activeTab, setActiveTab] = useState<'PASSENGER' | 'DRIVER'>(initialTab);

  // Passenger state
  const [passengerBookings, setPassengerBookings] = useState<PassengerBookingResponseDto[]>([]);
  const [loadingPassenger, setLoadingPassenger] = useState(false);
  const [passengerError, setPassengerError] = useState<string | null>(null);

  // Driver state
  const [driverBookings, setDriverBookings] = useState<DriverBookingResponseDto[]>([]);
  const [loadingDriver, setLoadingDriver] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);

  // Action loading states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Confirmation modal for cancelling passenger booking
  const [bookingToCancel, setBookingToCancel] = useState<PassengerBookingResponseDto | null>(null);

  // Rating modal & cache for completed rides
  const [bookingToRate, setBookingToRate] = useState<PassengerBookingResponseDto | null>(null);
  const [ratedBookings, setRatedBookings] = useState<Record<string, DriverRatingResponseDto>>({});

  // Cab fare revision acknowledgement state
  const [acknowledgingBookingId, setAcknowledgingBookingId] = useState<string | null>(null);

  // Fetch passenger bookings
  const fetchPassengerBookings = useCallback(async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoadingPassenger(true);
    setPassengerError(null);

    try {
      const res = await fetch('/api/bookings/mine', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Failed to fetch passenger bookings (${res.status})`);
      }

      const data = await res.json();
      setPassengerBookings(Array.isArray(data) ? data : data.bookings || []);
    } catch (err: any) {
      setPassengerError(err.message || 'Unable to retrieve your bookings.');
    } finally {
      setLoadingPassenger(false);
    }
  }, [token, user]);

  // Fetch driver bookings
  const fetchDriverBookings = useCallback(async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoadingDriver(true);
    setDriverError(null);

    try {
      const res = await fetch('/api/bookings/driver', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(`Failed to fetch driver requests (${res.status})`);
      }

      const data = await res.json();
      setDriverBookings(Array.isArray(data) ? data : data.bookings || []);
    } catch (err: any) {
      setDriverError(err.message || 'Unable to retrieve booking requests.');
    } finally {
      setLoadingDriver(false);
    }
  }, [token, user]);

  // Sync tab with URL search parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'driver') {
      setActiveTab('DRIVER');
    } else if (tabParam === 'passenger') {
      setActiveTab('PASSENGER');
    }
  }, [searchParams]);

  // Fetch bookings on mount or when token/user changes
  useEffect(() => {
    if (token) {
      fetchPassengerBookings();
      fetchDriverBookings();
    }
  }, [token, fetchPassengerBookings, fetchDriverBookings]);

  // Check rating status for completed confirmed passenger bookings
  useEffect(() => {
    if (!token || passengerBookings.length === 0) return;
    const completedConfirmed = passengerBookings.filter(
      (b) => b.status === 'CONFIRMED' && b.ride.status === 'COMPLETED',
    );

    for (const b of completedConfirmed) {
      fetch(`/api/ratings/eligibility/${b.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.existingRating) {
            setRatedBookings((prev) => ({ ...prev, [b.id]: data.existingRating }));
          }
        })
        .catch(() => {});
    }
  }, [passengerBookings, token]);

  const switchTab = (tab: 'PASSENGER' | 'DRIVER') => {
    setActiveTab(tab);
    setActionMessage(null);
    setSearchParams({ tab: tab.toLowerCase() });
  };

  // Cancel booking as passenger
  const handleCancelBooking = async () => {
    if (!token || !bookingToCancel) return;
    const bookingId = bookingToCancel.id;
    setActionLoadingId(bookingId);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ cancellationReason: 'Cancelled by passenger' }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to cancel booking (${res.status})`);
      }

      setActionMessage({
        type: 'success',
        text: 'Your booking request has been cancelled.',
      });
      setBookingToCancel(null);
      fetchPassengerBookings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to cancel booking request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcknowledgeCabFare = async (booking: PassengerBookingResponseDto) => {
    if (!token || !booking.ride.cabShare) return;
    const revisionToAck = booking.ride.cabShare.fareRevision;
    setAcknowledgingBookingId(booking.id);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/bookings/${booking.id}/cab-fare/acknowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          bookingId: booking.id,
          fareRevision: revisionToAck,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Fare acknowledgement failed (${res.status})`);
      }

      setActionMessage({
        type: 'success',
        text: `You have successfully acknowledged Revision #${revisionToAck} for this cab share!`,
      });

      // Update local state directly so UI responds instantly
      setPassengerBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, fareRevisionAcknowledged: revisionToAck } : b)),
      );
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Unable to acknowledge fare revision.',
      });
    } finally {
      setAcknowledgingBookingId(null);
    }
  };

  // Update driver request status (Approve or Reject)
  const handleDriverDecision = async (bookingId: string, status: 'CONFIRMED' | 'REJECTED') => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionMessage(null);

    try {
      const endpoint = status === 'CONFIRMED' ? `/api/bookings/${bookingId}/approve` : `/api/bookings/${bookingId}/reject`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: status === 'REJECTED' ? JSON.stringify({ reason: 'Declined by driver' }) : undefined,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Action failed with status ${res.status}`);
      }

      setActionMessage({
        type: 'success',
        text: status === 'CONFIRMED' ? 'Passenger request approved! Seat reserved.' : 'Passenger request declined.',
      });
      fetchDriverBookings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to update request decision.',
      });
    } finally {
      setActionLoadingId(null);
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

  // Filter driver bookings by rideId if specified
  const filteredDriverBookings = filterRideId
    ? driverBookings.filter((b) => b.rideId === filterRideId)
    : driverBookings;

  return (
    <PageShell width="content">
      <PageHeader
        title="Carpool Bookings & Seat Requests"
        description="Manage your passenger travel tickets and handle incoming seat requests for your published drives."
        tabs={
          <MyTripsTabs
            counts={{
              bookings: passengerBookings.length,
              driving: driverBookings.length,
            }}
          />
        }
      />

      {/* Segmented Tab Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '24px',
          maxWidth: '440px',
        }}
      >
        <button
          type="button"
          onClick={() => switchTab('PASSENGER')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'PASSENGER' ? '#ffffff' : 'transparent',
            color: activeTab === 'PASSENGER' ? '#2563eb' : 'var(--text-secondary)',
            fontWeight: activeTab === 'PASSENGER' ? 700 : 500,
            fontSize: '0.9rem',
            boxShadow: activeTab === 'PASSENGER' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          id="tab-bookings-passenger"
        >
          <Ticket size={16} /> My Bookings (Passenger)
        </button>
        <button
          type="button"
          onClick={() => switchTab('DRIVER')}
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: activeTab === 'DRIVER' ? '#ffffff' : 'transparent',
            color: activeTab === 'DRIVER' ? '#16a34a' : 'var(--text-secondary)',
            fontWeight: activeTab === 'DRIVER' ? 700 : 500,
            fontSize: '0.9rem',
            boxShadow: activeTab === 'DRIVER' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          id="tab-bookings-driver"
        >
          <Users size={16} /> Driver Requests
        </button>
      </div>

      {/* Action Notification Alert */}
      {actionMessage && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: actionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${actionMessage.type === 'success' ? '#86efac' : '#fecaca'}`,
            borderRadius: '10px',
            color: actionMessage.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.85rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* TAB 1: PASSENGER BOOKINGS */}
      {activeTab === 'PASSENGER' && (
        <div>
          {passengerError && (
            <div style={{ padding: '14px 18px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '20px' }}>
              {passengerError}
            </div>
          )}

          {loadingPassenger ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading your carpool bookings...</div>
            </div>
          ) : passengerBookings.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
                textAlign: 'center',
              }}
            >
              <Ticket size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>No Bookings Yet</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 24px' }}>
                You haven't requested any seats on campus rides. Browse active peer corridors to find a commute traveling your way.
              </p>
              <Link to="/rides">
                <Button variant="primary" size="md" leftIcon={<Search size={16} />}>
                  Find Campus Rides
                </Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {passengerBookings.map((b) => {
                const isConfirmed = b.status === 'CONFIRMED';
                const isPending = b.status === 'PENDING';
                const isCab = b.ride.rideType === 'CAB_SHARE' || Boolean(b.ride.cabShare);
                const displayCost = isCab && b.ride.cabShare
                  ? b.ride.cabShare.currentPerPerson * b.requestedSeats
                  : (b.ride.costPerSeat || 0) * b.requestedSeats;

                return (
                  <div
                    key={b.id}
                    className="passenger-booking-card"
                    id={`booking-card-${b.id}`}
                    style={{
                      padding: '20px',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid var(--border-light)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <StatusBadge status={b.status} domain="booking" />

                          {isCab && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              id={`badge-cab-booking-${b.id}`}
                            >
                              <Users size={11} /> CAB SHARE
                            </span>
                          )}

                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Requested {b.requestedSeats} {b.requestedSeats === 1 ? 'seat' : 'seats'}
                          </span>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                          <RouteSpine
                            origin={b.ride.origin}
                            destination={b.ride.destination}
                            departureTime={formatDeparture(b.ride.departureTime)}
                            variant="compact"
                          />
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isCab ? '#92400e' : 'var(--color-brand-700)' }}>
                          ₹{displayCost}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                          {isCab ? 'Cab Cost Share' : 'Fuel Contribution'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      <Clock size={14} style={{ color: isCab ? '#d97706' : 'var(--color-brand-600)' }} />
                      <span>Departure: {formatDeparture(b.ride.departureTime)}</span>
                    </div>

                    {/* Cab Details or Registered Vehicle */}
                    {isCab && b.ride.cabShare ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                        <Users size={14} style={{ color: '#d97706' }} />
                        <span>
                          Commercial Cab: <strong>{b.ride.cabShare.cabService || 'Commercial Shared Cab'}</strong> (Total Capacity: {b.ride.cabShare.totalCapacity} seats)
                        </span>
                      </div>
                    ) : b.ride.vehicle ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                        {b.ride.vehicle.imageUrl ? (
                          <img
                            src={b.ride.vehicle.imageUrl}
                            alt="Vehicle"
                            style={{ width: '28px', height: '22px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--border-light)' }}
                          />
                        ) : (
                          <Car size={14} style={{ color: 'var(--color-brand-600)' }} />
                        )}
                        <span>
                          Vehicle: <strong>{b.ride.vehicle.color} {b.ride.vehicle.make} {b.ride.vehicle.model}</strong>
                        </span>
                      </div>
                    ) : null}

                    {/* Confirmed Details: Driver/Organiser contact and pickup notes */}
                    {isConfirmed && (
                      <div
                        style={{
                          padding: '12px 14px',
                          backgroundColor: isCab ? '#fffbeb' : '#f0fdf4',
                          border: `1px solid ${isCab ? '#fde68a' : '#bbf7d0'}`,
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          color: isCab ? '#92400e' : '#166534',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {b.ride.driverAvatarUrl ? (
                            <img
                              src={b.ride.driverAvatarUrl}
                              alt={b.ride.driverName}
                              style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: isCab ? '1px solid #fde68a' : '1px solid #86efac', flexShrink: 0 }}
                            />
                          ) : (
                            <CheckCircle2 size={15} style={{ color: isCab ? '#d97706' : '#16a34a' }} />
                          )}
                          <span>{isCab ? 'Confirmed Journey Organiser:' : 'Confirmed Driver Contact:'} {b.ride.driverName}</span>
                        </div>
                        {b.ride.pickupDescription && (
                          <div>
                            <strong>Pickup Landmark:</strong> {b.ride.pickupDescription}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Material Fare Revision & Passenger Acknowledgement Banner */}
                    {isConfirmed && isCab && b.ride.cabShare && (() => {
                      const cab = b.ride.cabShare;
                      const hasRevision = (cab.fareRevision ?? 1) > 1;
                      const isAcked = (b.fareRevisionAcknowledged ?? 0) >= cab.fareRevision;
                      const isAcking = acknowledgingBookingId === b.id;

                      if (!hasRevision && isAcked) return null;

                      if (hasRevision && !isAcked) {
                        const estTotal = cab.estimatedTotalFare;
                        const finalTotal = cab.finalTotalFare ?? estTotal;
                        const diff = finalTotal - estTotal;
                        const diffPercent = estTotal > 0 ? Math.round((diff / estTotal) * 100) : 0;

                        return (
                          <div
                            style={{
                              padding: '14px',
                              backgroundColor: '#fffbeb',
                              border: '1.5px solid #f59e0b',
                              borderRadius: '10px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.1)',
                            }}
                            id={`fare-revision-notice-${b.id}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800, color: '#b45309', fontSize: '0.875rem' }}>
                                <AlertCircle size={16} />
                                <span>Fare Revision Notice (Revision #{cab.fareRevision})</span>
                              </div>
                              <span style={{ fontSize: '0.725rem', fontWeight: 700, backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                Action Required
                              </span>
                            </div>

                            <div style={{ fontSize: '0.825rem', color: '#92400e', lineHeight: '1.45' }}>
                              The organiser updated the total cab fare from <strong>₹{estTotal}</strong> to <strong>₹{finalTotal}</strong>{' '}
                              {diff !== 0 && (
                                <span>({diff > 0 ? `+₹${diff} / +${diffPercent}%` : `-₹${Math.abs(diff)} / ${diffPercent}%`})</span>
                              )}.
                              <div style={{ marginTop: '4px' }}>
                                Your updated share is <strong>₹{cab.currentPerPerson * b.requestedSeats}</strong> (~₹{cab.currentPerPerson} / seat across {cab.totalConfirmedParticipants} participants).
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={isAcking}
                                onClick={() => handleAcknowledgeCabFare(b)}
                                leftIcon={isAcking ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                style={{ backgroundColor: '#d97706', borderColor: '#d97706' }}
                                id={`btn-ack-fare-${b.id}`}
                              >
                                {isAcking ? 'Acknowledging...' : 'Acknowledge Updated Fare'}
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      if (isAcked && (cab.fareRevision ?? 1) > 1) {
                        return (
                          <div
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              borderRadius: '6px',
                              fontSize: '0.775rem',
                              color: '#166534',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                            }}
                            id={`fare-ack-badge-${b.id}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                              <span>You have acknowledged Fare Revision #{cab.fareRevision} (~₹{cab.currentPerPerson}/seat).</span>
                            </div>
                            <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#15803d' }}>Acknowledged</span>
                          </div>
                        );
                      }

                      return null;
                    })()}

                    {/* Pending state notice */}
                    {isPending && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: new Date(b.ride.departureTime).getTime() <= Date.now() ? '#b91c1c' : '#92400e',
                          backgroundColor: new Date(b.ride.departureTime).getTime() <= Date.now() ? '#fef2f2' : '#fffbeb',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: new Date(b.ride.departureTime).getTime() <= Date.now() ? '1px solid #fecaca' : undefined,
                        }}
                      >
                        {new Date(b.ride.departureTime).getTime() <= Date.now()
                          ? 'This ride has departed without driver confirmation. The request has lapsed.'
                          : `Waiting for driver ${b.ride.driverName} to confirm your seat request.`}
                      </div>
                    )}

                    {/* Action buttons bar */}
                    {(() => {
                      const isCompleted = b.ride.status === 'COMPLETED';

                      return (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1px solid var(--border-light)',
                            paddingTop: '12px',
                            flexWrap: 'wrap',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isConfirmed && (
                              <Link to={`/rides/${b.ride.id}/track`} style={{ textDecoration: 'none' }}>
                                <Button
                                  variant={b.ride.status === 'IN_PROGRESS' ? 'primary' : 'outline'}
                                  size="sm"
                                  leftIcon={<Radio size={13} style={b.ride.status === 'IN_PROGRESS' ? { animation: 'map-pulse 1.5s infinite' } : undefined} />}
                                  id={`btn-track-booking-${b.id}`}
                                >
                                  {b.ride.status === 'IN_PROGRESS' ? 'Track Driver Live' : 'View Tracking'}
                                </Button>
                              </Link>
                            )}

                            <Link to={`/messages?bookingId=${b.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<MessageSquare size={13} style={{ color: '#2563eb' }} />}
                                id={`btn-chat-driver-${b.id}`}
                              >
                                {isCab ? 'Chat with Organiser' : 'Chat with Driver'}
                              </Button>
                            </Link>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isConfirmed && isCompleted && (
                              ratedBookings[b.id] ? (
                                <div
                                  style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    color: '#166534',
                                    backgroundColor: '#dcfce7',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                  id={`rating-status-${b.id}`}
                                >
                                  <Star size={13} style={{ fill: '#eab308', color: '#eab308' }} />
                                  <span>Rated ({ratedBookings[b.id].rating}/5)</span>
                                </div>
                              ) : (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => setBookingToRate(b)}
                                  leftIcon={<Star size={13} style={{ fill: '#ffffff' }} />}
                                  style={{ backgroundColor: '#eab308', borderColor: '#eab308', color: '#ffffff' }}
                                  id={`btn-rate-driver-${b.id}`}
                                >
                                  Rate Driver
                                </Button>
                              )
                            )}

                            {(isPending || (isConfirmed && !isCompleted)) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setBookingToCancel(b)}
                                leftIcon={<Ban size={13} style={{ color: '#dc2626' }} />}
                                id={`btn-cancel-booking-${b.id}`}
                              >
                                <span style={{ color: '#dc2626' }}>Cancel Booking</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DRIVER REQUESTS */}
      {activeTab === 'DRIVER' && (
        <div>
          {driverError && (
            <div style={{ padding: '14px 18px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '20px' }}>
              {driverError}
            </div>
          )}

          {filterRideId && (
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span>Filtering for selected ride.</span>
              <button
                type="button"
                onClick={() => setSearchParams({ tab: 'driver' })}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
              >
                Show All Rides
              </button>
            </div>
          )}

          {loadingDriver ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading passenger seat requests...</div>
            </div>
          ) : filteredDriverBookings.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
                textAlign: 'center',
              }}
            >
              <Users size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>No Pending Requests</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 24px' }}>
                You do not have any incoming seat requests for your published rides.
              </p>
              <Link to="/my-rides">
                <Button variant="outline" size="sm">
                  View My Published Drives
                </Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredDriverBookings.map((req) => {
                const isActionLoading = actionLoadingId === req.id;
                return (
                  <div
                    key={req.id}
                    className="driver-booking-card"
                    id={`driver-booking-card-${req.id}`}
                    style={{
                      padding: '20px',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid var(--border-light)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          {req.passengerAvatarUrl ? (
                            <img
                              src={req.passengerAvatarUrl}
                              alt={req.passengerName}
                              style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-light)', flexShrink: 0 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--color-brand-100)',
                                color: 'var(--color-brand-700)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                flexShrink: 0,
                              }}
                            >
                              {req.passengerName.charAt(0)}
                            </div>
                          )}
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {req.passengerName}
                          </span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: req.audience === 'FACULTY' ? '#f3e8ff' : '#dcfce7',
                              color: req.audience === 'FACULTY' ? '#6b21a8' : '#15803d',
                            }}
                          >
                            {req.audience}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          Requested <strong>{req.requestedSeats}</strong> {req.requestedSeats === 1 ? 'seat' : 'seats'} &bull; Ride: {req.ride.origin} &rarr; {req.ride.destination}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: '12px',
                          backgroundColor:
                            req.status === 'CONFIRMED'
                              ? '#dcfce7'
                              : req.status === 'PENDING'
                              ? '#fef3c7'
                              : '#f1f5f9',
                          color:
                            req.status === 'CONFIRMED'
                              ? '#166534'
                              : req.status === 'PENDING'
                              ? '#92400e'
                              : '#64748b',
                        }}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Departure: {formatDeparture(req.ride.departureTime)} &bull; Remaining seats on ride: {req.ride.availableSeats}
                    </div>

                    {/* Driver actions row: Chat with Passenger & Decision buttons */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid var(--border-light)',
                        paddingTop: '12px',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <Link to={`/messages?bookingId=${req.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<MessageSquare size={13} style={{ color: '#16a34a' }} />}
                          id={`btn-chat-passenger-${req.id}`}
                        >
                          Chat with Passenger
                        </Button>
                      </Link>

                      {req.status === 'PENDING' && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isActionLoading}
                            onClick={() => handleDriverDecision(req.id, 'REJECTED')}
                            leftIcon={<X size={14} style={{ color: '#dc2626' }} />}
                          >
                            Decline Request
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isActionLoading || req.requestedSeats > req.ride.availableSeats}
                            onClick={() => handleDriverDecision(req.id, 'CONFIRMED')}
                            leftIcon={isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                          >
                            {req.requestedSeats > req.ride.availableSeats ? 'Not Enough Seats' : 'Approve & Reserve Seat'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {bookingToCancel && (
        <Modal
          isOpen={Boolean(bookingToCancel)}
          onClose={() => setBookingToCancel(null)}
          title="Cancel Booking Request"
          maxWidth="440px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Are you sure you want to cancel your seat request for the ride from <strong>{bookingToCancel.ride.origin}</strong> to <strong>{bookingToCancel.ride.destination}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="outline" size="sm" onClick={() => setBookingToCancel(null)}>
                Keep Booking
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCancelBooking}
                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Rate Driver Modal */}
      {bookingToRate && (
        <RateDriverModal
          isOpen={Boolean(bookingToRate)}
          onClose={() => setBookingToRate(null)}
          bookingId={bookingToRate.id}
          driverName={bookingToRate.ride.driverName}
          rideOrigin={bookingToRate.ride.origin}
          rideDestination={bookingToRate.ride.destination}
          onRatingSubmitted={(rating) => {
            setRatedBookings((prev) => ({ ...prev, [bookingToRate.id]: rating }));
            setActionMessage({
              type: 'success',
              text: `Thank you for rating driver ${bookingToRate.ride.driverName}! Your review was saved.`,
            });
          }}
        />
      )}
    </PageShell>
  );
};
