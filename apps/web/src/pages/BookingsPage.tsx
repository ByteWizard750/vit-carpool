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
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { RateDriverModal } from '../components/ratings/RateDriverModal';
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

  // Fetch passenger bookings
  const fetchPassengerBookings = useCallback(async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoadingPassenger(true);
    setPassengerError(null);

    try {
      const res = await fetch('/bookings/mine', {
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
      const res = await fetch('/bookings/driver', {
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
      fetch(`/ratings/eligibility/${b.id}`, {
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
      const res = await fetch(`/bookings/${bookingId}/cancel`, {
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

  // Update driver request status (Approve or Reject)
  const handleDriverDecision = async (bookingId: string, status: 'CONFIRMED' | 'REJECTED') => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionMessage(null);

    try {
      const endpoint = status === 'CONFIRMED' ? `/bookings/${bookingId}/approve` : `/bookings/${bookingId}/reject`;
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
    <div className="container" style={{ padding: '36px 16px 64px', maxWidth: '880px' }}>
      {/* Page Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Carpool Bookings & Seat Requests
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Manage your passenger travel tickets and handle incoming seat requests for your published drives.
        </p>
      </div>

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
                const totalCost = (b.ride.costPerSeat || 0) * b.requestedSeats;

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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor:
                                b.status === 'CONFIRMED'
                                  ? '#dcfce7'
                                  : b.status === 'PENDING'
                                  ? '#fef3c7'
                                  : '#f1f5f9',
                              color:
                                b.status === 'CONFIRMED'
                                  ? '#166534'
                                  : b.status === 'PENDING'
                                  ? '#92400e'
                                  : '#64748b',
                            }}
                          >
                            {b.status}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Requested {b.requestedSeats} {b.requestedSeats === 1 ? 'seat' : 'seats'}
                          </span>
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {b.ride.origin} &rarr; {b.ride.destination}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-brand-700)' }}>
                          ₹{totalCost}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                          Fuel Contribution
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                      <Clock size={14} style={{ color: 'var(--color-brand-600)' }} />
                      <span>Departure: {formatDeparture(b.ride.departureTime)}</span>
                    </div>

                    {/* Confirmed Details: Driver contact and pickup notes */}
                    {isConfirmed && (
                      <div
                        style={{
                          padding: '12px 14px',
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          color: '#166534',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={15} /> Confirmed Driver Contact: {b.ride.driverName}
                        </div>
                        {b.ride.pickupDescription && (
                          <div>
                            <strong>Pickup Landmark:</strong> {b.ride.pickupDescription}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Pending state notice */}
                    {isPending && (
                      <div style={{ fontSize: '0.8rem', color: '#92400e', backgroundColor: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>
                        Waiting for driver {b.ride.driverName} to confirm your seat request.
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
                          <Link to={`/messages?bookingId=${b.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<MessageSquare size={13} style={{ color: '#2563eb' }} />}
                              id={`btn-chat-driver-${b.id}`}
                            >
                              Chat with Driver
                            </Button>
                          </Link>

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
    </div>
  );
};
