import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  Users,
  Car,
  ShieldCheck,
  Clock,
  ArrowRight,
  Search,
  RotateCcw,
  AlertCircle,
  Loader2,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { PublicRideSummaryDto, SearchRidesResponseDto } from '@vit-carpool/contracts';

interface SearchParams {
  origin: string;
  destination: string;
  date: string;
  seats: number;
}

interface SearchResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchParams: SearchParams | null;
  onOfferRide: () => void;
  onOpenAuth?: () => void;
  onOpenVerification?: () => void;
}

export const SearchResultsModal: React.FC<SearchResultsModalProps> = ({
  isOpen,
  onClose,
  searchParams,
  onOfferRide,
  onOpenAuth,
  onOpenVerification,
}) => {
  const { user, token } = useAuth();

  // Local filter states
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterSeats, setFilterSeats] = useState<number>(1);

  // API State
  const [rides, setRides] = useState<PublicRideSummaryDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected ride for detail view
  const [selectedRide, setSelectedRide] = useState<PublicRideSummaryDto | null>(null);

  // Sync initial searchParams when modal opens or params change
  useEffect(() => {
    if (searchParams) {
      setFilterOrigin(searchParams.origin || '');
      setFilterDestination(searchParams.destination || '');
      setFilterDate(searchParams.date || '');
      setFilterSeats(searchParams.seats || 1);
    }
  }, [searchParams, isOpen]);

  // Execute backend discovery search
  const executeSearch = useCallback(
    async (pageToFetch: number = 1) => {
      if (!token || user?.verificationStatus !== 'VERIFIED') {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();

        if (filterOrigin.trim()) {
          queryParams.set('origin', filterOrigin.trim());
        }
        if (filterDestination.trim()) {
          queryParams.set('destination', filterDestination.trim());
        }
        if (filterDate.trim()) {
          queryParams.set('departureDate', filterDate.trim());
        }
        if (filterSeats > 1) {
          queryParams.set('minSeats', filterSeats.toString());
        }

        queryParams.set('page', pageToFetch.toString());
        queryParams.set('limit', '10');
        queryParams.set('sortOrder', 'asc');

        const res = await fetch(`/rides?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Search request failed with status ${res.status}`);
        }

        const data: SearchRidesResponseDto = await res.json();
        setRides(data.rides);
        setTotalCount(data.pagination.total);
        setCurrentPage(data.pagination.page);
        setTotalPages(data.pagination.totalPages);
      } catch (err: any) {
        setError(err.message || 'Unable to retrieve live rides. Please check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [token, user, filterOrigin, filterDestination, filterDate, filterSeats],
  );

  // Trigger search on modal open or when authenticated
  useEffect(() => {
    if (isOpen && token && user?.verificationStatus === 'VERIFIED') {
      executeSearch(1);
    }
  }, [isOpen, token, user?.verificationStatus, executeSearch]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(1);
  };

  const handleClearFilters = () => {
    setFilterOrigin('');
    setFilterDestination('');
    setFilterDate('');
    setFilterSeats(1);
    // Execute fresh search with empty filters
    if (token && user?.verificationStatus === 'VERIFIED') {
      setLoading(true);
      setError(null);
      fetch('/rides?minSeats=1&page=1&limit=10&sortOrder=asc', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load rides'))))
        .then((data: SearchRidesResponseDto) => {
          setRides(data.rides);
          setTotalCount(data.pagination.total);
          setCurrentPage(data.pagination.page);
          setTotalPages(data.pagination.totalPages);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setSelectedRide(null);
        onClose();
      }}
      title={selectedRide ? 'Ride Details & Community Route' : 'Find Community Rides'}
      maxWidth={selectedRide ? '560px' : '720px'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          {selectedRide ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRide(null)}
              >
                Back to Results
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedRide(null);
                  onClose();
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {user ? `Logged in as ${user.audience || 'Member'}` : 'Institutional sign-in required'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
                {user?.verificationStatus === 'VERIFIED' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onOfferRide();
                    }}
                  >
                    Offer a Ride
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      }
    >
      {/* --------------------------------------------------------------------- */}
      {/* 1. RIDE DETAILS VIEW (when a card is clicked)                         */}
      {/* --------------------------------------------------------------------- */}
      {selectedRide ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }} id="ride-details-view">
          {/* Corridor Header Card */}
          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--color-brand-50)',
              borderRadius: '10px',
              border: '1px solid var(--color-brand-200)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-brand-700)',
                }}
              >
                Verified {selectedRide.audience} Corridor
              </span>
              <span
                style={{
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                Scheduled
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <MapPin size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Origin Point</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {selectedRide.origin}
                  </div>
                </div>
              </div>

              <div
                style={{
                  height: '16px',
                  borderLeft: '2px dashed var(--color-brand-300)',
                  marginLeft: '8px',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <Navigation size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Destination</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    {selectedRide.destination}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ride Specs Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px',
            }}
          >
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} /> Departure Time
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', color: 'var(--text-primary)' }}>
                {formatDeparture(selectedRide.departureTime)}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Users size={13} /> Available Seats
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', color: 'var(--color-brand-700)' }}>
                {selectedRide.availableSeats} passenger seat{selectedRide.availableSeats > 1 ? 's' : ''}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cost Contribution</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginTop: '4px', color: 'var(--text-primary)' }}>
                {selectedRide.costPerSeat !== null ? `₹${selectedRide.costPerSeat} / seat` : 'Free / Voluntary Share'}
              </div>
            </div>

            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Car size={13} /> Vehicle Details
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '4px', color: 'var(--text-primary)' }}>
                {selectedRide.vehicle
                  ? `${selectedRide.vehicle.color} ${selectedRide.vehicle.make} ${selectedRide.vehicle.model}`
                  : 'Registered Car'}
              </div>
            </div>
          </div>

          {/* Driver & Community Badge */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-brand-100)',
                  color: 'var(--color-brand-700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              >
                {selectedRide.driverName.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  {selectedRide.driverName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Verified {selectedRide.audience} Driver
                </div>
              </div>
            </div>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                backgroundColor: 'var(--color-brand-50)',
                color: 'var(--color-brand-700)',
                padding: '4px 8px',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} /> Affiliation Confirmed
            </span>
          </div>

          {/* Privacy & Milestone 4.2 Booking Disclosure Notice */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={13} style={{ color: '#64748b' }} />
              <span>Campus Privacy & Booking Policy</span>
            </div>
            <p style={{ margin: 0, lineHeight: '1.4' }}>
              • Vehicle license plate numbers and private residential pickup notes are never disclosed in search results.
            </p>
            <p style={{ margin: 0, lineHeight: '1.4' }}>
              • Searching for a ride does not reserve a seat. Booking requests and driver approval workflows will unlock in Milestone 4.2.
            </p>
          </div>
        </div>
      ) : (
        /* --------------------------------------------------------------------- */
        /* 2. SEARCH & RESULTS LIST VIEW                                         */
        /* --------------------------------------------------------------------- */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Active Filter Bar Form */}
          <form
            onSubmit={handleFilterSubmit}
            style={{
              padding: '14px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
            id="ride-search-filter-form"
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '8px',
              }}
            >
              {/* Origin Filter */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                  Origin Point
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={filterOrigin}
                    onChange={(e) => setFilterOrigin(e.target.value)}
                    placeholder="Leaving from..."
                    style={{
                      width: '100%',
                      padding: '7px 9px',
                      fontSize: '0.825rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: '#ffffff',
                    }}
                    id="filter-origin-input"
                  />
                </div>
              </div>

              {/* Destination Filter */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                  Destination
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={filterDestination}
                    onChange={(e) => setFilterDestination(e.target.value)}
                    placeholder="Going to..."
                    style={{
                      width: '100%',
                      padding: '7px 9px',
                      fontSize: '0.825rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: '#ffffff',
                    }}
                    id="filter-destination-input"
                  />
                </div>
              </div>

              {/* Date Filter */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                  Departure Date
                </label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 9px',
                    fontSize: '0.825rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: '#ffffff',
                  }}
                  id="filter-date-input"
                />
              </div>

              {/* Min Seats Filter */}
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                  Min Seats
                </label>
                <select
                  value={filterSeats}
                  onChange={(e) => setFilterSeats(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '7px 9px',
                    fontSize: '0.825rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: '#ffffff',
                  }}
                  id="filter-seats-select"
                >
                  <option value={1}>1+ Seat</option>
                  <option value={2}>2+ Seats</option>
                  <option value={3}>3+ Seats</option>
                  <option value={4}>4+ Seats</option>
                </select>
              </div>
            </div>

            {/* Filter Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
              <button
                type="button"
                onClick={handleClearFilters}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                id="btn-clear-filters"
              >
                <RotateCcw size={12} /> Clear Filters
              </button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                leftIcon={<Search size={14} />}
                disabled={loading}
                id="btn-apply-filters"
              >
                {loading ? 'Searching...' : 'Apply Filters'}
              </Button>
            </div>
          </form>

          {/* ----------------------------------------------------------------- */}
          {/* Unauthenticated / Verification Gate Callouts                      */}
          {/* ----------------------------------------------------------------- */}
          {!user && (
            <div
              style={{
                padding: '24px 20px',
                backgroundColor: 'var(--color-brand-50)',
                borderRadius: '10px',
                border: '1px solid var(--color-brand-200)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
              id="callout-auth-required"
            >
              <ShieldCheck size={32} style={{ color: 'var(--color-brand-700)' }} />
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-brand-900)', margin: '0 0 4px' }}>
                  Institutional Affiliation Required
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-brand-800)', maxWidth: '440px', margin: '0 auto' }}>
                  Ride discovery is strictly restricted to verified VIT Chennai students and faculty to uphold our campus trust charter.
                </p>
              </div>
              {onOpenAuth && (
                <Button variant="primary" size="sm" onClick={() => { onClose(); onOpenAuth(); }}>
                  Sign In with VIT Account
                </Button>
              )}
            </div>
          )}

          {user && user.verificationStatus === 'PENDING' && (
            <div
              style={{
                padding: '20px',
                backgroundColor: '#fef3c7',
                borderRadius: '10px',
                border: '1px solid #fde68a',
                color: '#92400e',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
              id="callout-verification-pending"
            >
              <AlertCircle size={28} />
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px' }}>
                  Verification Pending Review
                </h4>
                <p style={{ fontSize: '0.825rem', maxWidth: '440px', margin: '0 auto' }}>
                  Your account is pending institutional verification. Once approved by campus moderators, you will be able to search and discover peer rides.
                </p>
              </div>
              {onOpenVerification && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); onOpenVerification(); }}>
                  Check Verification Status
                </Button>
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Loading Indicator                                                 */}
          {/* ----------------------------------------------------------------- */}
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                gap: '12px',
              }}
              id="search-loading-state"
            >
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-brand-600)' }} />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Querying scheduled rides for {user?.audience || 'your verified cohort'}...
              </span>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Error Failure State                                               */}
          {/* ----------------------------------------------------------------- */}
          {!loading && error && (
            <div
              style={{
                padding: '16px',
                backgroundColor: '#fee2e2',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '0.85rem',
              }}
              id="search-error-state"
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <strong>Unable to load rides:</strong> {error}
                <div style={{ marginTop: '8px' }}>
                  <Button variant="outline" size="sm" onClick={() => executeSearch(1)}>
                    Retry Search
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Empty Results State                                               */}
          {/* ----------------------------------------------------------------- */}
          {!loading && !error && user?.verificationStatus === 'VERIFIED' && rides.length === 0 && (
            <div
              style={{
                padding: '36px 20px',
                borderRadius: '10px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '12px',
              }}
              id="search-empty-results-state"
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Search size={22} />
              </div>

              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  No Rides Found Matching Your Filters
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', lineHeight: '1.4' }}>
                  No scheduled {user?.audience} rides match your current route or departure criteria.
                  Try clearing your filters or offering a ride to peers commuting along this corridor.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  Clear All Filters
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onOfferRide();
                  }}
                >
                  Offer a Ride Instead
                </Button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------- */}
          {/* Real Persisted Results List                                       */}
          {/* ----------------------------------------------------------------- */}
          {!loading && !error && rides.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} id="search-results-list">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  padding: '0 4px',
                }}
              >
                <span>
                  Showing {rides.length} of {totalCount} scheduled {user?.audience || ''} ride{totalCount === 1 ? '' : 's'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-brand-700)', fontWeight: 600 }}>
                  <ShieldCheck size={14} /> Strict Cohort Isolated
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {rides.map((ride) => (
                  <div
                    key={ride.id}
                    onClick={() => setSelectedRide(ride)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border-medium)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease-in-out',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-brand-400)';
                      e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-medium)';
                      e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
                    }}
                    role="button"
                    tabIndex={0}
                    id={`ride-card-${ride.id}`}
                  >
                    {/* Route & Departure Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {ride.origin}
                        </span>
                        <ArrowRight size={14} style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {ride.destination}
                        </span>
                      </div>

                      <span
                        style={{
                          backgroundColor: 'var(--color-brand-50)',
                          color: 'var(--color-brand-700)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          flexShrink: 0,
                        }}
                      >
                        {ride.costPerSeat !== null ? `₹${ride.costPerSeat}` : 'Shared'}
                      </span>
                    </div>

                    {/* Metadata Strip */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--border-light)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} style={{ color: 'var(--text-muted)' }} />
                          <strong>{formatDeparture(ride.departureTime)}</strong>
                        </span>

                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: ride.availableSeats > 1 ? 'var(--status-success)' : '#d97706',
                            fontWeight: 600,
                          }}
                        >
                          <Users size={13} />
                          {ride.availableSeats} seat{ride.availableSeats > 1 ? 's' : ''} left
                        </span>

                        {ride.vehicle && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Car size={13} style={{ color: 'var(--text-muted)' }} />
                            {ride.vehicle.color} {ride.vehicle.make} {ride.vehicle.model}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-brand-700)', fontWeight: 600 }}>
                        <span>View Details</span>
                        <ChevronRight size={13} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination controls if totalPages > 1 */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '12px',
                    paddingTop: '10px',
                  }}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1 || loading}
                    onClick={() => executeSearch(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages || loading}
                    onClick={() => executeSearch(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
