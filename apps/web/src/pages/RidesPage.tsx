import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useLocation } from 'react-router-dom';
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
  Share2,
  X,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { RouteSpine } from '../components/common/RouteSpine';
import { SeatDots } from '../components/common/SeatDots';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
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

  const [date, setDate] = useState(searchParams.get('departureDate') || searchParams.get('date') || '');
  const [seats, setSeats] = useState<number>(() => {
    const s = searchParams.get('minSeats') || searchParams.get('seats');
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

  // Ride Type Filter: 'ALL' | 'VEHICLE_RIDE' | 'CAB_SHARE'
  const [rideTypeFilter, setRideTypeFilter] = useState<'ALL' | 'VEHICLE_RIDE' | 'CAB_SHARE'>(() => {
    const rt = searchParams.get('rideType');
    return rt === 'VEHICLE_RIDE' || rt === 'CAB_SHARE' ? rt : 'ALL';
  });

  // Dedicated Filter & Refine Modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // Date helpers for quick filter chips
  const getTodayStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

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

  const location = useLocation();
  const targetRideId = searchParams.get('rideId');
  const [sharedRideError, setSharedRideError] = useState<string | null>(null);

  // Auto-fetch and open shared ride if rideId parameter is present
  useEffect(() => {
    if (!targetRideId || !token) return;

    let isMounted = true;
    fetch(`/api/rides/${targetRideId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Ride unavailable');
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setSelectedRide(data);
          setSharedRideError(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSharedRideError(
            'This shared ride is no longer available, was cancelled, or is not accessible to your campus community.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [targetRideId, token]);

  const handleShareWhatsApp = (ride: PublicRideSummaryDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const dateStr = new Date(ride.departureTime).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const timeStr = new Date(ride.departureTime).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const shareUrl = `${window.location.origin}/rides?rideId=${ride.id}`;
    const text = `VIT Carpool: ${ride.origin} → ${ride.destination}\n📅 ${dateStr} at ${timeStr}\n🔗 View & book: ${shareUrl}\n(Requires verified VIT login)`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const totalActiveFiltersCount =
    (date ? 1 : 0) +
    (seats > 1 ? 1 : 0) +
    (maxCost ? 1 : 0) +
    (radiusKm !== 3 ? 1 : 0) +
    (sortBy !== 'departureTime' || sortOrder !== 'asc' ? 1 : 0);

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
    async (
      pageToFetch = 1,
      overrides?: {
        origin?: string;
        destination?: string;
        originLoc?: LocationSuggestionDto | null;
        destLoc?: LocationSuggestionDto | null;
        date?: string;
        seats?: number;
        maxCost?: string;
        radiusKm?: number;
        sortBy?: 'departureTime' | 'cost' | 'seats';
        sortOrder?: 'asc' | 'desc';
        rideType?: 'ALL' | 'VEHICLE_RIDE' | 'CAB_SHARE';
      },
    ) => {
      if (!token) return;

      const curOrigin = overrides?.origin !== undefined ? overrides.origin : origin;
      const curDest = overrides?.destination !== undefined ? overrides.destination : destination;
      const curOriginLoc = overrides?.originLoc !== undefined ? overrides.originLoc : originLocation;
      const curDestLoc = overrides?.destLoc !== undefined ? overrides.destLoc : destLocation;
      const curDate = overrides?.date !== undefined ? overrides.date : date;
      const curSeats = overrides?.seats !== undefined ? overrides.seats : seats;
      const curMaxCost = overrides?.maxCost !== undefined ? overrides.maxCost : maxCost;
      const curRadiusKm = overrides?.radiusKm !== undefined ? overrides.radiusKm : radiusKm;
      const curSortBy = overrides?.sortBy !== undefined ? overrides.sortBy : sortBy;
      const curSortOrder = overrides?.sortOrder !== undefined ? overrides.sortOrder : sortOrder;
      const curRideType = overrides?.rideType !== undefined ? overrides.rideType : rideTypeFilter;

      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        if (curRideType && curRideType !== 'ALL') {
          queryParams.set('rideType', curRideType);
        }
        if (curOrigin.trim()) queryParams.set('origin', curOrigin.trim());
        if (curDest.trim()) queryParams.set('destination', curDest.trim());
        if (curOriginLoc?.latitude !== undefined && curOriginLoc?.longitude !== undefined) {
          queryParams.set('originLat', curOriginLoc.latitude.toString());
          queryParams.set('originLon', curOriginLoc.longitude.toString());
          if (curRadiusKm) queryParams.set('radiusKm', curRadiusKm.toString());
        }
        if (curDestLoc?.latitude !== undefined && curDestLoc?.longitude !== undefined) {
          queryParams.set('destLat', curDestLoc.latitude.toString());
          queryParams.set('destLon', curDestLoc.longitude.toString());
          if (curRadiusKm) queryParams.set('radiusKm', curRadiusKm.toString());
        }
        if (curDate.trim()) queryParams.set('departureDate', curDate.trim());
        if (curSeats > 1) queryParams.set('minSeats', curSeats.toString());
        if (curMaxCost.trim() && !isNaN(Number(curMaxCost))) {
          queryParams.set('maxCost', Math.max(0, parseInt(curMaxCost, 10)).toString());
        }
        queryParams.set('sortBy', curSortBy);
        queryParams.set('sortOrder', curSortOrder);
        queryParams.set('page', pageToFetch.toString());
        queryParams.set('limit', '8');

        const res = await fetch(`/api/rides?${queryParams.toString()}`, {
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
    [token, origin, destination, originLocation, destLocation, date, seats, maxCost, radiusKm, sortBy, sortOrder, rideTypeFilter],
  );

  // Unified helper to apply sort/filter updates, sync URL query params, and execute search immediately
  const applyFilterUpdates = (updates: {
    origin?: string;
    destination?: string;
    date?: string;
    seats?: number;
    maxCost?: string;
    radiusKm?: number;
    sortBy?: 'departureTime' | 'cost' | 'seats';
    sortOrder?: 'asc' | 'desc';
    originLocation?: LocationSuggestionDto | null;
    destLocation?: LocationSuggestionDto | null;
    rideType?: 'ALL' | 'VEHICLE_RIDE' | 'CAB_SHARE';
  }) => {
    const nextOrigin = updates.origin !== undefined ? updates.origin : origin;
    const nextDestination = updates.destination !== undefined ? updates.destination : destination;
    const nextDate = updates.date !== undefined ? updates.date : date;
    const nextSeats = updates.seats !== undefined ? updates.seats : seats;
    const nextMaxCost = updates.maxCost !== undefined ? updates.maxCost : maxCost;
    const nextRadiusKm = updates.radiusKm !== undefined ? updates.radiusKm : radiusKm;
    const nextSortBy = updates.sortBy !== undefined ? updates.sortBy : sortBy;
    const nextSortOrder = updates.sortOrder !== undefined ? updates.sortOrder : sortOrder;
    const nextOriginLoc = updates.originLocation !== undefined ? updates.originLocation : originLocation;
    const nextDestLoc = updates.destLocation !== undefined ? updates.destLocation : destLocation;
    const nextRideType = updates.rideType !== undefined ? updates.rideType : rideTypeFilter;

    if (updates.origin !== undefined) setOrigin(updates.origin);
    if (updates.destination !== undefined) setDestination(updates.destination);
    if (updates.date !== undefined) setDate(updates.date);
    if (updates.seats !== undefined) setSeats(updates.seats);
    if (updates.maxCost !== undefined) setMaxCost(updates.maxCost);
    if (updates.radiusKm !== undefined) setRadiusKm(updates.radiusKm);
    if (updates.sortBy !== undefined) setSortBy(updates.sortBy);
    if (updates.sortOrder !== undefined) setSortOrder(updates.sortOrder);
    if (updates.originLocation !== undefined) setOriginLocation(updates.originLocation);
    if (updates.destLocation !== undefined) setDestLocation(updates.destLocation);
    if (updates.rideType !== undefined) setRideTypeFilter(updates.rideType);

    const nextParams = new URLSearchParams();
    if (nextRideType && nextRideType !== 'ALL') nextParams.set('rideType', nextRideType);
    if (nextOrigin) nextParams.set('origin', nextOrigin);
    if (nextDestination) nextParams.set('destination', nextDestination);
    if (nextDate) nextParams.set('date', nextDate);
    if (nextSeats > 1) nextParams.set('seats', nextSeats.toString());
    if (nextMaxCost) nextParams.set('maxCost', nextMaxCost);
    if (nextRadiusKm && nextRadiusKm !== 3) nextParams.set('radiusKm', nextRadiusKm.toString());
    if (nextSortBy !== 'departureTime') nextParams.set('sortBy', nextSortBy);
    if (nextSortOrder !== 'asc') nextParams.set('sortOrder', nextSortOrder);
    if (nextOriginLoc?.latitude) nextParams.set('originLat', nextOriginLoc.latitude.toString());
    if (nextOriginLoc?.longitude) nextParams.set('originLon', nextOriginLoc.longitude.toString());
    if (nextDestLoc?.latitude) nextParams.set('destLat', nextDestLoc.latitude.toString());
    if (nextDestLoc?.longitude) nextParams.set('destLon', nextDestLoc.longitude.toString());
    setSearchParams(nextParams);

    executeSearch(1, {
      origin: nextOrigin,
      destination: nextDestination,
      originLoc: nextOriginLoc,
      destLoc: nextDestLoc,
      date: nextDate,
      seats: nextSeats,
      maxCost: nextMaxCost,
      radiusKm: nextRadiusKm,
      sortBy: nextSortBy,
      sortOrder: nextSortOrder,
      rideType: nextRideType,
    });
  };

  // Sync to URL and execute search when authenticated
  useEffect(() => {
    if (token && user?.verificationStatus === 'VERIFIED') {
      executeSearch(1);
    }
  }, [token, user?.verificationStatus]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextParams = new URLSearchParams();
    if (rideTypeFilter && rideTypeFilter !== 'ALL') nextParams.set('rideType', rideTypeFilter);
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
      const res = await fetch('/api/bookings', {
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
    <PageShell width="wide">
      <PageHeader
        title="Campus Ride Discovery"
        description="Search daily commute corridors, find verified peers traveling your way, and split the fuel cost."
        action={
          <Link to="/ride-alerts" style={{ textDecoration: 'none' }}>
            <Button variant="outline" size="sm">
              Create Alert
            </Button>
          </Link>
        }
      />

      {/* Sleek Segmented Switcher: Find a Ride vs Offer a Ride */}
      <div className="commute-mode-segmented-bar" id="ride-mode-switcher-banner">
        <div className="commute-mode-segment active" aria-current="page">
          <Search size={15} />
          <span>Find a Ride</span>
        </div>
        <Link to="/offer-ride" className="commute-mode-segment" id="btn-switch-to-offer-ride">
          <Car size={15} style={{ color: '#16a34a' }} />
          <span>Offer a Ride</span>
          <span className="commute-mode-badge">Host</span>
          <span className="sr-only">Have empty seats in your car?</span>
        </Link>
      </div>

      {/* Search & Filter Card */}
      <form
        onSubmit={handleFilterSubmit}
        className="rides-filter-card"
      >
        {/* Main 4 Inputs Grid */}
        <div className="rides-filter-grid">
          {/* Origin Autocomplete */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <MapPin size={14} style={{ color: '#2563eb' }} /> Leaving from
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
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Navigation size={14} style={{ color: '#16a34a' }} /> Going to
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

          {/* Travel Date & Seats Needed in a Responsive Pair Group */}
          <div className="rides-filter-date-seats-group">
            {/* Date Picker */}
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Calendar size={14} style={{ color: 'var(--color-brand-600)' }} /> Travel date
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
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Users size={14} style={{ color: 'var(--color-brand-600)' }} /> Seats needed
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
        </div>

        {/* Search Form Action Controls */}
        <div className="rides-filter-actions">
          <div className="rides-filter-secondary-actions">
            <button
              type="button"
              onClick={handleClearFilters}
              className="rides-filter-reset-btn"
              id="rides-clear-filters-btn"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterModalOpen(true)}
              className={`rides-filter-btn-trigger ${totalActiveFiltersCount > 0 ? 'active' : ''}`}
              id="rides-toggle-more-filters"
              title="Open full filter settings dialog"
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {totalActiveFiltersCount > 0 && (
                <span className="rides-filter-count-badge">
                  {totalActiveFiltersCount}
                </span>
              )}
            </button>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={loading}
            leftIcon={<Search size={15} />}
            id="rides-filter-submit"
            className="rides-filter-submit-btn"
          >
            {loading ? 'Searching...' : 'Search Rides'}
          </Button>
        </div>
      </form>

      {/* Ride Type Filter Tabs (All / Vehicle Rides / Cab Shares) */}
      {user && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
          role="tablist"
          id="rides-filter-type-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rideTypeFilter === 'ALL'}
            onClick={() => applyFilterUpdates({ rideType: 'ALL' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: rideTypeFilter === 'ALL' ? 700 : 500,
              borderRadius: '8px',
              border: `1px solid ${rideTypeFilter === 'ALL' ? 'var(--color-brand-600, #2563eb)' : 'var(--border-medium, #cbd5e1)'}`,
              backgroundColor: rideTypeFilter === 'ALL' ? 'var(--color-brand-50, #eff6ff)' : '#ffffff',
              color: rideTypeFilter === 'ALL' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            id="filter-type-all"
          >
            <span>🌐 All Commutes</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={rideTypeFilter === 'VEHICLE_RIDE'}
            onClick={() => applyFilterUpdates({ rideType: 'VEHICLE_RIDE' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: rideTypeFilter === 'VEHICLE_RIDE' ? 700 : 500,
              borderRadius: '8px',
              border: `1px solid ${rideTypeFilter === 'VEHICLE_RIDE' ? '#2563eb' : 'var(--border-medium, #cbd5e1)'}`,
              backgroundColor: rideTypeFilter === 'VEHICLE_RIDE' ? '#eff6ff' : '#ffffff',
              color: rideTypeFilter === 'VEHICLE_RIDE' ? '#1d4ed8' : 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            id="filter-type-vehicle"
          >
            <Car size={14} />
            <span>Vehicle Rides</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={rideTypeFilter === 'CAB_SHARE'}
            onClick={() => applyFilterUpdates({ rideType: 'CAB_SHARE' })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: rideTypeFilter === 'CAB_SHARE' ? 700 : 500,
              borderRadius: '8px',
              border: `1px solid ${rideTypeFilter === 'CAB_SHARE' ? '#d97706' : 'var(--border-medium, #cbd5e1)'}`,
              backgroundColor: rideTypeFilter === 'CAB_SHARE' ? '#fffbeb' : '#ffffff',
              color: rideTypeFilter === 'CAB_SHARE' ? '#92400e' : 'var(--text-secondary, #475569)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            id="filter-type-cab-share"
          >
            <Users size={14} style={{ color: '#d97706' }} />
            <span>Cab Shares</span>
          </button>
        </div>
      )}

      {/* Results Header with Dynamic Sort & Filter Controls */}
      {user && (
        <div className="rides-sort-filter-bar">
          <div className="rides-sort-filter-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.925rem', color: 'var(--text-secondary)' }}>
                Showing <strong>{rides.length}</strong> {rides.length === 1 ? 'ride' : 'rides'}
                {totalCount > rides.length && ` of ${totalCount}`}
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#15803d',
                  backgroundColor: '#dcfce7',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  whiteSpace: 'nowrap',
                }}
              >
                Verified {user.audience} Network
              </span>
            </div>

            <div className="rides-sort-filter-controls">
              {/* Sort By Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpDown size={14} style={{ color: 'var(--color-brand-600)' }} />
                <select
                  value={`${sortBy}:${sortOrder}`}
                  onChange={(e) => {
                    const [f, o] = e.target.value.split(':') as ['departureTime' | 'cost' | 'seats', 'asc' | 'desc'];
                    applyFilterUpdates({ sortBy: f, sortOrder: o });
                  }}
                  className="rides-sort-select"
                  id="rides-quick-sort-select"
                  aria-label="Sort rides by"
                >
                  <option value="departureTime:asc">Departure: Earliest First</option>
                  <option value="departureTime:desc">Departure: Latest First</option>
                  <option value="cost:asc">Fuel Share: Lowest First</option>
                  <option value="seats:desc">Seats: Most Available</option>
                </select>
              </div>

              {/* Advanced Filter Modal Trigger */}
              <button
                type="button"
                onClick={() => setFilterModalOpen(true)}
                className={`rides-filter-modal-btn ${totalActiveFiltersCount > 0 ? 'has-active' : ''}`}
                id="btn-open-filter-modal"
                title="Open detailed filters dialog"
              >
                <SlidersHorizontal size={14} />
                <span>Filters</span>
                {totalActiveFiltersCount > 0 && (
                  <span className="rides-filter-badge" id="badge-active-filters-count">
                    {totalActiveFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Quick Filter Chips Row */}
          <div className="rides-quick-chips-row" id="rides-quick-chips-row">
            {/* Quick Sort: Earliest */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ sortBy: 'departureTime', sortOrder: 'asc' })}
              className={`rides-quick-chip ${sortBy === 'departureTime' && sortOrder === 'asc' ? 'active' : ''}`}
              id="chip-sort-earliest"
            >
              <Clock size={12} />
              <span>Earliest</span>
            </button>

            {/* Quick Sort: Lowest Fuel Cost */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ sortBy: 'cost', sortOrder: 'asc' })}
              className={`rides-quick-chip ${sortBy === 'cost' && sortOrder === 'asc' ? 'active' : ''}`}
              id="chip-sort-lowest-cost"
            >
              <IndianRupee size={12} />
              <span>Lowest Cost</span>
            </button>

            {/* Quick Sort: Most Seats */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ sortBy: 'seats', sortOrder: 'desc' })}
              className={`rides-quick-chip ${sortBy === 'seats' && sortOrder === 'desc' ? 'active' : ''}`}
              id="chip-sort-most-seats"
            >
              <Users size={12} />
              <span>Most Seats</span>
            </button>

            {/* Quick Filter: Today */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ date: date === getTodayStr() ? '' : getTodayStr() })}
              className={`rides-quick-chip ${date === getTodayStr() ? 'active' : ''}`}
              id="chip-filter-today"
            >
              <Calendar size={12} />
              <span>Today</span>
            </button>

            {/* Quick Filter: Tomorrow */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ date: date === getTomorrowStr() ? '' : getTomorrowStr() })}
              className={`rides-quick-chip ${date === getTomorrowStr() ? 'active' : ''}`}
              id="chip-filter-tomorrow"
            >
              <Calendar size={12} />
              <span>Tomorrow</span>
            </button>

            {/* Quick Filter: Max ₹50 */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ maxCost: maxCost === '50' ? '' : '50' })}
              className={`rides-quick-chip ${maxCost === '50' ? 'active' : ''}`}
              id="chip-filter-cost-50"
            >
              <IndianRupee size={12} />
              <span>≤ ₹50</span>
            </button>

            {/* Quick Filter: Max ₹100 */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ maxCost: maxCost === '100' ? '' : '100' })}
              className={`rides-quick-chip ${maxCost === '100' ? 'active' : ''}`}
              id="chip-filter-cost-100"
            >
              <IndianRupee size={12} />
              <span>≤ ₹100</span>
            </button>

            {/* Quick Filter: 2+ Seats */}
            <button
              type="button"
              onClick={() => applyFilterUpdates({ seats: seats === 2 ? 1 : 2 })}
              className={`rides-quick-chip ${seats === 2 ? 'active' : ''}`}
              id="chip-filter-seats-2"
            >
              <Users size={12} />
              <span>2+ Seats</span>
            </button>

            {/* Reset All Quick Chip (if filters active) */}
            {totalActiveFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="rides-quick-chip rides-quick-chip-clear"
                id="chip-filter-clear-all"
                title="Reset all search filters and sorts"
              >
                <X size={12} />
                <span>Reset ({totalActiveFiltersCount})</span>
              </button>
            )}
          </div>
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

      {/* Shared Ride Inaccessible Alert */}
      {sharedRideError && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          id="shared-ride-error-banner"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{sharedRideError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSharedRideError(null)}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Logged-Out Campus Community Prompt */}
      {!user && (
        <div
          style={{
            padding: '48px 24px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            textAlign: 'center',
            maxWidth: '600px',
            margin: '24px auto',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
          id="logged-out-signin-banner"
        >
          <ShieldCheck size={44} style={{ color: 'var(--color-brand-600)', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Sign In with Your VIT Email to View Active Rides
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
            To safeguard community privacy and enforce separate student and faculty communities, departure times
            and seat availability are visible exclusively to authenticated campus members.
          </p>
          <Link to={`/auth?redirect=${encodeURIComponent(location.pathname + location.search)}`}>
            <Button variant="primary" size="lg" leftIcon={<ShieldCheck size={18} />} id="btn-prompt-signin">
              Sign In to View &amp; Book Rides
            </Button>
          </Link>
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
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
                <Link to="/ride-alerts">
                  <Button variant="outline" size="sm">
                    Get Notified (Create Alert)
                  </Button>
                </Link>
                <Link to="/offer-ride">
                  <Button variant="primary" size="sm">
                    Be the First to Offer This Ride
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="rides-cards-grid">
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
                      {/* Top Badges Row: CAB SHARE & Corridor Match Indicator */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {ride.rideType === 'CAB_SHARE' && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                            }}
                            id={`badge-cab-share-${ride.id}`}
                          >
                            <Users size={11} />
                            CAB SHARE
                          </span>
                        )}

                        {ride.match && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor:
                                ride.match.isFallbackGeometry
                                  ? '#fffbeb'
                                  : ride.match.matchType === 'EXACT'
                                  ? '#ecfdf5'
                                  : ride.match.matchType === 'ALONG_ROUTE'
                                  ? '#eff6ff'
                                  : '#f8fafc',
                              color:
                                ride.match.isFallbackGeometry
                                  ? '#b45309'
                                  : ride.match.matchType === 'EXACT'
                                  ? '#047857'
                                  : ride.match.matchType === 'ALONG_ROUTE'
                                  ? '#1d4ed8'
                                  : '#475569',
                              border: `1px solid ${
                                ride.match.isFallbackGeometry
                                  ? '#fde68a'
                                  : ride.match.matchType === 'EXACT'
                                  ? '#a7f3d0'
                                  : ride.match.matchType === 'ALONG_ROUTE'
                                  ? '#bfdbfe'
                                  : '#e2e8f0'
                              }`,
                            }}
                          >
                            <Navigation size={11} />
                            {ride.match.isFallbackGeometry
                              ? 'Estimated Corridor'
                              : ride.match.matchType === 'EXACT'
                              ? 'Exact Route Match'
                              : ride.match.matchType === 'ALONG_ROUTE'
                              ? 'Along Your Route'
                              : 'Endpoint Match'}
                          </span>
                        )}

                        {ride.match?.matchReasons && ride.match.matchReasons.length > 0 && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: '#64748b',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '220px',
                            }}
                            title={ride.match.matchReasons.join(' • ')}
                          >
                            {ride.match.matchReasons[0]}
                          </span>
                        )}
                      </div>

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
                          {ride.rideType === 'CAB_SHARE' && ride.cabShare ? (
                            <>
                              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#92400e' }}>
                                ₹{ride.cabShare.currentPerPerson}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                                Est. /person
                              </span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-brand-700)' }}>
                                ₹{ride.costPerSeat ?? 0}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>/seat</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Safe Vehicle or Cab Service Information */}
                      {ride.rideType === 'CAB_SHARE' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <Users size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ride.cabShare?.cabService || 'Commercial Shared Cab'} &bull; Total: ₹{ride.cabShare?.estimatedTotalFare}
                            </span>
                          </div>
                          {ride.cabShare?.bookingDeadline && (
                            <span
                              style={{
                                fontSize: '0.675rem',
                                fontWeight: 600,
                                color: '#92400e',
                                backgroundColor: '#fef3c7',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                flexShrink: 0,
                              }}
                              title="Booking cutoff deadline"
                            >
                              Cutoff: {formatDeparture(ride.cabShare.bookingDeadline)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            {ride.vehicle?.imageUrl ? (
                              <img
                                src={ride.vehicle.imageUrl}
                                alt="Car"
                                style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }}
                              />
                            ) : (
                              <Car size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                            )}
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ride.vehicle ? `${ride.vehicle.color} ${ride.vehicle.make} ${ride.vehicle.model}` : 'Campus Registered Car'}
                            </span>
                          </div>
                          {ride.vehicle?.imageUrl && (
                            <span
                              style={{
                                fontSize: '0.675rem',
                                fontWeight: 600,
                                color: '#1d4ed8',
                                backgroundColor: '#eff6ff',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                flexShrink: 0,
                              }}
                            >
                              Photo Attached
                            </span>
                          )}
                        </div>
                      )}

                      {/* Driver / Organiser & Available Seats Summary */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-light)', fontSize: '0.8rem', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                          {ride.driverAvatarUrl ? (
                            <img
                              src={ride.driverAvatarUrl}
                              alt={ride.driverName}
                              style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                backgroundColor: ride.rideType === 'CAB_SHARE' ? '#fef3c7' : 'var(--color-brand-100)',
                                color: ride.rideType === 'CAB_SHARE' ? '#92400e' : 'var(--color-brand-700)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                flexShrink: 0,
                              }}
                            >
                              {ride.driverName.charAt(0)}
                            </div>
                          )}
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ride.driverName}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({ride.rideType === 'CAB_SHARE' ? 'Organiser' : 'Driver'})
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <SeatDots
                            available={ride.availableSeats}
                            total={ride.rideType === 'CAB_SHARE' && ride.cabShare ? ride.cabShare.totalCapacity - 1 : (ride.availableSeats + 1)}
                          />
                          <span style={{ fontWeight: 600, color: ride.availableSeats > 0 ? '#15803d' : '#991b1b' }}>
                            {ride.availableSeats} {ride.availableSeats === 1 ? 'seat' : 'seats'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Button
                        variant={isSelected ? 'primary' : 'outline'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRide(ride);
                        }}
                        style={{ flex: 1 }}
                      >
                        {isDriver ? 'View Your Published Ride' : isSelected ? 'Viewing Details' : 'View Details & Book'}
                      </Button>
                      <button
                        type="button"
                        onClick={(e) => handleShareWhatsApp(ride, e)}
                        title="Share this ride via WhatsApp"
                        aria-label="Share this ride via WhatsApp"
                        id={`btn-share-ride-${ride.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          border: '1px solid #bbf7d0',
                          backgroundColor: '#f0fdf4',
                          color: '#15803d',
                          cursor: 'pointer',
                          flexShrink: 0,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Share2 size={15} />
                      </button>
                    </div>
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
      {selectedRide && (() => {
        const isCab = selectedRide.rideType === 'CAB_SHARE';
        const isCabDeadlinePassed = Boolean(
          isCab &&
          selectedRide.cabShare?.bookingDeadline &&
          new Date(selectedRide.cabShare.bookingDeadline).getTime() <= Date.now()
        );

        return (
          <Modal
            isOpen={Boolean(selectedRide)}
            onClose={() => setSelectedRide(null)}
            title={isCab ? 'Shared Cab Details & Seat Request' : 'Ride Details & Seat Allocation'}
            maxWidth="560px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Header Corridor Card */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: isCab ? '#fffbeb' : 'var(--color-brand-50)',
                  borderRadius: '10px',
                  border: `1px solid ${isCab ? '#fde68a' : 'var(--color-brand-200)'}`,
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
                      color: isCab ? '#92400e' : 'var(--color-brand-700)',
                    }}
                  >
                    {isCab ? `Verified ${selectedRide.audience} Shared Cab` : `Verified ${selectedRide.audience} Corridor`}
                  </span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isCab ? '#92400e' : 'var(--color-brand-700)' }}>
                    ₹{isCab && selectedRide.cabShare ? selectedRide.cabShare.currentPerPerson : (selectedRide.costPerSeat ?? 0)}{' '}
                    <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                      {isCab ? '/person (est)' : '/seat'}
                    </span>
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  {selectedRide.origin} &rarr; {selectedRide.destination}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Clock size={14} style={{ color: isCab ? '#d97706' : 'var(--color-brand-600)' }} />
                  <span>Departure: {formatDeparture(selectedRide.departureTime)}</span>
                </div>
              </div>

              {/* Intelligent Corridor Match Insights */}
              {selectedRide.match && (
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor:
                      selectedRide.match.matchType === 'EXACT'
                        ? '#f0fdf4'
                        : selectedRide.match.matchType === 'ALONG_ROUTE'
                        ? '#eff6ff'
                        : '#f8fafc',
                    borderRadius: '8px',
                    border: `1px solid ${
                      selectedRide.match.matchType === 'EXACT'
                        ? '#bbf7d0'
                        : selectedRide.match.matchType === 'ALONG_ROUTE'
                        ? '#bfdbfe'
                        : '#e2e8f0'
                    }`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        color:
                          selectedRide.match.matchType === 'EXACT'
                            ? '#15803d'
                            : selectedRide.match.matchType === 'ALONG_ROUTE'
                            ? '#1d4ed8'
                            : '#475569',
                      }}
                    >
                      <Navigation size={13} />
                      {selectedRide.match.matchType === 'EXACT'
                        ? 'Exact Route Match'
                        : selectedRide.match.matchType === 'ALONG_ROUTE'
                        ? 'Along Cab/Driver Route'
                        : 'Endpoint Match'}
                    </span>
                    {selectedRide.match.isFallbackGeometry && (
                      <span style={{ fontSize: '0.675rem', color: '#64748b', fontWeight: 600 }}>
                        Estimated Corridor
                      </span>
                    )}
                  </div>

                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: '18px',
                      fontSize: '0.75rem',
                      color: '#334155',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                    }}
                  >
                    {selectedRide.match.matchReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cab Share Breakdown vs Vehicle Details */}
              {isCab ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Organiser Profile & Cab Service */}
                  <div className="responsive-two-col" style={{ gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} /> Journey Organiser
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                        {selectedRide.driverAvatarUrl ? (
                          <img
                            src={selectedRide.driverAvatarUrl}
                            alt={selectedRide.driverName}
                            style={{ width: '38px', height: '38px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              flexShrink: 0,
                            }}
                          >
                            {selectedRide.driverName.charAt(0)}
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {selectedRide.driverName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Organiser occupies 1 seat &bull; {selectedRide.audience}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} /> Commercial Cab Service
                      </div>
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          {selectedRide.cabShare?.cabService || 'External Commercial Cab'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Capacity: {selectedRide.cabShare?.totalCapacity} seats ({selectedRide.availableSeats} seats left)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transparent Fare Split Card */}
                  {selectedRide.cabShare && (
                    <div
                      style={{
                        padding: '14px',
                        backgroundColor: '#f0fdf4',
                        borderRadius: '8px',
                        border: '1px solid #bbf7d0',
                        fontSize: '0.825rem',
                        color: '#166534',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Fare Split Details</span>
                        <span style={{ fontSize: '1rem', fontWeight: 800 }}>Total: ₹{selectedRide.cabShare.estimatedTotalFare}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem' }}>
                        <span>Estimated share if cab is completely full:</span>
                        <strong>~₹{selectedRide.cabShare.estimatedPerPersonIfFull} / person</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem' }}>
                        <span>Current share ({selectedRide.cabShare.totalConfirmedParticipants} confirmed participant{selectedRide.cabShare.totalConfirmedParticipants > 1 ? 's' : ''}):</span>
                        <strong>~₹{selectedRide.cabShare.currentPerPerson} / person</strong>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: '#15803d', fontStyle: 'italic', marginTop: '2px' }}>
                        Fair integer rupee division is guaranteed. Any small 1-rupee remainder is allocated fairly.
                      </div>
                    </div>
                  )}

                  {/* Booking Cutoff Warning */}
                  {selectedRide.cabShare?.bookingDeadline && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: isCabDeadlinePassed ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${isCabDeadlinePassed ? '#fecaca' : '#fde68a'}`,
                        color: isCabDeadlinePassed ? '#991b1b' : '#92400e',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Clock size={15} style={{ flexShrink: 0 }} />
                      <span>
                        {isCabDeadlinePassed
                          ? `Booking cutoff passed on ${formatDeparture(selectedRide.cabShare.bookingDeadline)}. No new bookings accepted.`
                          : `Booking Deadline: ${formatDeparture(selectedRide.cabShare.bookingDeadline)}.`}
                      </span>
                    </div>
                  )}

                  {/* Commercial Cab Disclaimer */}
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.75rem',
                      color: '#475569',
                      lineHeight: '1.4',
                    }}
                  >
                    <strong>Campus Disclaimer:</strong> This journey is arranged through an external commercial cab service (such as Uber, Ola, or local taxi). The organiser is a fellow student or faculty member sharing the actual trip cost, not a verified driver. Fares are divided equally among confirmed passengers.
                  </div>
                </div>
              ) : (
                <>
                  {/* Vehicle Appearance (Car Image) Banner */}
                  {selectedRide.vehicle?.imageUrl && (
                    <div
                      id="booking-vehicle-photo-banner"
                      style={{
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <div style={{ position: 'relative', width: '100%', height: '180px', backgroundColor: '#0f172a' }}>
                        <img
                          src={selectedRide.vehicle.imageUrl}
                          alt={`${selectedRide.vehicle.color} ${selectedRide.vehicle.make} ${selectedRide.vehicle.model}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            right: '8px',
                            backgroundColor: 'rgba(15, 23, 42, 0.78)',
                            backdropFilter: 'blur(6px)',
                            color: '#ffffff',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <Car size={13} style={{ color: '#60a5fa' }} />
                            <span>Vehicle Appearance &bull; This is how the car looks</span>
                          </span>
                          <span style={{ color: '#cbd5e1', fontSize: '10px' }}>
                            {selectedRide.vehicle.color} {selectedRide.vehicle.make} {selectedRide.vehicle.model}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Vehicle & Driver Safe Info */}
                  <div className="responsive-two-col" style={{ gap: '12px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Car size={13} /> Registered Vehicle
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                        {selectedRide.vehicle?.imageUrl && (
                          <img
                            src={selectedRide.vehicle.imageUrl}
                            alt="Vehicle thumbnail"
                            style={{ width: '38px', height: '38px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }}
                          />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
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
                      </div>
                    </div>

                    <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={13} /> Verified Driver
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                        {selectedRide.driverAvatarUrl ? (
                          <img
                            src={selectedRide.driverAvatarUrl}
                            alt={selectedRide.driverName}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              flexShrink: 0,
                              border: '1px solid var(--border-light)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--color-brand-100)',
                              color: 'var(--color-brand-700)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              flexShrink: 0,
                            }}
                          >
                            {selectedRide.driverName.charAt(0)}
                          </div>
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{selectedRide.driverName}</span>
                            {selectedRide.driverRating && selectedRide.driverRating.count > 0 ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  color: '#854d0e',
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  backgroundColor: '#fefce8',
                                  border: '1px solid #fef08a',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Star size={11} style={{ fill: '#eab308', color: '#eab308', flexShrink: 0 }} />
                                <span>{selectedRide.driverRating.average?.toFixed(1)} / 5</span>
                                <span style={{ color: '#a16207', fontWeight: 500, fontSize: '0.675rem' }}>
                                  ({selectedRide.driverRating.count} {selectedRide.driverRating.count === 1 ? 'review' : 'reviews'})
                                </span>
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
                    </div>
                  </div>
                </>
              )}

              {/* Action State: Driver viewing own ride */}
              {user?.id === selectedRide.driverId ? (
                <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e40af', fontWeight: 700, fontSize: '0.9rem' }}>
                    <Car size={16} /> {isCab ? 'You Organised This Shared Cab' : 'You Published This Ride'}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e3a8a' }}>
                    {isCab
                      ? 'You are the organiser of this shared cab. You can manage passenger bookings, update final cab fares, or cancel this journey from My Rides.'
                      : 'You are the driver of this ride. You can review passenger seat requests, update departure details, or cancel this ride from your My Rides page.'}
                  </p>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Link to="/my-rides">
                      <Button variant="primary" size="sm">
                        Manage in My Rides
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => handleShareWhatsApp(selectedRide)}
                      leftIcon={<Share2 size={15} style={{ color: '#15803d' }} />}
                      id="btn-modal-share-whatsapp"
                      style={{ borderColor: '#bbf7d0', color: '#15803d' }}
                    >
                      Share via WhatsApp
                    </Button>
                  </div>
                </div>
              ) : isCabDeadlinePassed ? (
                <div style={{ padding: '14px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                  Booking deadline for this cab share has passed. No additional requests can be accepted.
                </div>
              ) : selectedRide.availableSeats <= 0 ? (
                <div style={{ padding: '14px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center', fontWeight: 600 }}>
                  This {isCab ? 'cab share' : 'ride'} has no seats remaining.
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

                  {/* Fuel or Fare Share Breakdown */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '10px 14px', backgroundColor: 'var(--bg-page)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {isCab ? 'Estimated Cab Fare Share:' : 'Estimated Fuel Contribution:'}
                    </span>
                    <strong>
                      {isCab && selectedRide.cabShare
                        ? `₹${selectedRide.cabShare.currentPerPerson * requestedSeats} (${requestedSeats} × ₹${selectedRide.cabShare.currentPerPerson})`
                        : `₹${(selectedRide.costPerSeat ?? 0) * requestedSeats} (${requestedSeats} × ₹${selectedRide.costPerSeat ?? 0})`}
                    </strong>
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

                  <Button
                    variant="outline"
                    size="md"
                    type="button"
                    onClick={() => handleShareWhatsApp(selectedRide)}
                    leftIcon={<Share2 size={16} style={{ color: '#15803d' }} />}
                    id="btn-modal-share-whatsapp"
                    style={{ width: '100%', borderColor: '#bbf7d0', color: '#15803d' }}
                  >
                    Share {isCab ? 'Cab' : 'Ride'} via WhatsApp
                  </Button>
                </div>
              )}

              {/* Privacy notice invariant */}
              <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={12} style={{ color: '#64748b', flexShrink: 0 }} />
                <span>
                  <strong>Campus Privacy:</strong> Landmark pickup/dropoff descriptions and {isCab ? 'organiser' : 'driver'} contact details are securely disclosed only after confirmation.
                </span>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Detailed Filter & Refine Modal */}
      <Modal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        title="Filter & Refine Campus Rides"
        maxWidth="540px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleClearFilters();
                setFilterModalOpen(false);
              }}
              id="btn-modal-reset-filters"
            >
              Reset Filters
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setFilterModalOpen(false)}
              id="btn-modal-apply-filters"
            >
              Apply &amp; View {rides.length} Rides
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section: Sort Preference */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <ArrowUpDown size={14} style={{ color: 'var(--color-brand-600)' }} /> Sort Order
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ sortBy: 'departureTime', sortOrder: 'asc' })}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: sortBy === 'departureTime' ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: sortBy === 'departureTime' ? '#eff6ff' : '#ffffff',
                  color: sortBy === 'departureTime' ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: sortBy === 'departureTime' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                id="modal-sort-earliest"
              >
                Earliest
              </button>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ sortBy: 'cost', sortOrder: 'asc' })}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: sortBy === 'cost' ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: sortBy === 'cost' ? '#eff6ff' : '#ffffff',
                  color: sortBy === 'cost' ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: sortBy === 'cost' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                id="modal-sort-cost"
              >
                Lowest Cost
              </button>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ sortBy: 'seats', sortOrder: 'desc' })}
                style={{
                  padding: '8px 4px',
                  borderRadius: '8px',
                  border: sortBy === 'seats' ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: sortBy === 'seats' ? '#eff6ff' : '#ffffff',
                  color: sortBy === 'seats' ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: sortBy === 'seats' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                id="modal-sort-seats"
              >
                Most Seats
              </button>
            </div>
          </div>

          {/* Section: Max Fuel Share */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <IndianRupee size={14} style={{ color: 'var(--color-brand-600)' }} /> Maximum Fuel Share
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {['', '50', '75', '100', '150'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyFilterUpdates({ maxCost: preset })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '16px',
                    border: maxCost === preset ? '1.5px solid #2563eb' : '1px solid var(--border-light)',
                    backgroundColor: maxCost === preset ? '#eff6ff' : '#ffffff',
                    color: maxCost === preset ? '#1d4ed8' : 'var(--text-secondary)',
                    fontWeight: maxCost === preset ? 700 : 500,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                  id={`modal-preset-cost-${preset || 'any'}`}
                >
                  {preset === '' ? 'Any Amount' : `≤ ₹${preset}`}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              max={1000}
              step={5}
              placeholder="Custom max fuel share (₹)..."
              value={maxCost}
              onChange={(e) => applyFilterUpdates({ maxCost: e.target.value })}
              style={{
                width: '100%',
                height: '38px',
                padding: '8px 12px',
                fontSize: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              id="input-modal-max-cost"
            />
          </div>

          {/* Section: Seats Needed */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Users size={14} style={{ color: 'var(--color-brand-600)' }} /> Seats Needed
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => applyFilterUpdates({ seats: s })}
                  style={{
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: seats === s ? '2px solid #2563eb' : '1px solid var(--border-light)',
                    backgroundColor: seats === s ? '#eff6ff' : '#ffffff',
                    color: seats === s ? '#1d4ed8' : 'var(--text-secondary)',
                    fontWeight: seats === s ? 700 : 500,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                  id={`modal-seats-${s}`}
                >
                  {s} {s === 1 ? 'Seat' : s === 4 ? '4+ Seats' : 'Seats'}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Proximity Radius */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Compass size={14} style={{ color: 'var(--color-brand-600)' }} /> Geographic Corridor Radius
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { r: 3, label: '3 km (Standard Corridor)' },
                { r: 5, label: '5 km (Wider Proximity)' },
                { r: 10, label: '10 km (Extended Hub)' },
                { r: 20, label: '20 km (Metro Range)' },
              ].map(({ r, label }) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyFilterUpdates({ radiusKm: r })}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: radiusKm === r ? '2px solid #2563eb' : '1px solid var(--border-light)',
                    backgroundColor: radiusKm === r ? '#eff6ff' : '#ffffff',
                    color: radiusKm === r ? '#1d4ed8' : 'var(--text-secondary)',
                    fontWeight: radiusKm === r ? 700 : 500,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  id={`modal-radius-${r}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Travel Date */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Calendar size={14} style={{ color: 'var(--color-brand-600)' }} /> Travel Date
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ date: '' })}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: !date ? '1.5px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: !date ? '#eff6ff' : '#ffffff',
                  color: !date ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: !date ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
                id="modal-date-any"
              >
                Any Date
              </button>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ date: getTodayStr() })}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: date === getTodayStr() ? '1.5px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: date === getTodayStr() ? '#eff6ff' : '#ffffff',
                  color: date === getTodayStr() ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: date === getTodayStr() ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
                id="modal-date-today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyFilterUpdates({ date: getTomorrowStr() })}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: date === getTomorrowStr() ? '1.5px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: date === getTomorrowStr() ? '#eff6ff' : '#ffffff',
                  color: date === getTomorrowStr() ? '#1d4ed8' : 'var(--text-secondary)',
                  fontWeight: date === getTomorrowStr() ? 700 : 500,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
                id="modal-date-tomorrow"
              >
                Tomorrow
              </button>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => applyFilterUpdates({ date: e.target.value })}
              style={{
                width: '100%',
                height: '38px',
                padding: '8px 12px',
                fontSize: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              id="input-modal-date"
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
};
