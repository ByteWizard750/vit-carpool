import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Car,
  Calendar,
  Users,
  MapPin,
  Navigation,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PlusCircle,
  Zap,
  Repeat,
  Sparkles,
  Clock,
  ArrowRight,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { useAuth } from '../features/auth/AuthContext';
import {
  VehicleResponseDto,
  LocationSuggestionDto,
  DriverRideResponseDto,
  QuickRideTemplatesResponseDto,
  ReusableRideTemplateDto,
} from '@vit-carpool/contracts';

// Convert a Date to YYYY-MM-DDTHH:mm string in Asia/Kolkata timezone
const toKolkataInputString = (date: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};

// Format a datetime string to readable display in Asia/Kolkata
const formatKolkataDisplay = (isoOrInputStr: string): string => {
  try {
    const d = new Date(isoOrInputStr);
    if (isNaN(d.getTime())) return isoOrInputStr;
    return (
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d) + ' IST'
    );
  } catch {
    return isoOrInputStr;
  }
};

export const OfferRidePage: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editRideId = searchParams.get('edit');
  const urlMode = searchParams.get('mode');

  // Mode: 'quick' or 'custom'. Edit mode defaults to 'custom'
  const [mode, setMode] = useState<'quick' | 'custom'>(() => {
    if (editRideId) return 'custom';
    if (urlMode === 'custom') return 'custom';
    return 'quick';
  });

  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingRide, setLoadingRide] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Quick Ride state
  const [templates, setTemplates] = useState<QuickRideTemplatesResponseDto | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ReusableRideTemplateDto | null>(null);
  const [quickDepartureTime, setQuickDepartureTime] = useState<string>('');
  const [quickVehicleId, setQuickVehicleId] = useState<string>('');
  const [quickSeats, setQuickSeats] = useState<number>(3);
  const [quickCost, setQuickCost] = useState<string>('50');

  // Custom Form fields
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [origin, setOrigin] = useState('');
  const [originLocation, setOriginLocation] = useState<LocationSuggestionDto | null>(null);
  const [destination, setDestination] = useState('');
  const [destLocation, setDestLocation] = useState<LocationSuggestionDto | null>(null);
  const [pickupDescription, setPickupDescription] = useState('');
  const [dropoffDescription, setDropoffDescription] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [availableSeats, setAvailableSeats] = useState<number>(3);
  const [costPerSeat, setCostPerSeat] = useState<string>('50');

  // Min departure time allowed (10 minutes from now in Asia/Kolkata)
  const minAllowedDateTime = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    return toKolkataInputString(d);
  }, []);

  // Default departure time (1 hour from now)
  const defaultFutureDateTime = useMemo(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return toKolkataInputString(d);
  }, []);

  // Fetch driver's active vehicles
  useEffect(() => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;

    const fetchVehicles = async () => {
      setLoadingVehicles(true);
      try {
        const res = await fetch('/api/vehicles', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: VehicleResponseDto[] = await res.json();
          setVehicles(data);
          if (data.length > 0 && !selectedVehicleId) {
            setSelectedVehicleId(data[0].id);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch vehicles:', err);
      } finally {
        setLoadingVehicles(false);
      }
    };

    fetchVehicles();
  }, [token, user?.verificationStatus]);

  // Fetch Quick Ride reusable templates
  useEffect(() => {
    if (!token || user?.verificationStatus !== 'VERIFIED' || editRideId) return;

    const fetchTemplates = async () => {
      setLoadingTemplates(true);
      try {
        const res = await fetch('/rides/quick-templates', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: QuickRideTemplatesResponseDto = await res.json();
          setTemplates(data);

          if (data.recentRide) {
            applyTemplateToQuickRide(data.recentRide);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch quick ride templates:', err);
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, [token, user?.verificationStatus, editRideId]);

  // Apply a template to Quick Ride fields
  const applyTemplateToQuickRide = (template: ReusableRideTemplateDto) => {
    setSelectedTemplate(template);

    // Vehicle check: if template vehicle is deleted or not found, fall back to first active vehicle
    const isVehicleAvailable = vehicles.some((v) => v.id === template.vehicleId);
    if (isVehicleAvailable) {
      setQuickVehicleId(template.vehicleId);
    } else if (vehicles.length > 0) {
      setQuickVehicleId(vehicles[0].id);
    } else {
      setQuickVehicleId(template.vehicleId);
    }

    setQuickSeats(template.availableSeats || 3);
    setQuickCost(template.costPerSeat !== null ? template.costPerSeat.toString() : '50');

    // Smart default departure time in Asia/Kolkata:
    // If not already chosen, set to 1 hour from now
    if (!quickDepartureTime) {
      setQuickDepartureTime(defaultFutureDateTime);
    }
  };

  // Sync quick vehicle when vehicles finish loading
  useEffect(() => {
    if (vehicles.length > 0 && !quickVehicleId && selectedTemplate) {
      const exists = vehicles.some((v) => v.id === selectedTemplate.vehicleId);
      setQuickVehicleId(exists ? selectedTemplate.vehicleId : vehicles[0].id);
    }
  }, [vehicles, quickVehicleId, selectedTemplate]);

  // If in edit mode, fetch existing ride data
  useEffect(() => {
    if (!editRideId || !token) {
      if (!departureTime) setDepartureTime(defaultFutureDateTime);
      return;
    }

    const fetchRideToEdit = async () => {
      setLoadingRide(true);
      try {
        const res = await fetch(`/rides/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const myRides: DriverRideResponseDto[] = await res.json();
          const target = myRides.find((r) => r.id === editRideId);
          if (target) {
            setSelectedVehicleId(target.vehicleId);
            setOrigin(target.origin);
            setDestination(target.destination);
            setPickupDescription(target.pickupDescription || '');
            setDropoffDescription(target.dropoffDescription || '');
            setAvailableSeats(target.availableSeats);
            setCostPerSeat(target.costPerSeat !== null ? target.costPerSeat.toString() : '0');
            setDepartureTime(toKolkataInputString(new Date(target.departureTime)));
          }
        }
      } catch (err) {
        console.warn('Failed to load ride for editing:', err);
      } finally {
        setLoadingRide(false);
      }
    };

    fetchRideToEdit();
  }, [editRideId, token, defaultFutureDateTime]);

  // Quick Preset buttons (+30m, +1h, +2h, Tomorrow 8:30am)
  const setQuickPresetTime = (offsetMinutes: number, explicitHour?: number, explicitMinute?: number) => {
    const d = new Date();
    if (explicitHour !== undefined) {
      // Set to tomorrow at explicit hour/minute in Asia/Kolkata
      d.setDate(d.getDate() + 1);
      d.setHours(explicitHour, explicitMinute || 0, 0, 0);
    } else {
      d.setMinutes(d.getMinutes() + offsetMinutes);
    }
    setQuickDepartureTime(toKolkataInputString(d));
  };

  // Copy template data into Custom Form if driver wants advanced customization
  const handleTransferToCustomForm = () => {
    if (!selectedTemplate) return;
    setOrigin(selectedTemplate.origin);
    setDestination(selectedTemplate.destination);
    setSelectedVehicleId(quickVehicleId || selectedTemplate.vehicleId);
    setAvailableSeats(quickSeats);
    setCostPerSeat(quickCost);
    if (quickDepartureTime) {
      setDepartureTime(quickDepartureTime);
    }
    if (selectedTemplate.originLatitude && selectedTemplate.originLongitude) {
      setOriginLocation({
        id: selectedTemplate.originPlaceId || `loc-${selectedTemplate.id}-origin`,
        name: selectedTemplate.origin,
        latitude: selectedTemplate.originLatitude,
        longitude: selectedTemplate.originLongitude,
        address: selectedTemplate.originAddress || selectedTemplate.origin,
      });
    }
    if (selectedTemplate.destinationLatitude && selectedTemplate.destinationLongitude) {
      setDestLocation({
        id: selectedTemplate.destinationPlaceId || `loc-${selectedTemplate.id}-dest`,
        name: selectedTemplate.destination,
        latitude: selectedTemplate.destinationLatitude,
        longitude: selectedTemplate.destinationLongitude,
        address: selectedTemplate.destinationAddress || selectedTemplate.destination,
      });
    }
    setMode('custom');
    setSearchParams({ mode: 'custom' });
  };

  // Handle Quick Ride publishing
  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedTemplate) {
      setError('Please select a commute route to publish.');
      return;
    }

    if (!quickVehicleId) {
      setError('Please select an active registered car.');
      return;
    }

    if (!quickDepartureTime) {
      setError('Please choose or confirm a departure date and time.');
      return;
    }

    const depDate = new Date(quickDepartureTime);
    if (depDate.getTime() <= Date.now() + 5 * 60 * 1000) {
      setError('Departure time must be scheduled at least 10 minutes in the future.');
      return;
    }

    const costNum = quickCost.trim() === '' ? 0 : Number(quickCost);
    if (isNaN(costNum) || costNum < 0 || costNum > 250) {
      setError('Cost contribution must be between ₹0 and ₹250 per seat.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        vehicleId: quickVehicleId,
        origin: selectedTemplate.origin.trim(),
        destination: selectedTemplate.destination.trim(),
        departureTime: depDate.toISOString(),
        availableSeats: quickSeats,
        costPerSeat: costNum,
      };

      if (selectedTemplate.originLatitude !== undefined && selectedTemplate.originLongitude !== undefined) {
        payload.originLatitude = selectedTemplate.originLatitude;
        payload.originLongitude = selectedTemplate.originLongitude;
      }
      if (selectedTemplate.destinationLatitude !== undefined && selectedTemplate.destinationLongitude !== undefined) {
        payload.destinationLatitude = selectedTemplate.destinationLatitude;
        payload.destinationLongitude = selectedTemplate.destinationLongitude;
      }

      const res = await fetch('/rides', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to publish quick ride (${res.status})`);
      }

      setSuccessMsg('Quick Ride successfully published to campus corridors!');
      setTimeout(() => {
        navigate('/my-rides');
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Error occurred while publishing quick ride.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Custom Ride publishing / editing
  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedVehicleId) {
      setError('Please select or register a vehicle to publish this ride.');
      return;
    }

    if (!origin.trim() || !destination.trim()) {
      setError('Both origin and destination locations are required.');
      return;
    }

    if (!departureTime) {
      setError('Please specify a departure date and time.');
      return;
    }

    const depDate = new Date(departureTime);
    if (depDate.getTime() <= Date.now() + 5 * 60 * 1000) {
      setError('Departure time must be scheduled at least 10 minutes in the future.');
      return;
    }

    const costNum = costPerSeat.trim() === '' ? 0 : Number(costPerSeat);
    if (isNaN(costNum) || costNum < 0 || costNum > 250) {
      setError('Cost contribution must be between ₹0 and ₹250 per seat (Cars-only non-commercial cap).');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        vehicleId: selectedVehicleId,
        origin: origin.trim(),
        destination: destination.trim(),
        departureTime: depDate.toISOString(),
        availableSeats,
        costPerSeat: costNum,
      };

      if (originLocation?.latitude !== undefined && originLocation?.longitude !== undefined) {
        payload.originLatitude = originLocation.latitude;
        payload.originLongitude = originLocation.longitude;
      }
      if (destLocation?.latitude !== undefined && destLocation?.longitude !== undefined) {
        payload.destinationLatitude = destLocation.latitude;
        payload.destinationLongitude = destLocation.longitude;
      }
      if (pickupDescription.trim()) {
        payload.pickupDescription = pickupDescription.trim();
      }
      if (dropoffDescription.trim()) {
        payload.dropoffDescription = dropoffDescription.trim();
      }

      const url = editRideId ? `/rides/${editRideId}` : '/rides';
      const method = editRideId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to ${editRideId ? 'update' : 'publish'} ride (${res.status})`);
      }

      setSuccessMsg(editRideId ? 'Ride successfully updated!' : 'Ride successfully published to campus corridors!');
      setTimeout(() => {
        navigate('/my-rides');
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving your ride.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeVehicle = vehicles.find((v) => v.id === (mode === 'quick' ? quickVehicleId : selectedVehicleId));
  const isSelectedVehicleDeleted = selectedTemplate && !vehicles.some((v) => v.id === selectedTemplate.vehicleId);

  return (
    <div className="container" style={{ padding: '36px 16px 64px', maxWidth: '740px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          {editRideId ? 'Edit Published Ride' : 'Offer a Campus Ride'}
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Share your daily commute with verified peers in your {user?.audience} cohort. Help reduce campus traffic and split fuel costs.
        </p>
      </div>

      {/* Mode Switcher Tabs (Only visible when not editing an existing ride) */}
      {!editRideId && (
        <div
          style={{
            display: 'flex',
            backgroundColor: '#f1f5f9',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '28px',
            gap: '4px',
          }}
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'quick'}
            onClick={() => {
              setMode('quick');
              setSearchParams({ mode: 'quick' });
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '0.875rem',
              fontWeight: mode === 'quick' ? 700 : 500,
              color: mode === 'quick' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary, #64748b)',
              backgroundColor: mode === 'quick' ? '#ffffff' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: mode === 'quick' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="tab-quick-ride"
          >
            <Zap size={16} style={{ color: mode === 'quick' ? '#eab308' : 'currentColor' }} />
            <span>Quick Ride</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: mode === 'quick' ? '#fef08a' : '#e2e8f0',
                color: mode === 'quick' ? '#854d0e' : '#475569',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              1-Click
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'custom'}
            onClick={() => {
              setMode('custom');
              setSearchParams({ mode: 'custom' });
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 16px',
              fontSize: '0.875rem',
              fontWeight: mode === 'custom' ? 700 : 500,
              color: mode === 'custom' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary, #64748b)',
              backgroundColor: mode === 'custom' ? '#ffffff' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: mode === 'custom' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="tab-custom-ride"
          >
            <SlidersHorizontal size={16} />
            <span>Custom Ride</span>
          </button>
        </div>
      )}

      {/* No Vehicles Warning */}
      {!loadingVehicles && vehicles.length === 0 && (
        <div
          style={{
            padding: '24px',
            backgroundColor: '#fef3c7',
            borderRadius: '12px',
            border: '1px solid #fde68a',
            marginBottom: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#92400e', fontWeight: 700 }}>
            <Car size={18} /> No Registered Vehicles Found
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f' }}>
            To offer a ride, you must register at least one verified car. Two-wheelers and commercial vehicles are not permitted.
          </p>
          <div>
            <Link to="/vehicles">
              <Button variant="primary" size="sm" leftIcon={<PlusCircle size={14} />}>
                Register a Car Now
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMsg && (
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '10px',
            color: '#166534',
            fontSize: '0.9rem',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg} Redirecting to My Rides...</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#991b1b',
            fontSize: '0.85rem',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK RIDE WORKFLOW                                                       */}
      {/* ========================================================================= */}
      {mode === 'quick' && !editRideId && (
        <div>
          {loadingTemplates ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading your frequent commute routes...</div>
            </div>
          ) : !templates?.recentRide ? (
            /* Empty State: No previous rides to repeat */
            <div
              style={{
                padding: '44px 24px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
                textAlign: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#fef08a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#854d0e',
                }}
              >
                <Sparkles size={28} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
                No Previous Commutes to Repeat Yet
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                Quick Ride saves your frequent peer corridors so you can re-publish in seconds. Once you post your first ride, it will appear here for instant 1-click repetition.
              </p>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setMode('custom');
                  setSearchParams({ mode: 'custom' });
                }}
                leftIcon={<PlusCircle size={16} />}
                id="btn-create-first-custom-ride"
              >
                Post Your First Ride (Custom Form)
              </Button>
            </div>
          ) : (
            /* Active Quick Ride Experience */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Hero Action: Repeat Last Ride */}
              <div
                style={{
                  padding: '20px 22px',
                  backgroundColor: '#f8fafc',
                  border: '2px solid #2563eb',
                  borderRadius: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.08)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Repeat size={12} /> Repeat Last Ride
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Published {new Date(templates.recentRide.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{templates.recentRide.origin}</span>
                    <ArrowRight size={15} style={{ color: 'var(--color-brand-600)' }} />
                    <span>{templates.recentRide.destination}</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => applyTemplateToQuickRide(templates.recentRide!)}
                  leftIcon={<Repeat size={14} />}
                  id="btn-repeat-last-ride"
                >
                  Load Last Ride
                </Button>
              </div>

              {/* Saved Routes Selector (if driver has multiple routes) */}
              {templates.routes.length > 1 && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Or Pick from Your Saved Commute Routes ({templates.routes.length}):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {templates.routes.map((rt) => {
                      const isSelected = selectedTemplate?.id === rt.id;
                      return (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => applyTemplateToQuickRide(rt)}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                            border: isSelected ? '1px solid #2563eb' : '1px solid var(--border-medium)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.825rem',
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#1d4ed8' : 'var(--text-primary)',
                            boxShadow: isSelected ? '0 1px 3px rgba(37,99,235,0.1)' : 'none',
                          }}
                        >
                          <span>{rt.origin} &rarr; {rt.destination}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Inactive Vehicle Warning Banner */}
              {isSelectedVehicleDeleted && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={16} />
                  <span>The car used for this previous ride is no longer active. An active car has been selected for you below.</span>
                </div>
              )}

              {/* Quick Ride Configuration Form */}
              {selectedTemplate && (
                <form
                  onSubmit={handleQuickSubmit}
                  style={{
                    padding: '24px',
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid var(--border-light)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                  }}
                >
                  {/* Route Summary Section (Pre-filled Saved Default) */}
                  <div
                    style={{
                      padding: '14px 16px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        ✓ Reused Route Corridor
                      </span>
                      <button
                        type="button"
                        onClick={handleTransferToCustomForm}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '0.75rem',
                          color: 'var(--color-brand-600)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        Change route in full form <ChevronRight size={12} />
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <MapPin size={15} style={{ color: '#2563eb' }} />
                        <span>Origin: {selectedTemplate.origin}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        <Navigation size={15} style={{ color: '#16a34a' }} />
                        <span>Destination: {selectedTemplate.destination}</span>
                      </div>
                    </div>
                  </div>

                  {/* Required Departure Date & Time Selection (Asia/Kolkata) */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={14} style={{ color: 'var(--color-brand-600)' }} />
                        Departure Date & Time (Asia/Kolkata) *
                      </label>
                      <span style={{ fontSize: '0.725rem', color: '#dc2626', fontWeight: 600 }}>
                        Required for new ride
                      </span>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setQuickPresetTime(30)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        +30 Mins
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickPresetTime(60)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        +1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickPresetTime(120)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        +2 Hours
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickPresetTime(0, 8, 30)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid var(--border-medium)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Tomorrow 8:30 AM
                      </button>
                    </div>

                    <input
                      type="datetime-local"
                      value={quickDepartureTime}
                      min={minAllowedDateTime}
                      onChange={(e) => setQuickDepartureTime(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '0.875rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        backgroundColor: '#ffffff',
                        outline: 'none',
                      }}
                      id="quick-departure-time"
                    />

                    {quickDepartureTime && (
                      <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        <span>Scheduled for: <strong>{formatKolkataDisplay(quickDepartureTime)}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* Vehicle, Seats, Cost Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                    {/* Vehicle Selection */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                        Vehicle *
                      </label>
                      <select
                        value={quickVehicleId}
                        onChange={(e) => setQuickVehicleId(e.target.value)}
                        required
                        disabled={vehicles.length === 0}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '0.825rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-medium)',
                          backgroundColor: '#ffffff',
                          outline: 'none',
                        }}
                        id="quick-vehicle-select"
                      >
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.make} {v.model} ({v.color}) &bull; {v.capacity} seats
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Seats Selection */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                        Seats Offered *
                      </label>
                      <select
                        value={quickSeats}
                        onChange={(e) => setQuickSeats(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '0.825rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-medium)',
                          backgroundColor: '#ffffff',
                          outline: 'none',
                        }}
                        id="quick-seats-select"
                      >
                        {[1, 2, 3, 4, 5, 6].map((num) => (
                          <option key={num} value={num}>
                            {num} {num === 1 ? 'Seat' : 'Seats'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Cost Per Seat */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                        Cost per Seat (₹) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={250}
                        value={quickCost}
                        onChange={(e) => setQuickCost(e.target.value)}
                        placeholder="50"
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          fontSize: '0.825rem',
                          borderRadius: '8px',
                          border: '1px solid var(--border-medium)',
                          backgroundColor: '#ffffff',
                          outline: 'none',
                        }}
                        id="quick-cost-input"
                      />
                    </div>
                  </div>

                  {/* Final Review / Confirmation Summary Panel */}
                  <div
                    style={{
                      padding: '16px',
                      backgroundColor: '#eff6ff',
                      borderRadius: '12px',
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#1e40af', marginBottom: '8px' }}>
                      <ShieldCheck size={15} /> Final Quick Ride Summary:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.8rem', color: '#1e3a8a' }}>
                      <div><strong>Corridor:</strong> {selectedTemplate.origin} &rarr; {selectedTemplate.destination}</div>
                      <div><strong>Car:</strong> {activeVehicle ? `${activeVehicle.make} ${activeVehicle.model}` : 'Registered Car'}</div>
                      <div><strong>Time:</strong> {formatKolkataDisplay(quickDepartureTime)}</div>
                      <div><strong>Capacity:</strong> {quickSeats} seats at ₹{quickCost || 0}/seat</div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleTransferToCustomForm}
                    >
                      Customize Full Form
                    </Button>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={() => navigate('/my-rides')}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        disabled={submitting || vehicles.length === 0}
                        leftIcon={submitting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        id="quick-ride-submit-btn"
                      >
                        {submitting ? 'Publishing Quick Ride...' : 'Publish Quick Ride'}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM RIDE WORKFLOW (Original Full Experience Completely Preserved)      */}
      {/* ========================================================================= */}
      {(mode === 'custom' || editRideId) && (
        <form
          onSubmit={handleCustomSubmit}
          style={{
            padding: '28px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Vehicle Selection */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Registered Vehicle *
              </label>
              <Link to="/vehicles" style={{ fontSize: '0.75rem', color: 'var(--color-brand-600)', fontWeight: 600 }}>
                + Manage Cars
              </Link>
            </div>
            <select
              value={selectedVehicleId}
              onChange={(e) => {
                setSelectedVehicleId(e.target.value);
                const v = vehicles.find((item) => item.id === e.target.value);
                if (v) setAvailableSeats(Math.min(v.capacity - 1, 4));
              }}
              required
              disabled={vehicles.length === 0 || loadingRide}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '0.875rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                backgroundColor: vehicles.length === 0 ? 'var(--bg-subtle)' : '#ffffff',
                outline: 'none',
              }}
              id="offer-ride-vehicle-select"
            >
              {vehicles.length === 0 ? (
                <option value="">No registered vehicles available</option>
              ) : (
                vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.make} {v.model} ({v.color}) &bull; Capacity: {v.capacity} seats
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Origin & Destination Autocomplete Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <MapPin size={13} style={{ color: '#2563eb' }} /> Starting Landmark / Area (Origin) *
              </label>
              <LocationAutocomplete
                id="offer-origin-autocomplete"
                value={origin}
                onChange={(val, loc) => {
                  setOrigin(val);
                  setOriginLocation(loc || null);
                }}
                selectedLocation={originLocation}
                placeholder="e.g. Tambaram Railway Station, Velachery, OMR..."
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Navigation size={13} style={{ color: '#16a34a' }} /> Destination Landmark (Campus / Transit Node) *
              </label>
              <LocationAutocomplete
                id="offer-destination-autocomplete"
                value={destination}
                onChange={(val, loc) => {
                  setDestination(val);
                  setDestLocation(loc || null);
                }}
                selectedLocation={destLocation}
                placeholder="e.g. VIT Chennai Campus, Kelambakkam..."
                required
              />
            </div>
          </div>

          {/* Departure Date & Time */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
              <Calendar size={13} style={{ color: 'var(--color-brand-600)' }} /> Departure Date & Time (Asia/Kolkata) *
            </label>
            <input
              type="datetime-local"
              value={departureTime}
              min={minAllowedDateTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '0.875rem',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                backgroundColor: '#ffffff',
                outline: 'none',
              }}
              id="offer-departure-time"
            />
          </div>

          {/* Seats and Cost Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                <Users size={13} /> Available Seats *
              </label>
              <select
                value={availableSeats}
                onChange={(e) => setAvailableSeats(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                }}
                id="offer-seats-select"
              >
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'Seat' : 'Seats'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                Cost per Seat (₹) *
              </label>
              <input
                type="number"
                min={0}
                max={250}
                value={costPerSeat}
                onChange={(e) => setCostPerSeat(e.target.value)}
                placeholder="e.g. 50"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '0.875rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  backgroundColor: '#ffffff',
                  outline: 'none',
                }}
                id="offer-cost-input"
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Non-commercial cap: max ₹250
              </span>
            </div>
          </div>

          {/* Pickup & Dropoff Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                Pickup Instructions (Optional)
              </label>
              <input
                type="text"
                value={pickupDescription}
                onChange={(e) => setPickupDescription(e.target.value)}
                placeholder="e.g. Near Station Gate 2 / Bus bay"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: '0.825rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                Dropoff Instructions (Optional)
              </label>
              <input
                type="text"
                value={dropoffDescription}
                onChange={(e) => setDropoffDescription(e.target.value)}
                placeholder="e.g. Main Gate / Library circle"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: '0.825rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-medium)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Submit Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => navigate('/my-rides')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={submitting || vehicles.length === 0}
              leftIcon={submitting ? <Loader2 size={16} className="animate-spin" /> : <Car size={16} />}
              id="offer-ride-submit-btn"
            >
              {submitting ? 'Saving Ride...' : editRideId ? 'Save Changes' : 'Publish Ride to Campus'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
