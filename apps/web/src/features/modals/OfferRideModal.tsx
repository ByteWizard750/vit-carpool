import React, { useState, useEffect } from 'react';
import {
  Car,
  Calendar,
  Clock,
  Users,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  PlusCircle,
  Edit2,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import {
  DriverRideResponseDto,
  VehicleResponseDto,
} from '@vit-carpool/contracts';

interface OfferRideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'PUBLISH' | 'MY_RIDES';
  onOpenVehicles?: () => void;
  onOpenVerification?: () => void;
  onOpenAuth?: () => void;
}

// VIT Chennai campus corridor recommendations
const POPULAR_LOCATIONS = [
  'VIT Chennai Campus (Vandalur-Kelambakkam)',
  'Tambaram Railway Station',
  'Guindy (Kathipara Junction)',
  'Velachery MRTS / Phoenix Mall',
  'Sholinganallur Junction (OMR)',
  'Chennai Airport (Meenambakkam)',
  'Adyar Bus Depot',
  'Koyambedu CMBT',
  'Perungalathur Junction',
  'Navalur (Vivira Mall)',
];

export const OfferRideModal: React.FC<OfferRideModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'PUBLISH',
  onOpenVehicles,
  onOpenVerification,
  onOpenAuth,
}) => {
  const { user, token } = useAuth();

  const [activeTab, setActiveTab] = useState<'PUBLISH' | 'MY_RIDES'>(initialTab);
  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [myRides, setMyRides] = useState<DriverRideResponseDto[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form fields
  const [editingRideId, setEditingRideId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupDescription, setPickupDescription] = useState('');
  const [dropoffDescription, setDropoffDescription] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [availableSeats, setAvailableSeats] = useState<number>(3);
  const [costPerSeat, setCostPerSeat] = useState<string>('50');

  // Cancel confirmation state
  const [rideToCancel, setRideToCancel] = useState<DriverRideResponseDto | null>(null);

  // Default departure time generator (2 hours from now formatted for datetime-local)
  const getDefaultDepartureTime = () => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // Min departure time allowed (10 minutes from now)
  const getMinDepartureTime = () => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // Fetch driver's active vehicles
  const fetchVehicles = async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoadingVehicles(true);
    try {
      const res = await fetch('/api/vehicles', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
        if (data.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(data[0].id);
          setAvailableSeats(Math.min(3, data[0].capacity - 1));
        }
      }
    } catch {
      // Ignore network errors on background fetch
    } finally {
      setLoadingVehicles(false);
    }
  };

  // Fetch driver's published rides
  const fetchMyRides = async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoadingRides(true);
    try {
      const res = await fetch('/api/rides/mine', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyRides(data);
      }
    } catch {
      // Ignore network errors on background fetch
    } finally {
      setLoadingRides(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setError(null);
      setSuccessMessage(null);
      setEditingRideId(null);
      setRideToCancel(null);

      if (!departureTime) {
        setDepartureTime(getDefaultDepartureTime());
      }

      if (token && user?.verificationStatus === 'VERIFIED') {
        fetchVehicles();
        fetchMyRides();
      }
    }
  }, [isOpen, initialTab, token, user?.verificationStatus]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const maxPassengerSeats = selectedVehicle ? selectedVehicle.capacity - 1 : 4;

  const resetForm = () => {
    setEditingRideId(null);
    setOrigin('');
    setDestination('');
    setPickupDescription('');
    setDropoffDescription('');
    setDepartureTime(getDefaultDepartureTime());
    setCostPerSeat('50');
    if (vehicles.length > 0) {
      setSelectedVehicleId(vehicles[0].id);
      setAvailableSeats(Math.min(3, vehicles[0].capacity - 1));
    }
  };

  const handleStartEdit = (ride: DriverRideResponseDto) => {
    setEditingRideId(ride.id);
    setSelectedVehicleId(ride.vehicleId);
    setOrigin(ride.origin);
    setDestination(ride.destination);
    setPickupDescription(ride.pickupDescription || '');
    setDropoffDescription(ride.dropoffDescription || '');
    setAvailableSeats(ride.availableSeats);
    setCostPerSeat(ride.costPerSeat !== null ? String(ride.costPerSeat) : '');

    const depDate = new Date(ride.departureTime);
    depDate.setMinutes(depDate.getMinutes() - depDate.getTimezoneOffset());
    setDepartureTime(depDate.toISOString().slice(0, 16));

    setActiveTab('PUBLISH');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const isEdit = Boolean(editingRideId);
      const url = isEdit ? `/api/rides/${editingRideId}` : '/api/rides';
      const method = isEdit ? 'PATCH' : 'POST';

      const payload: Record<string, any> = {
        origin: origin.trim(),
        destination: destination.trim(),
        pickupDescription: pickupDescription.trim() || null,
        dropoffDescription: dropoffDescription.trim() || null,
        departureTime: new Date(departureTime).toISOString(),
        availableSeats: Number(availableSeats),
        costPerSeat: costPerSeat ? Number(costPerSeat) : null,
      };

      if (!isEdit) {
        payload.vehicleId = selectedVehicleId;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || 'Failed to save ride.');
      }

      setSuccessMessage(
        isEdit
          ? 'Ride details updated successfully.'
          : 'Your ride has been successfully published for the campus community!',
      );

      resetForm();
      await fetchMyRides();
      setActiveTab('MY_RIDES');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!token || !rideToCancel) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/rides/${rideToCancel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || 'Failed to cancel ride.');
      }

      setSuccessMessage('Ride has been cancelled.');
      setRideToCancel(null);
      await fetchMyRides();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to cancel ride.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        editingRideId
          ? 'Edit Scheduled Ride'
          : activeTab === 'PUBLISH'
          ? 'Offer a Ride (Campus Ride Share)'
          : 'My Published Rides'
      }
      maxWidth="620px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {activeTab === 'PUBLISH' && user?.verificationStatus === 'VERIFIED' && vehicles.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={submitting}
              id="submit-ride-btn"
            >
              {editingRideId ? 'Save Changes' : 'Publish Ride'}
            </Button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Navigation Tabs */}
        {user?.verificationStatus === 'VERIFIED' && !editingRideId && (
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '8px',
              padding: '4px',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveTab('PUBLISH');
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'PUBLISH' ? '#ffffff' : 'transparent',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: activeTab === 'PUBLISH' ? 'var(--color-brand-800)' : 'var(--text-muted)',
                boxShadow: activeTab === 'PUBLISH' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
              id="tab-publish-ride"
            >
              <PlusCircle size={15} />
              <span>Publish a Ride</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveTab('MY_RIDES');
                fetchMyRides();
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'MY_RIDES' ? '#ffffff' : 'transparent',
                fontWeight: 600,
                fontSize: '0.85rem',
                color: activeTab === 'MY_RIDES' ? 'var(--color-brand-800)' : 'var(--text-muted)',
                boxShadow: activeTab === 'MY_RIDES' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
              id="tab-my-rides"
            >
              <Calendar size={15} />
              <span>My Rides ({myRides.length})</span>
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.825rem',
              color: '#b91c1c',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Global Success Banner */}
        {successMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.825rem',
              color: '#166534',
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1. Unauthenticated Gate */}
        {!user && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-brand-50)',
                color: 'var(--color-brand-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Car size={24} />
            </div>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>
              Institutional Sign-In Required
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '380px' }}>
              Only verified members of the VIT Chennai student and faculty community can publish and share rides.
            </p>
            {onOpenAuth && (
              <Button variant="primary" size="sm" onClick={() => { onClose(); onOpenAuth(); }}>
                Sign In with VIT Account
              </Button>
            )}
          </div>
        )}

        {/* 2. Ineligible Account Gate */}
        {user && user.verificationStatus !== 'VERIFIED' && (
          <div
            style={{
              padding: '18px 16px',
              borderRadius: '8px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 700, fontSize: '0.9rem' }}>
              <ShieldCheck size={18} />
              <span>Institutional Verification Required</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.825rem', color: '#78350f', lineHeight: 1.5 }}>
              In accordance with campus security invariants, ride publishing is strictly reserved for verified students and faculty.
              Your account status is currently <strong>{user.verificationStatus}</strong>.
            </p>
            {user.verificationStatus === 'PENDING' && onOpenVerification && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onClose(); onOpenVerification(); }}
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                Submit ID Verification Proof
              </Button>
            )}
          </div>
        )}

        {/* 3. Verified User without Vehicles Gate */}
        {user && user.verificationStatus === 'VERIFIED' && vehicles.length === 0 && !loadingVehicles && (
          <div
            style={{
              padding: '24px 16px',
              borderRadius: '8px',
              border: '1px dashed var(--border-medium)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Car size={32} style={{ color: 'var(--color-brand-600)' }} />
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
              No Active Registered Vehicle
            </h4>
            <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)', maxWidth: '360px' }}>
              To offer a ride to fellow campus peers, please register a passenger car that you own.
            </p>
            {onOpenVehicles && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => { onClose(); onOpenVehicles(); }}
                leftIcon={<Car size={14} />}
                id="modal-add-vehicle-btn"
              >
                Register a Vehicle
              </Button>
            )}
          </div>
        )}

        {/* 4. Ride Publishing / Edit Form */}
        {user && user.verificationStatus === 'VERIFIED' && vehicles.length > 0 && activeTab === 'PUBLISH' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Vehicle Selection */}
            {!editingRideId && (
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Select Vehicle *
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSelectedVehicleId(newId);
                    const v = vehicles.find((item) => item.id === newId);
                    if (v) {
                      setAvailableSeats(Math.min(availableSeats, v.capacity - 1));
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                    backgroundColor: 'var(--bg-surface)',
                  }}
                  id="ride-vehicle-select"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} ({v.color}) — {v.registrationNumber} (Max {v.capacity - 1} passengers)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Origin & Destination */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Origin Location *
                </label>
                <input
                  type="text"
                  list="corridor-locations"
                  placeholder="e.g. Tambaram"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-origin-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Destination Location *
                </label>
                <input
                  type="text"
                  list="corridor-locations"
                  placeholder="e.g. VIT Chennai"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-destination-input"
                />
              </div>
            </div>

            <datalist id="corridor-locations">
              {POPULAR_LOCATIONS.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>

            {/* Departure Date & Time */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                Departure Date & Time *
              </label>
              <input
                type="datetime-local"
                min={getMinDepartureTime()}
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.85rem',
                }}
                id="ride-departure-input"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Note: Scheduled rides lock 15 minutes prior to departure.
              </span>
            </div>

            {/* Passenger Seats & Fuel Cost Share */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Passenger Seats Offered *
                </label>
                <input
                  type="number"
                  min={1}
                  max={maxPassengerSeats}
                  value={availableSeats}
                  onChange={(e) => setAvailableSeats(Number(e.target.value))}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-seats-input"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Max {maxPassengerSeats} seats (excluding driver)
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Suggested Cost Share (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  placeholder="e.g. 50"
                  value={costPerSeat}
                  onChange={(e) => setCostPerSeat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-cost-input"
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Non-commercial peer fuel share
                </span>
              </div>
            </div>

            {/* Landmark / Meeting descriptions (Optional) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Pickup Landmark (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near East Gate"
                  value={pickupDescription}
                  onChange={(e) => setPickupDescription(e.target.value)}
                  maxLength={255}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-pickup-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Dropoff Landmark (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Academic Block 1"
                  value={dropoffDescription}
                  onChange={(e) => setDropoffDescription(e.target.value)}
                  maxLength={255}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.85rem',
                  }}
                  id="ride-dropoff-input"
                />
              </div>
            </div>

            {/* Audience Transparency Notice */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-brand-50)',
                border: '1px solid var(--color-brand-200)',
                fontSize: '0.8rem',
                color: 'var(--color-brand-900)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ShieldCheck size={16} style={{ color: 'var(--color-brand-700)', flexShrink: 0 }} />
              <span>
                Audience: <strong>{user.audience === 'FACULTY' ? 'Faculty Only' : 'Student Only'}</strong>.
                Rides are isolated exclusively to peers within your verified institutional cohort.
              </span>
            </div>

            {editingRideId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setActiveTab('MY_RIDES');
                }}
              >
                Cancel Edit
              </Button>
            )}
          </form>
        )}

        {/* 5. Driver's Published Rides View */}
        {user && user.verificationStatus === 'VERIFIED' && activeTab === 'MY_RIDES' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loadingRides && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <span>Loading your published rides...</span>
              </div>
            )}

            {!loadingRides && myRides.length === 0 && (
              <div
                style={{
                  padding: '24px 16px',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-medium)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Calendar size={28} style={{ color: 'var(--text-muted)' }} />
                <h4 style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                  No Rides Published Yet
                </h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Publish your commute journey to offer seats to campus peers.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveTab('PUBLISH')}
                  style={{ marginTop: '6px' }}
                >
                  Publish a Ride
                </Button>
              </div>
            )}

            {!loadingRides &&
              myRides.map((ride) => {
                const dep = new Date(ride.departureTime);
                const isCancelled = ride.status === 'CANCELLED';
                const isPast = dep.getTime() <= Date.now();
                const isWithin15Mins = dep.getTime() <= Date.now() + 15 * 60 * 1000;
                const canModify = !isCancelled && !isPast && !isWithin15Mins;

                return (
                  <div
                    key={ride.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      backgroundColor: isCancelled ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.9rem' }}>
                        <span>{ride.origin}</span>
                        <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
                        <span>{ride.destination}</span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          backgroundColor: isCancelled ? '#fee2e2' : '#dcfce7',
                          color: isCancelled ? '#991b1b' : '#15803d',
                        }}
                      >
                        {ride.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} />
                        <span>{dep.toLocaleDateString()} at {dep.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={13} />
                        <span>{ride.availableSeats} seats</span>
                      </div>
                      {ride.costPerSeat !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <span>₹{ride.costPerSeat}/seat</span>
                        </div>
                      )}
                      {ride.vehicle && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Car size={13} />
                          <span>{ride.vehicle.make} {ride.vehicle.model} ({ride.vehicle.registrationNumber})</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isCancelled && !isPast && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        {canModify ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartEdit(ride)}
                              leftIcon={<Edit2 size={13} />}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setRideToCancel(ride)}
                              leftIcon={<Trash2 size={13} />}
                            >
                              Cancel Ride
                            </Button>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                            Schedule locked (&lt; 15 mins to departure)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Cancel Confirmation Modal View */}
        {rideToCancel && (
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 700 }}>
              <AlertCircle size={18} />
              <span>Confirm Ride Cancellation</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.825rem', color: '#7f1d1d' }}>
              Are you sure you want to cancel your ride from <strong>{rideToCancel.origin}</strong> to <strong>{rideToCancel.destination}</strong>?
              This will remove the ride from future listings and mark it as cancelled.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => setRideToCancel(null)} disabled={submitting}>
                Back
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmCancel}
                isLoading={submitting}
                id="confirm-cancel-ride-btn"
              >
                Yes, Cancel Ride
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
