import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Navigation,
  Calendar,
  Users,
  Car,
  ShieldCheck,
  RotateCcw,
  Clock,
  ArrowRight,
  Ticket,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  IndianRupee,
  Compass,
  ArrowUpDown,
  Star,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { RouteSpine } from '../components/common/RouteSpine';
import { SeatDots } from '../components/common/SeatDots';
import { useAuth } from '../features/auth/AuthContext';
import {
  PublicRideSummaryDto,
  SearchRidesResponseDto,
  LocationSuggestionDto,
} from '@vit-carpool/contracts';

export const RidesPage: React.FC = () => {
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Primary filter states initialized from URL params
  const [origin, setOrigin] = useState(searchParams.get('origin') || '');
  const [originLocation, setOriginLocation] = useState<LocationSuggestionDto | null>(() => {
    const lat = searchParams.get('originLat');
    const lon = searchParams.get('originLon');
    const text = searchParams.get('origin');
    return lat && lon && text
      ? { id: 'url-origin', name: text, address: text, latitude: parseFloat(lat), longitude: parseFloat(lon), category: 'locality' }
      : null;
  });

  const [destination, setDestination] = useState(searchParams.get('destination') || '');
  const [destLocation, setDestLocation] = useState<LocationSuggestionDto | null>(() => {
    const lat = searchParams.get('destLat');
    const lon = searchParams.get('destLon');
    const text = searchParams.get('destination');
    return lat && lon && text
      ? { id: 'url-dest', name: text, address: text, latitude: parseFloat(lat), longitude: parseFloat(lon), category: 'locality' }
      : null;
  });

  const [date, setDate] = useState(searchParams.get('date') || '');
  const [seats, setSeats] = useState<number>(() => {
    const s = searchParams.get('seats');
    return s ? parseInt(s, 10) : 1;
  });

  // Enhanced filter states (Milestone 5.2)
  const [maxCost, setMaxCost] = useState(searchParams.get('maxCost') || '');
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const r = searchParams.get('radiusKm');
    return r ? parseFloat(r) : 3;
  });
  const [sortBy, setSortBy] = useState<'departureTime' | 'cost' | 'seats'>(() => {
    const sb = searchParams.get('sortBy');
    return sb === 'cost' || sb === 'seats' ? sb : 'departureTime';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => {
    const so = searchParams.get('sortOrder');
    return so === 'desc' ? 'desc' : 'asc';
  });
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(() => {
    return Boolean(searchParams.get('maxCost') || (searchParams.get('radiusKm') && searchParams.get('radiusKm') !== '3') || (searchParams.get('sortBy') && searchParams.get('sortBy') !== 'departureTime'));
  });

  // API State
  const [rides, setRides] = useState<PublicRideSummaryDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected ride for detail view & booking
  const [selectedRide, setSelectedRide] = useState<PublicRideSummaryDto | null>(null);
  const [requestedSeats, setRequestedSeats] = useState<number>(1);
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Reset booking state when selected ride changes
  useEffect(() => {
    setRequestedSeats(1);
    setBookingSuccess(null);
    setBookingError(null);
  }, [selectedRide]);

  const activeExtraFiltersCount =
    (maxCost ? 1 : 0) +
    (radiusKm !== 3 ? 1 : 0) +
    (sortBy !== 'departureTime' ? 1 : 0);

  const formatDeparture = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const executeSearch = useCallback(
    async (pageToFetch = 1) => {
      if (!token) return;

      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (origin.trim()) queryParams.set('origin', origin.trim());
        if (destination.trim()) queryParams.set('destination', destination.trim());
        if (originLocation?.latitude !== undefined && originLocation?.longitude !== undefined) {
          queryParams.set('originLat', originLocation.latitude.toString());
          queryParams.set('originLon', originLocation.longitude.toString());
          if (radiusKm) queryParams.set('radiusKm', radiusKm.toString());
        }
        if (destLocation?.latitude !== undefined && destLocation?.longitude !== undefined) {
          queryParams.set('destLat', destLocation.latitude.toString());
          queryParams.set('destLon', destLocation.longitude.toString());
          if (radiusKm) queryParams.set('radiusKm', radiusKm.toString());
        }
        if (date.trim()) queryParams.set('departureDate', date.trim());
        if (seats > 1) queryParams.set('minSeats', seats.toString());
        if (maxCost.trim() && !isNaN(Number(maxCost))) {
          queryParams.set('maxCost', Math.max(0, parseInt(maxCost, 10)).toString());
        }
        queryParams.set('sortBy', sortBy);
        queryParams.set('sortOrder', sortOrder);
        queryParams.set('page', pageToFetch.toString());
        queryParams.set('limit', '8');

        const res = await fetch(`/rides?${queryParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          if (res.status === 401) return;
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Search request failed with status ${res.status}`);
        }

        const data: SearchRidesResponseDto = await res.json();
        setRides(data.rides || []);
        setTotalCount(data.pagination.total || 0);
        setCurrentPage(data.pagination.page || 1);
        setTotalPages(data.pagination.totalPages || 1);
      } catch (err: any) {
        setError(err.message || 'Unable to retrieve live rides. Please check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [token, origin, destination, originLocation, destLocation, date, seats, maxCost, radiusKm, sortBy, sortOrder],
  );

  // Sync to URL and execute search when authenticated
  useEffect(() => {
    if (token && user?.verificationStatus === 'VERIFIED') {
      executeSearch(1);
    }
  }, [token, user?.verificationStatus]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextParams = new URLSearchParams();
    if (origin) nextParams.set('origin', origin);
    if (destination) nextParams.set('destination', destination);
    if (date) nextParams.set('date', date);
    if (seats > 1) nextParams.set('seats', seats.toString());
    if (maxCost) nextParams.set('maxCost', maxCost);
    if (radiusKm && radiusKm !== 3) nextParams.set('radiusKm', radiusKm.toString());
    if (sortBy !== 'departureTime') nextParams.set('sortBy', sortBy);
    if (sortOrder !== 'asc') nextParams.set('sortOrder', sortOrder);
    if (originLocation?.latitude) nextParams.set('originLat', originLocation.latitude.toString());
    if (originLocation?.longitude) nextParams.set('originLon', originLocation.longitude.toString());
    if (destLocation?.latitude) nextParams.set('destLat', destLocation.latitude.toString());
    if (destLocation?.longitude) nextParams.set('destLon', destLocation.longitude.toString());
    setSearchParams(nextParams);

    executeSearch(1);
  };

  const handleClearFilters = () => {
    setOrigin('');
    setOriginLocation(null);
    setDestination('');
    setDestLocation(null);
    setDate('');
    setSeats(1);
    setMaxCost('');
    setRadiusKm(3);
    setSortBy('departureTime');
    setSortOrder('asc');
    setSearchParams({});
    if (token && user?.verificationStatus === 'VERIFIED') {
      executeSearch(1);
    }
  };

  const handleRequestBooking = async () => {
    if (!token || !selectedRide) return;
    setBookingLoading(true);
    setBookingSuccess(null);
    setBookingError(null);

    try {
      const res = await fetch('/bookings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          rideId: selectedRide.id,
          requestedSeats,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Booking request failed (${res.status})`);
      }

      setBookingSuccess(
        `Seat request submitted to ${selectedRide.driverName}! Your request is pending driver confirmation. Available seats remain allocated after approval.`,
      );
      // Refresh current search results to update UI
      executeSearch(currentPage);
    } catch (err: any) {
      setBookingError(err.message || 'Unable to submit seat request. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="container" style={{ padding: '32px 16px 64px' }}>
      {/* Title & Introduction */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Campus Ride Discovery
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Search daily commute corridors, find verified peers traveling your way, and request seats with non-commercial fuel sharing.
        </p>
      </div>

      {/* Search & Filter Card */}
      <form
        onSubmit={handleFilterSubmit}
        style={{
          padding: '20px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          marginBottom: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Main 4 Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {/* Origin Autocomplete */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <MapPin size={13} style={{ color: '#2563eb' }} /> LEAVING FROM
            </label>
            <LocationAutocomplete
              id="rides-search-origin"
              value={origin}
              onChange={(val, loc) => {
                setOrigin(val);
                setOriginLocation(loc || null);
              }}
              selectedLocation={originLocation}
              placeholder="e.g. Vandalur, Tambaram, OMR..."
            />
          </div>

          {/* Destination Autocomplete */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <Navigation size={13} style={{ color: '#16a34a' }} /> GOING TO
            </label>
            <LocationAutocomplete
              id="rides-search-destination"
              value={destination}
              onChange={(val, loc) => {
                setDestination(val);
                setDestLocation(loc || null);
              }}
              selectedLocation={destLocation}
              placeholder="e.g. VIT Chennai Campus..."
            />
          </div>

          {/* Date Picker */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <Calendar size={13} style={{ color: 'var(--color-brand-600)' }} /> TRAVEL DATE
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: '100%',
                height: '42px',
                padding: '9px 12px',
                fontSize: '0.875rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                backgroundColor: '#ffffff',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              id="rides-filter-date"
            />
          </div>

          {/* Min Seats */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <Users size={13} style={{ color: 'var(--color-brand-600)' }} /> SEATS NEEDED
            </label>
            <select
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              style={{
                width: '100%',
                height: '42px',
                padding: '9px 12px',
                fontSize: '0.875rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                backgroundColor: '#ffffff',
                color: 'var(--text-primary)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              id="rides-filter-seats"
            >
              <option value={1}>1 Seat</option>
              <option value={2}>2 Seats</option>
              <option value={3}>3 Seats</option>
              <option value={4}>4 Seats</option>
            </select>
          </div>
        </div>

        {/* Expandable Advanced Filters Row (Milestone 5.2) */}
        {showMoreFilters && (
          <div
            style={{
              padding: '14px',
              backgroundColor: 'var(--bg-subtle, #f8fafc)',
              borderRadius: '10px',
              border: '1px solid var(--border-light, #e2e8f0)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
            }}
          >
            {/* Max Fuel Contribution Filter */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <IndianRupee size={12} style={{ color: 'var(--color-brand-600)' }} /> MAX FUEL SHARE (₹)
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                step={5}
                placeholder="e.g. 70"
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '7px 10px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                id="rides-filter-max-cost"
              />
            </div>

            {/* Geographic Search Radius */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Compass size={12} style={{ color: 'var(--color-brand-600)' }} /> SEARCH RADIUS
              </label>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '7px 10px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                id="rides-filter-radius"
              >
                <option value={3}>3 km (Standard Corridor)</option>
                <option value={5}>5 km (Wider Proximity)</option>
                <option value={10}>10 km (Extended Hub)</option>
                <option value={20}>20 km (Chennai Metro Range)</option>
              </select>
            </div>

            {/* Sort Order */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <ArrowUpDown size={12} style={{ color: 'var(--color-brand-600)' }} /> SORT RESULTS BY
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '7px 10px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                id="rides-filter-sort-by"
              >
                <option value="departureTime">Departure Time (Earliest First)</option>
                <option value="cost">Fuel Cost (Lowest First)</option>
                <option value="seats">Available Seats (Most First)</option>
              </select>
            </div>

            {/* Direction */}
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                ORDER DIRECTION
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '7px 10px',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                id="rides-filter-sort-order"
              >
                <option value="asc">Ascending (Default)</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        )}

        {/* Buttons Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowMoreFilters((p) => !p)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: showMoreFilters ? 'var(--color-brand-50, #eff6ff)' : 'none',
              border: '1px solid ' + (showMoreFilters ? 'var(--color-brand-300, #93c5fd)' : 'var(--border-light, #e2e8f0)'),
              padding: '6px 12px',
              borderRadius: '6px',
              color: showMoreFilters ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary, #475569)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            id="rides-toggle-more-filters"
          >
            <SlidersHorizontal size={13} />
            <span>{showMoreFilters ? 'Hide Extra Filters' : 'More Filters'}</span>
            {activeExtraFiltersCount > 0 && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  backgroundColor: 'var(--color-brand-600, #2563eb)',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '1px 6px',
                  marginLeft: '2px',
                }}
              >
                {activeExtraFiltersCount}
              </span>
            )}
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleClearFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              id="rides-clear-filters-btn"
            >
              <RotateCcw size={13} /> Reset Filters
            </button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={loading}
              leftIcon={<Search size={14} />}
              id="rides-filter-submit"
            >
              {loading ? 'Searching...' : 'Search Rides'}
            </Button>
          </div>
        </div>
      </form>

      {/* Institutional Gate Notice for Unauthenticated / Pending Users */}
      {!user && (
        <div
          style={{
            padding: '24px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            textAlign: 'center',
            marginBottom: '32px',
          }}
        >
          <ShieldCheck size={40} style={{ color: 'var(--color-brand-600)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
            Institutional Sign-In Required
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 20px' }}>
            Ride discovery and seat booking are strictly restricted to verified VIT Chennai students and faculty to uphold campus trust and cohort safety.
          </p>
          <Link to="/auth">
            <Button variant="primary" size="md" rightIcon={<ArrowRight size={15} />}>
              Sign In with VIT Email
            </Button>
          </Link>
        </div>
      )}

      {/* Results Header */}
      {user && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Showing <strong>{rides.length}</strong> {rides.length === 1 ? 'ride' : 'rides'}
            {totalCount > rides.length && ` of ${totalCount}`} for verified {user.audience} cohort
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', backgroundColor: '#dcfce7', padding: '3px 8px', borderRadius: '12px' }}>
            Isolated {user.audience} Network
          </span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '0.85rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => executeSearch(currentPage)}>
            Retry
          </Button>
        </div>
      )}

      {/* Rides List Grid */}
      {user && (
        <>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px', color: 'var(--color-brand-600)' }} />
              <div style={{ fontWeight: 600 }}>Scanning verified campus corridors...</div>
            </div>
          ) : rides.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid var(--border-light)',
                textAlign: 'center',
              }}
            >
              <Car size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px' }}>No Matching Rides Found</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 20px' }}>
                There are currently no active driver rides matching your corridor filters. Try expanding your search radius, adjusting departure dates, or clear filters.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
                <Link to="/offer-ride">
                  <Button variant="primary" size="sm">
                    Be the First to Offer This Ride
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {rides.map((ride) => {
                const isSelected = selectedRide?.id === ride.id;
                const isDriver = user?.id === ride.driverId;

                return (
                  <div
                    key={ride.id}
                    onClick={() => setSelectedRide(ride)}
                    style={{
                      padding: '18px',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid var(--color-brand-600)' : '1px solid var(--border-light)',
                      boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                    className="ride-result-card"
                  >
                    <div>
                      {/* Route Spine Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                          <RouteSpine
                            origin={ride.origin}
                            destination={ride.destination}
                            departureTime={formatDeparture(ride.departureTime)}
                            variant="compact"
                          />
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-brand-700)' }}>
                            ₹{ride.costPerSeat ?? 0}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>/seat</span>
                        </div>
                      </div>

                      {/* Safe Vehicle Information (Milestone 5.2 requirement) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        <Car size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                        <span style={{ fontWeight: 500 }}>
                          {ride.vehicle ? `${ride.vehicle.color} ${ride.vehicle.make} ${ride.vehicle.model}` : 'Campus Registered Car'}
                        </span>
                      </div>

                      {/* Driver & Available Seats Summary */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-light)', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: isDriver ? '#dbeafe' : 'var(--color-brand-100)',
                              color: isDriver ? '#1e40af' : 'var(--color-brand-700)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}
                          >
                            {ride.driverName.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 600 }}>{ride.driverName}</span>
                          {ride.driverRating && ride.driverRating.count > 0 ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '0.725rem',
                                fontWeight: 700,
                                color: '#b45309',
                                backgroundColor: '#fef3c7',
                                padding: '1px 6px',
                                borderRadius: '4px',
                              }}
                              id={`ride-rating-${ride.id}`}
                            >
                              <Star size={11} style={{ fill: '#eab308', color: '#eab308' }} />
                              <span>{ride.driverRating.average?.toFixed(1)}/5 ({ride.driverRating.count})</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.675rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                backgroundColor: '#f1f5f9',
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}
                            >
                              New Driver
                            </span>
                          )}
                          {isDriver && (
                            <span style={{ fontSize: '0.675rem', fontWeight: 700, color: '#1e40af', backgroundColor: '#eff6ff', padding: '1px 5px', borderRadius: '4px' }}>
                              You
                            </span>
                          )}
                        </div>
                        <SeatDots available={ride.availableSeats} />
                      </div>
                    </div>

                    <Button
                      variant={isSelected ? 'primary' : 'outline'}
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRide(ride);
                      }}
                      style={{ width: '100%' }}
                    >
                      {isDriver ? 'View Your Published Ride' : isSelected ? 'Viewing Details' : 'View Details & Book'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '32px' }}>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => executeSearch(currentPage - 1)}
                leftIcon={<ChevronLeft size={14} />}
              >
                Previous
              </Button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => executeSearch(currentPage + 1)}
                rightIcon={<ChevronRight size={14} />}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Ride Details & Seat Allocation Modal */}
      {selectedRide && (
        <Modal
          isOpen={Boolean(selectedRide)}
          onClose={() => setSelectedRide(null)}
          title="Ride Details & Seat Allocation"
          maxWidth="560px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Header Corridor Card */}
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--color-brand-50)',
                borderRadius: '10px',
                border: '1px solid var(--color-brand-200)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--color-brand-700)',
                  }}
                >
                  Verified {selectedRide.audience} Corridor
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-brand-700)' }}>
                  ₹{selectedRide.costPerSeat ?? 0} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>/seat</span>
                </span>
              </div>

              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                {selectedRide.origin} &rarr; {selectedRide.destination}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <Clock size={14} style={{ color: 'var(--color-brand-600)' }} />
                <span>{formatDeparture(selectedRide.departureTime)}</span>
              </div>
            </div>

            {/* Vehicle & Driver Safe Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Car size={13} /> Registered Vehicle
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '4px' }}>
                  {selectedRide.vehicle
                    ? `${selectedRide.vehicle.color} ${selectedRide.vehicle.make} ${selectedRide.vehicle.model}`
                    : 'Campus Registered Car'}
                </div>
                {selectedRide.vehicle && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Total Capacity: {selectedRide.vehicle.capacity} seats
                  </div>
                )}
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={13} /> Verified Driver
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{selectedRide.driverName}</span>
                  {selectedRide.driverRating && selectedRide.driverRating.count > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#b45309', fontWeight: 700, fontSize: '0.75rem', backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: '4px' }}>
                      <Star size={11} style={{ fill: '#eab308', color: '#eab308' }} />
                      <span>{selectedRide.driverRating.average?.toFixed(1)}/5 ({selectedRide.driverRating.count})</span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(New Driver)</span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {selectedRide.audience} Cohort
                </div>
              </div>
            </div>

            {/* Action State: Driver viewing own ride */}
            {user?.id === selectedRide.driverId ? (
              <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e40af', fontWeight: 700, fontSize: '0.9rem' }}>
                  <Car size={16} /> You Published This Ride
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e3a8a' }}>
                  You are the driver of this ride. You can review passenger seat requests, update departure details, or cancel this ride from your My Rides page.
                </p>
                <div style={{ marginTop: '6px' }}>
                  <Link to="/my-rides">
                    <Button variant="primary" size="sm">
                      Manage in My Rides
                    </Button>
                  </Link>
                </div>
              </div>
            ) : selectedRide.availableSeats <= 0 ? (
              <div style={{ padding: '14px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                This ride has no seats remaining.
              </div>
            ) : bookingSuccess ? (
              <div style={{ padding: '16px', backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: '6px' }}>
                  <CheckCircle2 size={18} /> Request Submitted!
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#14532d' }}>{bookingSuccess}</p>
                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                  <Link to="/bookings?tab=passenger">
                    <Button variant="primary" size="sm">
                      View in My Bookings
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setSelectedRide(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {bookingError && (
                  <div style={{ padding: '10px 14px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      <span>{bookingError}</span>
                    </div>
                    {bookingError.includes('already have an active booking') && (
                      <Link to="/bookings?tab=passenger">
                        <Button variant="outline" size="sm">
                          Go to Bookings
                        </Button>
                      </Link>
                    )}
                  </div>
                )}

                {/* Seat Counter */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>Number of Seats</label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {selectedRide.availableSeats} {selectedRide.availableSeats === 1 ? 'seat' : 'seats'} currently available
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      disabled={requestedSeats <= 1}
                      onClick={() => setRequestedSeats((p) => Math.max(1, p - 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid var(--border-medium)', background: '#fff', cursor: requestedSeats <= 1 ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                      aria-label="Decrease requested seats"
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '20px', textAlign: 'center' }}>
                      {requestedSeats}
                    </span>
                    <button
                      type="button"
                      disabled={requestedSeats >= selectedRide.availableSeats}
                      onClick={() => setRequestedSeats((p) => Math.min(selectedRide.availableSeats, p + 1))}
                      style={{ width: '32px', height: '32px', borderRadius: '6px', border: '1px solid var(--border-medium)', background: '#fff', cursor: requestedSeats >= selectedRide.availableSeats ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                      aria-label="Increase requested seats"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Fuel Contribution Breakdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '10px 14px', backgroundColor: 'var(--bg-page)', borderRadius: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Estimated Fuel Contribution:</span>
                  <strong>₹{(selectedRide.costPerSeat ?? 0) * requestedSeats} ({requestedSeats} × ₹{selectedRide.costPerSeat ?? 0})</strong>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  disabled={bookingLoading}
                  onClick={handleRequestBooking}
                  leftIcon={bookingLoading ? <Loader2 size={16} className="animate-spin" /> : <Ticket size={16} />}
                  id="btn-confirm-seat-request"
                  style={{ width: '100%' }}
                >
                  {bookingLoading ? 'Submitting Request...' : `Request ${requestedSeats} Seat${requestedSeats > 1 ? 's' : ''}`}
                </Button>
              </div>
            )}

            {/* Privacy notice invariant */}
            <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={12} style={{ color: '#64748b', flexShrink: 0 }} />
              <span>
                <strong>Campus Privacy:</strong> Landmark pickup/dropoff descriptions and driver phone contacts are securely disclosed only after the driver confirms your booking request.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
