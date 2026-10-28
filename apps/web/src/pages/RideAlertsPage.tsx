import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Sparkles,
  MapPin,
  Clock,
  Compass,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { useAuth } from '../features/auth/AuthContext';
import {
  RideAlertResponseDto,
  LocationSuggestionDto,
} from '@vit-carpool/contracts';

const QUICK_CAMPUS_LOCATIONS: LocationSuggestionDto[] = [
  {
    id: 'vit_chennai_main_gate',
    name: 'VIT Chennai Main Gate',
    address: 'Vandalur-Kelambakkam Road, Chennai',
    latitude: 12.8406,
    longitude: 80.1534,
  },
  {
    id: 'tambaram_railway_station',
    name: 'Tambaram Railway Station',
    address: 'GST Road, Tambaram, Chennai',
    latitude: 12.9249,
    longitude: 80.1478,
  },
  {
    id: 'kelambakkam_junction',
    name: 'Kelambakkam Junction',
    address: 'OMR - Vandalur Road, Kelambakkam',
    latitude: 12.7844,
    longitude: 80.2217,
  },
  {
    id: 'chennai_airport',
    name: 'Chennai International Airport (MAA)',
    address: 'GST Road, Meenambakkam, Chennai',
    latitude: 12.9941,
    longitude: 80.1709,
  },
  {
    id: 'velachery_terminus',
    name: 'Velachery Vijayanagar Bus Terminus',
    address: 'Velachery Bypass Road, Chennai',
    latitude: 12.9796,
    longitude: 80.2185,
  },
];

