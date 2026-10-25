import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  Clock,
  Users,
  MapPin,
  Navigation,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Phone,
  ArrowRight,
  RotateCcw,
  Ban,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import {
  PassengerBookingResponseDto,
  DriverBookingResponseDto,
} from '@vit-carpool/contracts';

interface BookingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'PASSENGER' | 'DRIVER';
  onFindRides?: () => void;
  onOpenOffer?: () => void;
}

export const BookingsModal: React.FC<BookingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'PASSENGER',
  onFindRides,
  onOpenOffer,
}) => {
  const { user, token } = useAuth();

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

  // Sync tab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setActionMessage(null);
    }
  }, [isOpen, initialTab]);

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
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to fetch passenger bookings (${res.status})`);
      }

      const data = await res.json();
      setPassengerBookings(data.bookings || []);
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
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to fetch driver requests (${res.status})`);
      }

      const data = await res.json();
      setDriverBookings(data.bookings || []);
    } catch (err: any) {
      setDriverError(err.message || 'Unable to retrieve booking requests.');
    } finally {
      setLoadingDriver(false);
    }
  }, [token, user]);

  // Load data on open or tab change
  useEffect(() => {
    if (isOpen && token && user?.verificationStatus === 'VERIFIED') {
      if (activeTab === 'PASSENGER') {
        fetchPassengerBookings();
      } else {
        fetchDriverBookings();
      }
    }
  }, [isOpen, activeTab, token, user, fetchPassengerBookings, fetchDriverBookings]);

  // Cancel booking as passenger
  const handleCancelBooking = async (bookingId: string) => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionMessage(null);

    try {
      const res = await fetch(`/bookings/${bookingId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Cancelled by passenger' }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Cancellation failed (${res.status})`);
      }

      setActionMessage({
        type: 'success',
        text: 'Booking successfully cancelled.',
      });

      // Refresh list
      await fetchPassengerBookings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to cancel booking.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Approve booking as driver
  const handleApproveBooking = async (bookingId: string) => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionMessage(null);

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
        throw new Error(body.message || `Approval failed (${res.status})`);
      }

      setActionMessage({
        type: 'success',
        text: `Booking approved! Seats have been atomically allocated.`,
      });

      // Refresh driver requests
      await fetchDriverBookings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to approve booking request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject booking as driver
  const handleRejectBooking = async (bookingId: string) => {
    if (!token) return;
    setActionLoadingId(bookingId);
    setActionMessage(null);

    try {
      const res = await fetch(`/bookings/${bookingId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Declined by driver' }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Rejection failed (${res.status})`);
      }

      setActionMessage({
        type: 'success',
        text: 'Booking request rejected. No seats were allocated.',
      });

      // Refresh driver requests
      await fetchDriverBookings();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to reject booking request.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDeparture = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-IN', {
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

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#fef3c7',
              color: '#92400e',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <Clock size={12} /> Pending Approval
          </span>
        );
      case 'CONFIRMED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#dcfce7',
              color: '#15803d',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <CheckCircle2 size={12} /> Confirmed
          </span>
        );
      case 'REJECTED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <XCircle size={12} /> Declined
          </span>
        );
      case 'CANCELLED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#f1f5f9',
              color: '#64748b',
              padding: '3px 8px',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            <Ban size={12} /> Cancelled
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Carpool Bookings & Requests"
      maxWidth="720px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            VIT Chennai Institutional Peer Ride Sharing
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} id="bookings-management-container">
        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-medium)',
            gap: '8px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('PASSENGER');
              setActionMessage(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
              color: activeTab === 'PASSENGER' ? 'var(--color-brand-700)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'PASSENGER' ? '2px solid var(--color-brand-600)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
            id="tab-my-bookings"
          >
            <Ticket size={16} /> My Bookings (Passenger)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('DRIVER');
              setActionMessage(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.875rem',
              color: activeTab === 'DRIVER' ? 'var(--color-brand-700)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'DRIVER' ? '2px solid var(--color-brand-600)' : '2px solid transparent',
              transition: 'all 0.15s ease',
            }}
            id="tab-driver-requests"
          >
            <Users size={16} /> Ride Requests (Driver)
          </button>
        </div>

        {/* Global Action Message Banner */}
        {actionMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: actionMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: actionMessage.type === 'success' ? '#15803d' : '#991b1b',
              border: `1px solid ${actionMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}
            id="booking-action-banner"
          >
            {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* TAB 1: PASSENGER BOOKINGS                                           */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'PASSENGER' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                {passengerBookings.length} booking request{passengerBookings.length === 1 ? '' : 's'} recorded
              </span>
              <button
                type="button"
                onClick={() => fetchPassengerBookings()}
                disabled={loadingPassenger}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.75rem',
                  color: 'var(--color-brand-600)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                id="btn-refresh-passenger-bookings"
              >
                <RotateCcw size={12} className={loadingPassenger ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingPassenger ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '40px 20px',
                  gap: '10px',
                  color: 'var(--text-secondary)',
                }}
              >
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-brand-600)' }} />
                <span style={{ fontSize: '0.85rem' }}>Loading your bookings...</span>
              </div>
            ) : passengerError ? (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Unable to load bookings:</strong> {passengerError}
              </div>
            ) : passengerBookings.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid var(--border-medium)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
                id="passenger-empty-state"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-brand-50)',
                    color: 'var(--color-brand-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ticket size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                    No Ride Bookings Yet
                  </h4>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto' }}>
                    You haven’t requested any seats yet. Discover rides posted by verified peers along your daily commuting corridor.
                  </p>
                </div>
                {onFindRides && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onFindRides();
                    }}
                  >
                    Find Community Rides
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {passengerBookings.map((b) => {
                  const isDeparted = new Date(b.ride.departureTime).getTime() <= Date.now();
                  const canCancel = (b.status === 'PENDING' || b.status === 'CONFIRMED') && !isDeparted && b.ride.status !== 'CANCELLED';

                  return (
                    <div
                      key={b.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid var(--border-medium)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                      id={`booking-card-${b.id}`}
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color: 'var(--color-brand-700)',
                              backgroundColor: 'var(--color-brand-50)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {b.audience} Peer Ride
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            • Requested {new Date(b.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        {renderStatusBadge(b.status)}
                      </div>

                      {/* Route Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MapPin size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {b.ride.origin}
                          </span>
                          <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                          <Navigation size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {b.ride.destination}
                          </span>
                        </div>
                      </div>

                      {/* Specs Row */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: '8px',
                          padding: '10px',
                          backgroundColor: 'var(--bg-subtle)',
                          borderRadius: '8px',
                          fontSize: '0.775rem',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Departure:</span>{' '}
                          <strong>{formatDeparture(b.ride.departureTime)}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Seats Requested:</span>{' '}
                          <strong style={{ color: 'var(--color-brand-700)' }}>
                            {b.requestedSeats} seat{b.requestedSeats > 1 ? 's' : ''}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Driver:</span>{' '}
                          <strong>{b.ride.driverName}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Vehicle:</span>{' '}
                          <strong>
                            {b.ride.vehicle
                              ? `${b.ride.vehicle.color} ${b.ride.vehicle.make} ${b.ride.vehicle.model}`
                              : 'Registered Car'}
                          </strong>
                        </div>
                      </div>

                      {/* Confirmed Details Callout (Privacy-safe: only revealed upon confirmation) */}
                      {b.status === 'CONFIRMED' && (
                        <div
                          style={{
                            padding: '10px 12px',
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            fontSize: '0.8rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: 700 }}>
                            <ShieldCheck size={14} /> Confirmed Journey Details Unlocked
                          </div>
                          {b.ride.pickupDescription && (
                            <div>
                              <span style={{ color: '#047857' }}>Pickup Landmark:</span>{' '}
                              <strong>{b.ride.pickupDescription}</strong>
                            </div>
                          )}
                          {b.ride.dropoffDescription && (
                            <div>
                              <span style={{ color: '#047857' }}>Dropoff Landmark:</span>{' '}
                              <strong>{b.ride.dropoffDescription}</strong>
                            </div>
                          )}
                          {b.ride.driverPhone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Phone size={13} style={{ color: '#047857' }} />
                              <span style={{ color: '#047857' }}>Driver Phone:</span>{' '}
                              <strong>{b.ride.driverPhone}</strong>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pending Notice */}
                      {b.status === 'PENDING' && (
                        <div
                          style={{
                            fontSize: '0.775rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Lock size={12} />
                          Driver has not yet approved this request. Seats are not reserved until approved.
                        </div>
                      )}

                      {/* Cancellation Action */}
                      {canCancel && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoadingId === b.id}
                            onClick={() => handleCancelBooking(b.id)}
                            leftIcon={
                              actionLoadingId === b.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Ban size={13} />
                              )
                            }
                          >
                            {b.status === 'CONFIRMED' ? 'Cancel Booking' : 'Cancel Request'}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------- */}
        {/* TAB 2: DRIVER RIDE REQUESTS                                         */}
        {/* ------------------------------------------------------------------- */}
        {activeTab === 'DRIVER' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                {driverBookings.length} passenger request{driverBookings.length === 1 ? '' : 's'} across your rides
              </span>
              <button
                type="button"
                onClick={() => fetchDriverBookings()}
                disabled={loadingDriver}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  fontSize: '0.75rem',
                  color: 'var(--color-brand-600)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                id="btn-refresh-driver-bookings"
              >
                <RotateCcw size={12} className={loadingDriver ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingDriver ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '40px 20px',
                  gap: '10px',
                  color: 'var(--text-secondary)',
                }}
              >
                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-brand-600)' }} />
                <span style={{ fontSize: '0.85rem' }}>Loading passenger requests...</span>
              </div>
            ) : driverError ? (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#fee2e2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Unable to load driver requests:</strong> {driverError}
              </div>
            ) : driverBookings.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid var(--border-medium)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
                id="driver-empty-state"
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-brand-50)',
                    color: 'var(--color-brand-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                    No Passenger Requests Received
                  </h4>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto' }}>
                    When verified peers request seats on your published rides, they will appear here for review and confirmation.
                  </p>
                </div>
                {onOpenOffer && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onOpenOffer();
                    }}
                  >
                    Offer a New Ride
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {driverBookings.map((b) => {
                  const isPending = b.status === 'PENDING';
                  const availableSeats = b.ride.availableSeats;
                  const hasEnoughSeats = availableSeats >= b.requestedSeats;

                  return (
                    <div
                      key={b.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#ffffff',
                        borderRadius: '10px',
                        border: '1px solid var(--border-medium)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: 'var(--shadow-xs)',
                      }}
                      id={`driver-booking-card-${b.id}`}
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                              fontSize: '0.8rem',
                            }}
                          >
                            {b.passengerName.charAt(0)}
                          </div>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                              {b.passengerName}
                            </span>
                            <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                              ({b.audience} Peer)
                            </span>
                          </div>
                        </div>
                        {renderStatusBadge(b.status)}
                      </div>

                      {/* Route Summary */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem' }}>
                        <MapPin size={14} style={{ color: '#2563eb' }} />
                        <span style={{ fontWeight: 600 }}>{b.ride.origin}</span>
                        <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                        <Navigation size={14} style={{ color: '#16a34a' }} />
                        <span style={{ fontWeight: 600 }}>{b.ride.destination}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                          • {formatDeparture(b.ride.departureTime)}
                        </span>
                      </div>

                      {/* Seat Allocation Metrics */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '10px 12px',
                          backgroundColor: 'var(--bg-subtle)',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Requested:</span>{' '}
                          <strong style={{ color: 'var(--color-brand-700)' }}>
                            {b.requestedSeats} seat{b.requestedSeats > 1 ? 's' : ''}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--text-muted)' }}>Ride Remaining Capacity:</span>{' '}
                          <strong style={{ color: availableSeats > 0 ? '#15803d' : '#991b1b' }}>
                            {availableSeats} seat{availableSeats === 1 ? '' : 's'} available
                          </strong>
                        </div>
                        {b.passengerPhone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={12} style={{ color: 'var(--color-brand-700)' }} />
                            <span>{b.passengerPhone}</span>
                          </div>
                        )}
                      </div>

                      {/* Approval Warning if seats are insufficient */}
                      {isPending && !hasEnoughSeats && (
                        <div
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fef3c7',
                            borderRadius: '6px',
                            fontSize: '0.775rem',
                            color: '#b45309',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <AlertCircle size={14} />
                          Cannot approve: Requested seats ({b.requestedSeats}) exceed remaining available seats ({availableSeats}).
                        </div>
                      )}

                      {/* Approval / Rejection Action Controls */}
                      {isPending && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoadingId === b.id}
                            onClick={() => handleRejectBooking(b.id)}
                            leftIcon={
                              actionLoadingId === b.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <X size={13} />
                              )
                            }
                          >
                            Decline
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionLoadingId === b.id || !hasEnoughSeats}
                            onClick={() => handleApproveBooking(b.id)}
                            leftIcon={
                              actionLoadingId === b.id ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <Check size={13} />
                              )
                            }
                          >
                            Approve & Allocate Seats
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
