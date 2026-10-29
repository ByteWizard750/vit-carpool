import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  Car,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Play,
  Pause,
  XCircle,
  Edit2,
  Info,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { RouteSpine } from '../components/common/RouteSpine';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { MyTripsTabs } from '../components/navigation/MyTripsTabs';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { useAuth } from '../features/auth/AuthContext';
import {
  RecurringCommuteResponseDto,
  VehicleResponseDto,
  LocationSuggestionDto,
  getKolkataTodayString,
  getApplicableOccurrenceDates,
  formatWeekdays,
  formatTime12Hour,
  formatKolkataDisplay,
} from '@vit-carpool/contracts';

const WEEKDAYS_LIST = [
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' },
  { id: 7, label: 'Sun', full: 'Sunday' },
];

export const RecurringCommutesPage: React.FC = () => {
  const { user, token } = useAuth();

  // Active view tab: 'LIST' or 'CREATE'
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');

  // Commute Schedules
  const [schedules, setSchedules] = useState<RecurringCommuteResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Status Filter for list view
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED'>('ALL');

  // Driver Vehicles
  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);

  // Form State: Create
  const [origin, setOrigin] = useState('');
  const [originLocation, setOriginLocation] = useState<LocationSuggestionDto | null>(null);
  const [destination, setDestination] = useState('');
  const [destinationLocation, setDestinationLocation] = useState<LocationSuggestionDto | null>(null);
  const [pickupDescription, setPickupDescription] = useState('');
  const [dropoffDescription, setDropoffDescription] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // default Mon-Fri
  const [departureTime, setDepartureTime] = useState('08:00');
  const [startDate, setStartDate] = useState(() => getKolkataTodayString());
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const d = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [availableSeats, setAvailableSeats] = useState<number>(3);
  const [costPerSeat, setCostPerSeat] = useState<string>('50');
  const [submitting, setSubmitting] = useState(false);

  // Modals for Actions
  const [actionModal, setActionModal] = useState<{
    type: 'PAUSE' | 'RESUME' | 'CANCEL' | 'EDIT';
    schedule: RecurringCommuteResponseDto;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit Form State
  const [editDepartureTime, setEditDepartureTime] = useState('');
  const [editWeekdays, setEditWeekdays] = useState<number[]>([]);
  const [editSeats, setEditSeats] = useState<number>(3);
  const [editCost, setEditCost] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editPickupNotes, setEditPickupNotes] = useState('');
  const [editDropoffNotes, setEditDropoffNotes] = useState('');

  // Fetch Driver Schedules
  const fetchSchedules = useCallback(async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recurring-commutes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: RecurringCommuteResponseDto[] = await res.json();
        setSchedules(data);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'Failed to load recurring commute schedules.');
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [token, user?.verificationStatus]);

  // Fetch Driver Vehicles
  useEffect(() => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    const fetchVehicles = async () => {
      try {
        const res = await fetch('/api/vehicles', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: VehicleResponseDto[] = await res.json();
          setVehicles(data);
          if (data.length > 0 && !selectedVehicleId) {
            setSelectedVehicleId(data[0].id);
            setAvailableSeats(Math.min(3, data[0].capacity - 1));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch vehicles:', err);
      }
    };
    fetchVehicles();
  }, [token, user?.verificationStatus]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Max seats allowed for selected vehicle
  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  const maxAllowedSeats = useMemo(() => {
    if (!selectedVehicle) return 4;
    return Math.max(1, selectedVehicle.capacity - 1);
  }, [selectedVehicle]);

  // Adjust seats if vehicle capacity changes
  useEffect(() => {
    if (availableSeats > maxAllowedSeats) {
      setAvailableSeats(maxAllowedSeats);
    }
  }, [maxAllowedSeats, availableSeats]);

  // Toggle Weekday Selection
  const handleToggleWeekday = (id: number) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // keep at least 1
        return prev.filter((d) => d !== id);
      }
      return [...prev, id].sort((a, b) => a - b);
    });
  };

  // Preview count of initial rides generated in 14 days
  const previewGeneratedCount = useMemo(() => {
    if (!startDate || !endDate || selectedWeekdays.length === 0) return 0;
    try {
      const dates = getApplicableOccurrenceDates(startDate, endDate, selectedWeekdays, 14);
      return dates.length;
    } catch {
      return 0;
    }
  }, [startDate, endDate, selectedWeekdays]);

  // Handle Create Schedule Form Submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!origin.trim() || !destination.trim()) {
      setError('Please provide both origin and destination.');
      return;
    }
    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setError('Origin and destination cannot be identical.');
      return;
    }
    if (selectedWeekdays.length === 0) {
      setError('Please select at least one active weekday.');
      return;
    }
    if (!selectedVehicleId) {
      setError('Please select a registered vehicle.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const payload = {
      origin: origin.trim(),
      originAddress: originLocation?.address || undefined,
      originLatitude: originLocation?.latitude ?? undefined,
      originLongitude: originLocation?.longitude ?? undefined,
      originPlaceId: originLocation?.id || undefined,
      destination: destination.trim(),
      destinationAddress: destinationLocation?.address || undefined,
      destinationLatitude: destinationLocation?.latitude ?? undefined,
      destinationLongitude: destinationLocation?.longitude ?? undefined,
      destinationPlaceId: destinationLocation?.id || undefined,
      pickupDescription: pickupDescription.trim() || undefined,
      dropoffDescription: dropoffDescription.trim() || undefined,
      vehicleId: selectedVehicleId,
      weekdays: selectedWeekdays,
      departureTime,
      startDate,
      endDate,
      availableSeats,
      costPerSeat: costPerSeat ? parseInt(costPerSeat, 10) : undefined,
    };

    try {
      const res = await fetch('/api/recurring-commutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created: RecurringCommuteResponseDto = await res.json();
        setSuccessMsg(
          `Schedule created successfully! Materialized ${created.generatedRidesCount} upcoming rides within the initial 14-day window.`,
        );
        setActiveTab('LIST');
        await fetchSchedules();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'Failed to create recurring commute schedule.');
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (schedule: RecurringCommuteResponseDto) => {
    setEditDepartureTime(schedule.departureTime);
    setEditWeekdays([...schedule.weekdays]);
    setEditSeats(schedule.availableSeats);
    setEditCost(schedule.costPerSeat !== null && schedule.costPerSeat !== undefined ? String(schedule.costPerSeat) : '');
    setEditEndDate(schedule.endDate);
    setEditPickupNotes(schedule.pickupDescription || '');
    setEditDropoffNotes(schedule.dropoffDescription || '');
    setActionModal({ type: 'EDIT', schedule });
  };

  // Handle Schedule Action (Pause, Resume, Cancel, Edit)
  const handleExecuteAction = async () => {
    if (!actionModal || !token) return;
    const { type, schedule } = actionModal;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let endpoint = `/api/recurring-commutes/${schedule.id}`;
      let method = 'PATCH';
      let body: any = undefined;

      if (type === 'PAUSE') {
        endpoint += '/pause';
      } else if (type === 'RESUME') {
        endpoint += '/resume';
      } else if (type === 'CANCEL') {
        endpoint += '/cancel';
      } else if (type === 'EDIT') {
        body = JSON.stringify({
          departureTime: editDepartureTime,
          weekdays: editWeekdays,
          availableSeats: editSeats,
          costPerSeat: editCost ? parseInt(editCost, 10) : null,
          endDate: editEndDate,
          pickupDescription: editPickupNotes.trim() || undefined,
          dropoffDescription: editDropoffNotes.trim() || undefined,
        });
      }

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      });

      if (res.ok) {
        await res.json();
        setActionModal(null);
        if (type === 'PAUSE') {
          setSuccessMsg('Schedule paused. Future rides will not be generated until resumed.');
        } else if (type === 'RESUME') {
          setSuccessMsg('Schedule resumed. Future rides materialized.');
        } else if (type === 'CANCEL') {
          setSuccessMsg('Schedule cancelled. Existing rides remain intact and bookable.');
        } else if (type === 'EDIT') {
          setSuccessMsg('Schedule preferences updated successfully.');
        }
        await fetchSchedules();
      } else {
        const errBody = await res.json().catch(() => ({}));
        setError(errBody.message || `Failed to ${type.toLowerCase()} schedule.`);
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered schedules for display
  const filteredSchedules = useMemo(() => {
    if (statusFilter === 'ALL') return schedules;
    return schedules.filter((s) => s.status === statusFilter);
  }, [schedules, statusFilter]);

  return (
    <PageShell width="content">
      <PageHeader
        title="Recurring Commutes"
        description="Set your regular commute to VIT Chennai once. Rides are generated automatically on a rolling 14-day horizon."
        tabs={<MyTripsTabs counts={{ schedules: schedules.length }} />}
        action={
          <Button
            variant={activeTab === 'CREATE' ? 'outline' : 'primary'}
            onClick={() => setActiveTab(activeTab === 'CREATE' ? 'LIST' : 'CREATE')}
          >
            <Plus size={16} /> {activeTab === 'CREATE' ? 'View Schedules' : 'New Schedule'}
          </Button>
        }
      />

      {/* Global Alerts */}
      {error && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--status-error-text)',
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--status-success-bg)',
            border: '1px solid var(--status-success-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--status-success-text)',
            marginBottom: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <CheckCircle2 size={20} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* TAB 1: SCHEDULE LIST */}
      {activeTab === 'LIST' && (
        <div>
          {/* Status Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-6)',
              overflowX: 'auto',
              paddingBottom: 'var(--space-2)',
            }}
          >
            {(['ALL', 'ACTIVE', 'PAUSED', 'CANCELLED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid',
                  borderColor: statusFilter === status ? 'var(--color-brand-600)' : 'var(--border-light)',
                  backgroundColor: statusFilter === status ? 'var(--color-brand-50)' : 'var(--bg-surface)',
                  color: statusFilter === status ? 'var(--color-brand-700)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {status === 'ALL' ? 'All Schedules' : status} (
                {status === 'ALL'
                  ? schedules.length
                  : schedules.filter((s) => s.status === status).length}
                )
              </button>
            ))}
          </div>

          {/* Loading State */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
              <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-brand-600)', margin: '0 auto var(--space-3)' }} />
              <p style={{ color: 'var(--text-muted)' }}>Loading your commute schedules...</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            /* Empty State */
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-light)',
                padding: 'var(--space-12)',
                textAlign: 'center',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-brand-50)',
                  color: 'var(--color-brand-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-4)',
                }}
              >
                <Calendar size={32} />
              </div>
              <h3 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>
                {statusFilter === 'ALL'
                  ? 'No recurring commute schedules yet'
                  : `No ${statusFilter.toLowerCase()} commute schedules`}
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto var(--space-6)' }}>
                Save your regular travel schedule between home and VIT Chennai. Rides will appear on the ride board automatically for passengers to discover and book.
              </p>
              <Button variant="primary" onClick={() => setActiveTab('CREATE')}>
                <Plus size={16} /> Create Your First Schedule
              </Button>
            </div>
          ) : (
            /* Schedules Grid */
            <div className="rides-cards-grid" style={{ gap: 'var(--space-6)' }}>
              {filteredSchedules.map((schedule) => {
                const isActive = schedule.status === 'ACTIVE';
                const isPaused = schedule.status === 'PAUSED';
                const isCancelled = schedule.status === 'CANCELLED';

                return (
                  <div
                    key={schedule.id}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid',
                      borderColor: isActive
                        ? 'var(--border-medium)'
                        : isPaused
                        ? 'var(--status-warning-border)'
                        : 'var(--border-light)',
                      padding: 'var(--space-5)',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                      opacity: isCancelled ? 0.75 : 1,
                    }}
                  >
                    {/* Card Header: Route & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                      <div style={{ flex: 1, minWidth: 0, paddingRight: 'var(--space-3)' }}>
                        <RouteSpine
                          origin={schedule.origin}
                          destination={schedule.destination}
                          variant="compact"
                        />
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {schedule.startDate} to {schedule.endDate}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <StatusBadge status={schedule.status} domain="schedule" />
                    </div>

                    {/* Schedule Timing & Days */}
                    <div
                      style={{
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3) var(--space-4)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                          <Clock size={16} style={{ color: 'var(--color-brand-600)' }} />
                          <span>{formatTime12Hour(schedule.departureTime)} IST</span>
                        </div>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          {formatWeekdays(schedule.weekdays)}
                        </span>
                      </div>

                      {/* Days Pills */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {WEEKDAYS_LIST.map((w) => {
                          const isSelected = schedule.weekdays.includes(w.id);
                          return (
                            <span
                              key={w.id}
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: isSelected ? 'var(--color-brand-600)' : 'transparent',
                                color: isSelected ? 'var(--text-inverse)' : 'var(--text-muted)',
                              }}
                            >
                              {w.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Vehicle & Pricing Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-secondary)' }}>
                        <Car size={16} style={{ color: 'var(--text-muted)' }} />
                        <span>
                          {schedule.vehicle ? `${schedule.vehicle.make} ${schedule.vehicle.model}` : 'Vehicle'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-brand-700)' }}>
                        {schedule.costPerSeat !== null && schedule.costPerSeat !== undefined
                          ? `₹${schedule.costPerSeat} / seat`
                          : 'Free'}
                      </div>
                    </div>

                    {/* Next Occurrence & Generation Counter */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 'var(--text-xs)',
                        borderTop: '1px solid var(--border-light)',
                        paddingTop: 'var(--space-3)',
                      }}
                    >
                      <div>
                        {isActive && schedule.nextOccurrence ? (
                          <span style={{ color: 'var(--status-success-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }} />
                            Next: {formatKolkataDisplay(schedule.nextOccurrence)}
                          </span>
                        ) : isPaused ? (
                          <span style={{ color: 'var(--status-warning-text)' }}>Generation Paused</span>
                        ) : isCancelled ? (
                          <span style={{ color: 'var(--text-muted)' }}>No future rides</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Schedule expired</span>
                        )}
                      </div>

                      <Link
                        to="/my-rides"
                        style={{
                          color: 'var(--color-brand-600)',
                          fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        {schedule.generatedRidesCount} rides generated →
                      </Link>
                    </div>

                    {/* Action Buttons */}
                    {!isCancelled && (
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
                        {isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ flex: 1 }}
                            onClick={() => setActionModal({ type: 'PAUSE', schedule })}
                          >
                            <Pause size={14} /> Pause
                          </Button>
                        ) : isPaused ? (
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ flex: 1 }}
                            onClick={() => setActionModal({ type: 'RESUME', schedule })}
                          >
                            <Play size={14} /> Resume
                          </Button>
                        ) : null}

                        <Button
                          variant="outline"
                          size="sm"
                          style={{ flex: 1 }}
                          onClick={() => openEditModal(schedule)}
                        >
                          <Edit2 size={14} /> Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--status-error)' }}
                          onClick={() => setActionModal({ type: 'CANCEL', schedule })}
                        >
                          <XCircle size={14} /> Cancel
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

      {/* TAB 2: CREATE SCHEDULE FORM */}
      {activeTab === 'CREATE' && (
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <form
            onSubmit={handleCreateSubmit}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-6)',
            }}
          >
            <div>
              <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-1)' }}>
                New Recurring Commute Schedule
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                Configure your regular commute route, active days, and departure time.
              </p>
            </div>

            {/* Section 1: Route */}
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <MapPin size={18} style={{ color: 'var(--color-brand-600)' }} />
                Commute Route
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Origin Location *
                  </label>
                  <LocationAutocomplete
                    value={origin}
                    onChange={(val, loc) => {
                      setOrigin(val);
                      setOriginLocation(loc || null);
                    }}
                    placeholder="Search pickup hub (e.g. Tambaram, Chromepet, Guindy...)"
                    required
                  />
                  {/* Quick Route Shortcuts */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {['Tambaram Railway Station', 'Chromepet Bus Stand', 'Guindy Metro', 'Velachery MRTS'].map((stop) => (
                      <button
                        key={stop}
                        type="button"
                        onClick={() => setOrigin(stop)}
                        style={{
                          fontSize: 'var(--text-xs)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-subtle)',
                          cursor: 'pointer',
                        }}
                      >
                        + {stop}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Destination *
                  </label>
                  <LocationAutocomplete
                    value={destination}
                    onChange={(val, loc) => {
                      setDestination(val);
                      setDestinationLocation(loc || null);
                    }}
                    placeholder="Search dropoff location (e.g. VIT Chennai Campus...)"
                    required
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    {['VIT Chennai Main Gate', 'VIT Chennai Academic Block 1'].map((stop) => (
                      <button
                        key={stop}
                        type="button"
                        onClick={() => setDestination(stop)}
                        style={{
                          fontSize: 'var(--text-xs)',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid var(--border-light)',
                          backgroundColor: 'var(--bg-subtle)',
                          cursor: 'pointer',
                        }}
                      >
                        + {stop}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="responsive-two-col" style={{ gap: 'var(--space-4)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
                      Pickup Landmark Notes (Optional)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={pickupDescription}
                      onChange={(e) => setPickupDescription(e.target.value)}
                      placeholder="e.g. Platform 1 ticket counter"
                      maxLength={255}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
                      Dropoff Landmark Notes (Optional)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={dropoffDescription}
                      onChange={(e) => setDropoffDescription(e.target.value)}
                      placeholder="e.g. Near Gazebo"
                      maxLength={255}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Timing & Days */}
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Clock size={18} style={{ color: 'var(--color-brand-600)' }} />
                Commute Schedule & Weekdays
              </h3>

              {/* Weekdays Toggle */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <label style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    Active Weekdays *
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      onClick={() => setSelectedWeekdays([1, 2, 3, 4, 5])}
                      style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-600)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Mon-Fri
                    </button>
                    <span style={{ color: 'var(--border-medium)' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedWeekdays([1, 2, 3, 4, 5, 6, 7])}
                      style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-600)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      All Days
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                  {WEEKDAYS_LIST.map((w) => {
                    const isSelected = selectedWeekdays.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleToggleWeekday(w.id)}
                        style={{
                          padding: '8px 2px',
                          textAlign: 'center',
                          borderRadius: 'var(--radius-md)',
                          border: '1.5px solid',
                          borderColor: isSelected ? 'var(--color-brand-600)' : 'var(--border-light)',
                          backgroundColor: isSelected ? 'var(--color-brand-600)' : 'var(--bg-subtle)',
                          color: isSelected ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time & Dates Row */}
              <div className="rides-filter-grid" style={{ gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Departure Time (Asia/Kolkata) *
                  </label>
                  <input
                    type="time"
                    className="input"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    required
                  />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Daily departure in local campus time
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Schedule Start Date *
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={startDate}
                    min={getKolkataTodayString()}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Schedule End Date *
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Vehicle & Pricing */}
            <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-6)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Car size={18} style={{ color: 'var(--color-brand-600)' }} />
                Vehicle & Capacity
              </h3>

              {vehicles.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--space-4)',
                    backgroundColor: 'var(--status-warning-bg)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--status-warning-text)',
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 'var(--space-1)' }}>No active vehicles found.</p>
                  <p style={{ fontSize: 'var(--text-sm)' }}>
                    You need to register at least one verified vehicle to offer carpool commutes.{' '}
                    <Link to="/vehicles" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                      Register a vehicle now →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="rides-filter-grid" style={{ gap: 'var(--space-4)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Vehicle *
                    </label>
                    <select
                      className="input"
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      required
                    >
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.make} {v.model} ({v.color}) — {v.capacity - 1} seats max
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Available Seats Offered *
                    </label>
                    <input
                      type="number"
                      className="input"
                      min={1}
                      max={maxAllowedSeats}
                      value={availableSeats}
                      onChange={(e) => setAvailableSeats(parseInt(e.target.value, 10) || 1)}
                      required
                    />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Max {maxAllowedSeats} passenger seats for this vehicle
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                      Contribution per Seat (₹)
                    </label>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      max={500}
                      value={costPerSeat}
                      onChange={(e) => setCostPerSeat(e.target.value)}
                      placeholder="e.g. 50"
                    />
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Fair-share cost sharing (max ₹500)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Informational Generation Callout */}
            <div
              style={{
                backgroundColor: 'var(--color-brand-50)',
                border: '1px solid var(--color-brand-200)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
              }}
            >
              <Info size={20} style={{ color: 'var(--color-brand-700)', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-brand-900)' }}>
                <strong>Automatic 14-day Rolling Materialization:</strong>
                <p style={{ marginTop: '2px' }}>
                  Saving this schedule will immediately materialize ~<strong>{previewGeneratedCount} rides</strong> for the next 14 days. As time progresses, future rides will continue to appear automatically. Passengers will discover each ride individually and book through the normal workflow.
                </p>
              </div>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button type="button" variant="outline" onClick={() => setActiveTab('LIST')}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting || vehicles.length === 0}>
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Materializing Schedule...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Save & Generate Rides
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMATION / ACTION MODAL */}
      {actionModal && (
        <Modal
          isOpen={true}
          onClose={() => setActionModal(null)}
          title={
            actionModal.type === 'PAUSE'
              ? 'Pause Recurring Commute'
              : actionModal.type === 'RESUME'
              ? 'Resume Recurring Commute'
              : actionModal.type === 'CANCEL'
              ? 'Cancel Recurring Commute Schedule'
              : 'Edit Schedule Preferences'
          }
        >
          {actionModal.type === 'PAUSE' && (
            <div>
              <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                Are you sure you want to pause your commute schedule from{' '}
                <strong>{actionModal.schedule.origin}</strong> to{' '}
                <strong>{actionModal.schedule.destination}</strong>?
              </p>
              <div
                style={{
                  backgroundColor: 'var(--status-warning-bg)',
                  border: '1px solid var(--status-warning-border)',
                  color: 'var(--status-warning-text)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                No future rides will be generated while paused. Rides already generated for upcoming days will remain active and bookable unless individually cancelled.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <Button variant="outline" onClick={() => setActionModal(null)}>
                  Keep Active
                </Button>
                <Button variant="primary" onClick={handleExecuteAction} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Pause Schedule'}
                </Button>
              </div>
            </div>
          )}

          {actionModal.type === 'RESUME' && (
            <div>
              <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                Resume your commute schedule from{' '}
                <strong>{actionModal.schedule.origin}</strong> to{' '}
                <strong>{actionModal.schedule.destination}</strong>?
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 'var(--space-6)' }}>
                Future rides within the rolling 14-day window will be materialized immediately. Missed rides from dates in the past will not be recreated.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <Button variant="outline" onClick={() => setActionModal(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleExecuteAction} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Resume Schedule'}
                </Button>
              </div>
            </div>
          )}

          {actionModal.type === 'CANCEL' && (
            <div>
              <p style={{ marginBottom: 'var(--space-4)', color: 'var(--text-secondary)' }}>
                Are you sure you want to cancel this recurring commute schedule?
              </p>
              <div
                style={{
                  backgroundColor: 'var(--status-error-bg)',
                  border: '1px solid var(--status-error-border)',
                  color: 'var(--status-error-text)',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                <strong>Important:</strong> Cancelling stops all future automatic ride generation. Already generated rides and their existing passenger bookings will NOT be cancelled automatically.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                <Button variant="outline" onClick={() => setActionModal(null)}>
                  Keep Schedule
                </Button>
                <Button
                  variant="primary"
                  style={{ backgroundColor: 'var(--status-error)' }}
                  onClick={handleExecuteAction}
                  disabled={actionLoading}
                >
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Cancellation'}
                </Button>
              </div>
            </div>
          )}

          {actionModal.type === 'EDIT' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Updating schedule preferences affects future occurrences that have not already been generated.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Departure Time (HH:mm)
                </label>
                <input
                  type="time"
                  className="input"
                  value={editDepartureTime}
                  onChange={(e) => setEditDepartureTime(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Active Weekdays
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                  {WEEKDAYS_LIST.map((w) => {
                    const isSelected = editWeekdays.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setEditWeekdays((prev) => {
                            if (prev.includes(w.id)) {
                              if (prev.length === 1) return prev;
                              return prev.filter((d) => d !== w.id);
                            }
                            return [...prev, w.id].sort((a, b) => a - b);
                          });
                        }}
                        style={{
                          padding: 'var(--space-2) 0',
                          textAlign: 'center',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--color-brand-600)' : 'var(--border-light)',
                          backgroundColor: isSelected ? 'var(--color-brand-600)' : 'var(--bg-subtle)',
                          color: isSelected ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          fontSize: 'var(--text-xs)',
                          cursor: 'pointer',
                        }}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="responsive-two-col" style={{ gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Seats Offered
                  </label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={6}
                    value={editSeats}
                    onChange={(e) => setEditSeats(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                    Cost per Seat (₹)
                  </label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    max={500}
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
                  Extend Schedule End Date
                </label>
                <input
                  type="date"
                  className="input"
                  min={getKolkataTodayString()}
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <Button variant="outline" onClick={() => setActionModal(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleExecuteAction} disabled={actionLoading}>
                  {actionLoading ? <Loader2 size={16} className="animate-spin" /> : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </PageShell>
  );
};