export const RideAlertsPage: React.FC = () => {
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<'MY_ALERTS' | 'CREATE'>('MY_ALERTS');
  const [alerts, setAlerts] = useState<RideAlertResponseDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State: Create Alert
  const [origin, setOrigin] = useState<string>('');
  const [originLocation, setOriginLocation] = useState<LocationSuggestionDto | null>(null);
  const [destination, setDestination] = useState<string>('');
  const [destinationLocation, setDestinationLocation] = useState<LocationSuggestionDto | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(5.0);
  const [earliestDepartureTime, setEarliestDepartureTime] = useState<string>('');
  const [latestDepartureTime, setLatestDepartureTime] = useState<string>('');
  const [minSeats, setMinSeats] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Edit / Delete Modal State
  const [editModalAlert, setEditModalAlert] = useState<RideAlertResponseDto | null>(null);
  const [editRadiusKm, setEditRadiusKm] = useState<number>(5.0);
  const [editEarliestTime, setEditEarliestTime] = useState<string>('');
  const [editLatestTime, setEditLatestTime] = useState<string>('');
  const [editMinSeats, setEditMinSeats] = useState<number>(1);
  const [deleteConfirmAlert, setDeleteConfirmAlert] = useState<RideAlertResponseDto | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/ride-alerts', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load ride alerts (status ${res.status})`);
      }

      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching ride alerts:', err);
      setError(err.message || 'Failed to load ride alerts.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!origin.trim() || !originLocation) {
      setError('Please select a valid origin location from suggestions or campus chips.');
      return;
    }

    if (!destination.trim() || !destinationLocation) {
      setError('Please select a valid destination location from suggestions or campus chips.');
      return;
    }

    if (earliestDepartureTime && latestDepartureTime && earliestDepartureTime > latestDepartureTime) {
      setError('Earliest departure time must be earlier than or equal to latest departure time.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        origin: originLocation.name || origin,
        originLatitude: originLocation.latitude,
        originLongitude: originLocation.longitude,
        originPlaceId: originLocation.id || undefined,
        destination: destinationLocation.name || destination,
        destinationLatitude: destinationLocation.latitude,
        destinationLongitude: destinationLocation.longitude,
        destinationPlaceId: destinationLocation.id || undefined,
        radiusKm: Number(radiusKm),
        earliestDepartureTime: earliestDepartureTime || undefined,
        latestDepartureTime: latestDepartureTime || undefined,
        minSeats: Number(minSeats) || 1,
      };

      const res = await fetch('/ride-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Failed to create alert (status ${res.status})`);
      }

      const created = await res.json();
      setAlerts((prev) => [created, ...prev]);
      setSuccessMsg('Ride alert created successfully! We will notify you when a matching ride is published.');

      // Reset Form
      setOrigin('');
      setOriginLocation(null);
      setDestination('');
      setDestinationLocation(null);
      setRadiusKm(5.0);
      setEarliestDepartureTime('');
      setLatestDepartureTime('');
      setMinSeats(1);
      setActiveTab('MY_ALERTS');
    } catch (err: any) {
      console.error('Failed to create alert:', err);
      setError(err.message || 'Failed to create ride alert.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePause = async (alert: RideAlertResponseDto) => {
    if (!token) return;
    const isPaused = alert.status === 'PAUSED';
    const action = isPaused ? 'resume' : 'pause';
    setActionLoadingId(alert.id);

    try {
      const res = await fetch(`/ride-alerts/${alert.id}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to ${action} alert.`);
      }

      const updated = await res.json();
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? updated : a)));
      setSuccessMsg(`Alert ${isPaused ? 'resumed' : 'paused'} successfully.`);
    } catch (err: any) {
      console.error(`Failed to ${action} alert:`, err);
      setError(err.message || `Failed to ${action} alert.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editModalAlert || !token) return;

    if (editEarliestTime && editLatestTime && editEarliestTime > editLatestTime) {
      setError('Earliest departure time must be earlier than or equal to latest departure time.');
      return;
    }

    setActionLoadingId(editModalAlert.id);
    try {
      const res = await fetch(`/ride-alerts/${editModalAlert.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          radiusKm: Number(editRadiusKm),
          earliestDepartureTime: editEarliestTime || undefined,
          latestDepartureTime: editLatestTime || undefined,
          minSeats: Number(editMinSeats) || 1,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to update alert.');
      }

      const updated = await res.json();
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditModalAlert(null);
      setSuccessMsg('Alert preferences updated successfully.');
    } catch (err: any) {
      console.error('Failed to update alert:', err);
      setError(err.message || 'Failed to update alert.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteAlert = async () => {
    if (!deleteConfirmAlert || !token) return;

    setActionLoadingId(deleteConfirmAlert.id);
    try {
      const res = await fetch(`/ride-alerts/${deleteConfirmAlert.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to delete alert.');
      }

      setAlerts((prev) => prev.filter((a) => a.id !== deleteConfirmAlert.id));
      setDeleteConfirmAlert(null);
      setSuccessMsg('Ride alert deleted.');
    } catch (err: any) {
      console.error('Failed to delete alert:', err);
      setError(err.message || 'Failed to delete alert.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openEditModal = (alert: RideAlertResponseDto) => {
    setEditModalAlert(alert);
    setEditRadiusKm(alert.radiusKm);
    setEditEarliestTime(alert.earliestDepartureTime || '');
    setEditLatestTime(alert.latestDepartureTime || '');
    setEditMinSeats(alert.minSeats);
  };

  return (
    <div className="container" style={{ padding: '36px 16px 64px', maxWidth: '880px' }}>
      {/* Top Header Card */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
          padding: '24px 28px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#f5f3ff',
              border: '1px solid #ddd6fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
            }}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Ride Alerts
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Save your preferred routes and get notified automatically when a matching ride is posted
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link to="/notifications" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="sm" leftIcon={<Bell size={15} />}>
              Notification Inbox
            </Button>
          </Link>

          <Button
            variant={activeTab === 'CREATE' ? 'outline' : 'primary'}
            size="sm"
            onClick={() => {
              setActiveTab(activeTab === 'CREATE' ? 'MY_ALERTS' : 'CREATE');
              setError(null);
              setSuccessMsg(null);
            }}
            leftIcon={activeTab === 'CREATE' ? <Bell size={15} /> : <Plus size={15} />}
            id="tab-toggle-btn"
          >
            {activeTab === 'CREATE' ? 'View My Alerts' : 'Create New Alert'}
          </Button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            color: '#166534',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} />
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'none', border: 'none', color: '#166534', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            color: '#991b1b',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span style={{ fontSize: '0.875rem' }}>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* CREATE ALERT FORM */}
      {activeTab === 'CREATE' && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-medium)',
            padding: '28px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Create Travel Preference Alert
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Whenever a driver posts a ride matching this directional route and departure window, you'll receive an in-app notification.
          </p>

          <form onSubmit={handleCreateAlert}>
            {/* Origin Location */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Origin / Pickup Area *
              </label>
              <LocationAutocomplete
                value={origin}
                onChange={(val, loc) => {
                  setOrigin(val);
                  setOriginLocation(loc || null);
                }}
                placeholder="Type campus location or landmark (e.g. Tambaram, Guindy)..."
                required
              />
              {/* Quick Origin Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Quick select:
                </span>
                {QUICK_CAMPUS_LOCATIONS.map((loc) => (
                  <button
                    key={`orig-${loc.id}`}
                    id={`btn-quick-orig-${loc.id}`}
                    type="button"
                    onClick={() => {
                      setOrigin(loc.name);
                      setOriginLocation(loc);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: origin === loc.name ? '1.5px solid #2563eb' : '1px solid var(--border-medium)',
                      backgroundColor: origin === loc.name ? '#eff6ff' : '#f8fafc',
                      color: origin === loc.name ? '#1d4ed8' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {loc.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Destination Location */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Destination / Drop-off Area *
              </label>
              <LocationAutocomplete
                value={destination}
                onChange={(val, loc) => {
                  setDestination(val);
                  setDestinationLocation(loc || null);
                }}
                placeholder="Type campus destination (e.g. VIT Chennai, Airport)..."
                required
              />
              {/* Quick Destination Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Quick select:
                </span>
                {QUICK_CAMPUS_LOCATIONS.map((loc) => (
                  <button
                    key={`dest-${loc.id}`}
                    id={`btn-quick-dest-${loc.id}`}
                    type="button"
                    onClick={() => {
                      setDestination(loc.name);
                      setDestinationLocation(loc);
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: destination === loc.name ? '1.5px solid #2563eb' : '1px solid var(--border-medium)',
                      backgroundColor: destination === loc.name ? '#eff6ff' : '#f8fafc',
                      color: destination === loc.name ? '#1d4ed8' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {loc.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Radius & Min Seats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                  Geographic Search Radius: <strong>{radiusKm} km</strong>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 5, 10, 15].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRadiusKm(r)}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        borderRadius: '8px',
                        border: radiusKm === r ? '2px solid #2563eb' : '1px solid var(--border-medium)',
                        backgroundColor: radiusKm === r ? '#eff6ff' : '#ffffff',
                        color: radiusKm === r ? '#1d4ed8' : 'var(--text-primary)',
                        fontWeight: radiusKm === r ? 700 : 500,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      {r} km
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                  Minimum Seats Needed
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMinSeats(s)}
                      style={{
                        flex: 1,
                        padding: '7px 0',
                        borderRadius: '8px',
                        border: minSeats === s ? '2px solid #2563eb' : '1px solid var(--border-medium)',
                        backgroundColor: minSeats === s ? '#eff6ff' : '#ffffff',
                        color: minSeats === s ? '#1d4ed8' : 'var(--text-primary)',
                        fontWeight: minSeats === s ? 700 : 500,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      {s} {s === 1 ? 'seat' : 'seats'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Departure Window (Optional) */}
            <div
              style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid var(--border-medium)',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <Clock size={16} color="#475569" />
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Preferred Departure Time Window (Asia/Kolkata)
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Optional)</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Leave blank if you want alerts for rides departing at any time of day.
              </p>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                    Earliest Departure Time
                  </label>
                  <input
                    type="time"
                    value={earliestDepartureTime}
                    onChange={(e) => setEarliestDepartureTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: '#ffffff',
                      fontSize: '0.875rem',
                    }}
                    id="earliest-departure-time-input"
                  />
                </div>

                <div style={{ flex: 1, minWidth: '160px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                    Latest Departure Time
                  </label>
                  <input
                    type="time"
                    value={latestDepartureTime}
                    onChange={(e) => setLatestDepartureTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: '#ffffff',
                      fontSize: '0.875rem',
                    }}
                    id="latest-departure-time-input"
                  />
                </div>
              </div>
            </div>

            {/* Submit & Cancel Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setActiveTab('MY_ALERTS')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting}
                leftIcon={submitting ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                id="create-alert-submit-btn"
              >
                {submitting ? 'Creating Alert...' : 'Create Ride Alert'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MY SAVED ALERTS LIST */}
      {activeTab === 'MY_ALERTS' && (
        <>
          {loading && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 20px',
                color: 'var(--text-secondary)',
                gap: '12px',
              }}
            >
              <Loader2 size={32} className="spin" color="#3b82f6" />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading your ride alerts...</p>
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px dashed var(--border-medium)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#f5f3ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <Sparkles size={26} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                No Saved Ride Alerts
              </h3>
              <p style={{ margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '440px' }}>
                Don't see a ride that fits your schedule? Save an alert for your route, and we'll notify you as soon as an eligible student or faculty driver posts a matching ride.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => setActiveTab('CREATE')}
                leftIcon={<Plus size={16} />}
                id="empty-create-alert-btn"
              >
                Create Your First Alert
              </Button>
            </div>
          )}

          {!loading && alerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {alerts.map((alert) => {
                const isPaused = alert.status === 'PAUSED';
                const isActionBusy = actionLoadingId === alert.id;

                return (
                  <div
                    key={alert.id}
                    style={{
                      padding: '20px 24px',
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      border: isPaused ? '1px dashed var(--border-medium)' : '1px solid var(--border-medium)',
                      opacity: isPaused ? 0.75 : 1,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease',
                    }}
                    className="alert-item-card"
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '14px',
                      }}
                    >
                      {/* Route Info */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              backgroundColor: isPaused ? '#fef3c7' : '#ecfdf5',
                              color: isPaused ? '#92400e' : '#065f46',
                            }}
                          >
                            {isPaused ? 'Paused' : 'Active'}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: '#f1f5f9',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            ±{alert.radiusKm} km radius
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                            }}
                          >
                            Min {alert.minSeats} {alert.minSeats === 1 ? 'seat' : 'seats'}
                          </span>
                        </div>

                        {/* Origin -> Destination */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={16} color="#2563eb" />
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {alert.origin}
                            </span>
                          </div>
                          <ArrowRight size={16} color="#94a3b8" />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={16} color="#16a34a" />
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {alert.destination}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePause(alert)}
                          disabled={isActionBusy}
                          leftIcon={isPaused ? <Play size={14} color="#16a34a" /> : <Pause size={14} color="#d97706" />}
                          title={isPaused ? 'Resume matching' : 'Pause matching'}
                        >
                          {isPaused ? 'Resume' : 'Pause'}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(alert)}
                          disabled={isActionBusy}
                          leftIcon={<Edit2 size={14} />}
                          title="Edit alert preferences"
                        >
                          Edit
                        </Button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmAlert(alert)}
                          disabled={isActionBusy}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-medium)',
                            backgroundColor: '#ffffff',
                            color: '#ef4444',
                            cursor: 'pointer',
                          }}
                          title="Delete alert"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Meta Row: Preferred Departure Window */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        paddingTop: '10px',
                        borderTop: '1px solid var(--border-light)',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} color="#64748b" />
                        <span>
                          {alert.earliestDepartureTime || alert.latestDepartureTime
                            ? `Window: ${alert.earliestDepartureTime || 'Any'} - ${alert.latestDepartureTime || 'Any'} IST`
                            : 'Any departure time'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Compass size={13} color="#64748b" />
                        <span>Directional matching enforced</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* EDIT MODAL */}
      {editModalAlert && (
        <Modal
          isOpen={true}
          onClose={() => setEditModalAlert(null)}
          title="Edit Alert Preferences"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Updating search preferences for <strong>{editModalAlert.origin} → {editModalAlert.destination}</strong>.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Search Radius: {editRadiusKm} km
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 5, 10, 15].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setEditRadiusKm(r)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '8px',
                      border: editRadiusKm === r ? '2px solid #2563eb' : '1px solid var(--border-medium)',
                      backgroundColor: editRadiusKm === r ? '#eff6ff' : '#ffffff',
                      color: editRadiusKm === r ? '#1d4ed8' : 'var(--text-primary)',
                      fontWeight: editRadiusKm === r ? 700 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Minimum Available Seats
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditMinSeats(s)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '8px',
                      border: editMinSeats === s ? '2px solid #2563eb' : '1px solid var(--border-medium)',
                      backgroundColor: editMinSeats === s ? '#eff6ff' : '#ffffff',
                      color: editMinSeats === s ? '#1d4ed8' : 'var(--text-primary)',
                      fontWeight: editMinSeats === s ? 700 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {s} {s === 1 ? 'seat' : 'seats'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                  Earliest Departure Time
                </label>
                <input
                  type="time"
                  value={editEarliestTime}
                  onChange={(e) => setEditEarliestTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                  Latest Departure Time
                </label>
                <input
                  type="time"
                  value={editLatestTime}
                  onChange={(e) => setEditLatestTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button variant="ghost" size="sm" onClick={() => setEditModalAlert(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                Save Preferences
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmAlert && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmAlert(null)}
          title="Delete Ride Alert"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete the alert for{' '}
              <strong>{deleteConfirmAlert.origin} → {deleteConfirmAlert.destination}</strong>?
              You will no longer receive matching notifications for this route. Past notifications will not be affected.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmAlert(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeleteAlert}
                style={{ backgroundColor: '#dc2626' }}
              >
                Delete Alert
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
