import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  IndianRupee,
  Info,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { LocationAutocomplete } from '../components/common/LocationAutocomplete';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { useAuth } from '../features/auth/AuthContext';
import {
  VehicleResponseDto,
  LocationSuggestionDto,
  DriverRideResponseDto,
  QuickRideTemplatesResponseDto,
  ReusableRideTemplateDto,
  toKolkataInputString,
  formatKolkataDisplay,
  getTomorrowPresetKolkata,
  parseKolkataDateTimeInput,
  generateIdempotencyKey,
  calculateCabFareSplit,
} from '@vit-carpool/contracts';

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

  // Ride Category: 'VEHICLE' (default) or 'CAB_SHARE'
  const [rideCategory, setRideCategory] = useState<'VEHICLE' | 'CAB_SHARE'>(() => {
    return searchParams.get('category') === 'cab' ? 'CAB_SHARE' : 'VEHICLE';
  });

  // Cab Share Form State
  const [cabOrigin, setCabOrigin] = useState('');
  const [cabOriginLocation, setCabOriginLocation] = useState<LocationSuggestionDto | null>(null);
  const [cabDestination, setCabDestination] = useState('');
  const [cabDestLocation, setCabDestLocation] = useState<LocationSuggestionDto | null>(null);
  const [cabDepartureTime, setCabDepartureTime] = useState<string>('');
  const [cabBookingDeadline, setCabBookingDeadline] = useState<string>('');
  const [cabTotalCapacity, setCabTotalCapacity] = useState<number>(4);
  const [cabEstimatedTotalFare, setCabEstimatedTotalFare] = useState<string>('800');
  const [cabService, setCabService] = useState<string>('');
  const [cabPickupDescription, setCabPickupDescription] = useState<string>('');
  const [cabDropoffDescription, setCabDropoffDescription] = useState<string>('');
  const [cabMaxDetourMinutes, setCabMaxDetourMinutes] = useState<number>(15);
  const cabAttemptRef = useRef<{ key: string; payloadStr: string } | null>(null);

  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingRide, setLoadingRide] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Idempotency state: tracks the active key bound to its submitted payload.
  // Reuses the key on exact retry; generates a fresh key if payload is edited or after confirmed success.
  const quickAttemptRef = useRef<{ key: string; payloadStr: string } | null>(null);
  const customAttemptRef = useRef<{ key: string; payloadStr: string } | null>(null);

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
  const [editingRide, setEditingRide] = useState<DriverRideResponseDto | null>(null);

  // Currently selected vehicle for custom ride
  const selectedVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  // Max passenger seats allowed for selected vehicle (capacity - 1 driver seat)
  const maxPassengerSeats = useMemo(() => {
    if (!selectedVehicle) return 4;
    return Math.max(1, selectedVehicle.capacity - 1);
  }, [selectedVehicle]);

  // Booked / confirmed seats on this ride if editing
  const editingConfirmedSeats = useMemo(() => {
    return editingRide?.confirmedSeatsCount || 0;
  }, [editingRide]);

  // If editing, availableSeats cannot exceed maxPassengerSeats - editingConfirmedSeats
  const maxAvailableForEdit = useMemo(() => {
    if (!editRideId) return maxPassengerSeats;
    return Math.max(1, maxPassengerSeats - editingConfirmedSeats);
  }, [editRideId, maxPassengerSeats, editingConfirmedSeats]);

  // Effective max allowed seats for the custom/edit form
  const effectiveMaxSeats = editRideId ? maxAvailableForEdit : maxPassengerSeats;

  // Non-binding fuel contribution guidance calculation based on road distance
  const routeGuidance = useMemo(() => {
    if (
      originLocation?.latitude != null &&
      originLocation?.longitude != null &&
      destLocation?.latitude != null &&
      destLocation?.longitude != null
    ) {
      const R = 6371; // Earth radius in km
      const dLat = ((destLocation.latitude - originLocation.latitude) * Math.PI) / 180;
      const dLon = ((destLocation.longitude - originLocation.longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((originLocation.latitude * Math.PI) / 180) *
          Math.cos((destLocation.latitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const straightKm = R * c;
      const roadKm = Math.round(straightKm * 1.3); // Typical road winding factor in Chennai corridors
      if (roadKm > 0) {
        // Suggested fair passenger share range: ₹2.5 to ₹4.5 per km rounded to nearest 5
        const minCost = Math.max(20, Math.round((roadKm * 2.5) / 5) * 5);
        const maxCost = Math.max(35, Math.round((roadKm * 4.5) / 5) * 5);
        return {
          available: true,
          roadKm,
          minCost,
          maxCost,
        };
      }
    }
    return { available: false, roadKm: 0, minCost: 0, maxCost: 0 };
  }, [originLocation, destLocation]);

  const quickRouteGuidance = useMemo(() => {
    if (
      selectedTemplate?.originLatitude != null &&
      selectedTemplate?.originLongitude != null &&
      selectedTemplate?.destinationLatitude != null &&
      selectedTemplate?.destinationLongitude != null
    ) {
      const R = 6371;
      const dLat = ((selectedTemplate.destinationLatitude - selectedTemplate.originLatitude) * Math.PI) / 180;
      const dLon = ((selectedTemplate.destinationLongitude - selectedTemplate.originLongitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((selectedTemplate.originLatitude * Math.PI) / 180) *
          Math.cos((selectedTemplate.destinationLatitude * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const roadKm = Math.round(R * c * 1.3);
      if (roadKm > 0) {
        const minCost = Math.max(20, Math.round((roadKm * 2.5) / 5) * 5);
        const maxCost = Math.max(35, Math.round((roadKm * 4.5) / 5) * 5);
        return { available: true, roadKm, minCost, maxCost };
      }
    }
    return { available: false, roadKm: 0, minCost: 0, maxCost: 0 };
  }, [selectedTemplate]);

  // React immediately to vehicle selection change or vehicle capacity change: clamp availableSeats
  useEffect(() => {
    if (availableSeats > effectiveMaxSeats) {
      setAvailableSeats(effectiveMaxSeats);
    }
  }, [effectiveMaxSeats, availableSeats]);

  // Quick Ride vehicle and seat capacity limits
  const quickVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === quickVehicleId);
  }, [vehicles, quickVehicleId]);

  const maxQuickPassengerSeats = useMemo(() => {
    if (!quickVehicle) return 4;
    return Math.max(1, quickVehicle.capacity - 1);
  }, [quickVehicle]);

  // React immediately to quick vehicle selection change: clamp quickSeats
  useEffect(() => {
    if (quickSeats > maxQuickPassengerSeats) {
      setQuickSeats(maxQuickPassengerSeats);
    }
  }, [maxQuickPassengerSeats, quickSeats]);

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
        const res = await fetch('/api/rides/quick-templates', {
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
    const matchedVehicle = vehicles.find((v) => v.id === template.vehicleId);
    const fallbackVehicle = vehicles.length > 0 ? vehicles[0] : null;
    const activeV = matchedVehicle || fallbackVehicle;
    if (matchedVehicle) {
      setQuickVehicleId(template.vehicleId);
    } else if (fallbackVehicle) {
      setQuickVehicleId(fallbackVehicle.id);
    } else {
      setQuickVehicleId(template.vehicleId);
    }

    const templateMaxSeats = activeV ? Math.max(1, activeV.capacity - 1) : 4;
    setQuickSeats(Math.min(template.availableSeats || 3, templateMaxSeats));
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
        const res = await fetch(`/api/rides/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const myRides: DriverRideResponseDto[] = await res.json();
          const target = myRides.find((r) => r.id === editRideId);
          if (target) {
            setEditingRide(target);
            setSelectedVehicleId(target.vehicleId ?? '');
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
    if (explicitHour !== undefined) {
      // Deterministically select 8:30 AM Asia/Kolkata on the next Kolkata calendar day
      setQuickDepartureTime(getTomorrowPresetKolkata(new Date(), explicitHour, explicitMinute || 0));
    } else {
      const d = new Date(Date.now() + offsetMinutes * 60 * 1000);
      setQuickDepartureTime(toKolkataInputString(d));
    }
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

    const depDate = parseKolkataDateTimeInput(quickDepartureTime);
    if (isNaN(depDate.getTime()) || depDate.getTime() <= Date.now() + 10 * 60 * 1000) {
      setError('Departure time must be scheduled at least 10 minutes in the future.');
      return;
    }

    const costNum = quickCost.trim() === '' ? 0 : Number(quickCost);
    if (isNaN(costNum) || costNum < 0) {
      setError('Cost contribution cannot be negative.');
      return;
    }

    if (quickSeats < 1) {
      setError('Available seats must be at least 1.');
      return;
    }

    if (quickSeats > maxQuickPassengerSeats) {
      setError(
        `Vehicle capacity is ${quickVehicle?.capacity || 4} seats (including driver). You cannot offer more than ${maxQuickPassengerSeats} passenger seats.`
      );
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

      const payloadStr = JSON.stringify(payload);
      let key: string;
      if (quickAttemptRef.current && quickAttemptRef.current.payloadStr === payloadStr) {
        // Exact retry with identical payload
        key = quickAttemptRef.current.key;
      } else {
        // New attempt or payload was edited after previous attempt
        key = generateIdempotencyKey();
        quickAttemptRef.current = { key, payloadStr };
      }

      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': key,
        },
        body: payloadStr,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to publish quick ride (${res.status})`);
      }

      // Confirmed success: clear active attempt so any subsequent publication gets a fresh key
      quickAttemptRef.current = null;

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

    const depDate = parseKolkataDateTimeInput(departureTime);
    if (isNaN(depDate.getTime()) || depDate.getTime() <= Date.now() + 10 * 60 * 1000) {
      setError('Departure time must be scheduled at least 10 minutes in the future.');
      return;
    }

    const costNum = costPerSeat.trim() === '' ? 0 : Number(costPerSeat);
    if (isNaN(costNum) || costNum < 0) {
      setError('Cost contribution cannot be negative.');
      return;
    }

    if (availableSeats < 1) {
      setError('Available seats must be at least 1.');
      return;
    }

    if (availableSeats > effectiveMaxSeats) {
      if (editRideId && editingConfirmedSeats > 0) {
        setError(
          `Cannot offer more than ${effectiveMaxSeats} passenger seats for this vehicle (${editingConfirmedSeats} already booked).`
        );
      } else {
        setError(
          `Vehicle capacity is ${selectedVehicle?.capacity || 4} seats (including driver). You cannot offer more than ${maxPassengerSeats} passenger seats.`
        );
      }
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

      const url = editRideId ? `/api/rides/${editRideId}` : '/api/rides';
      const method = editRideId ? 'PATCH' : 'POST';

      const payloadStr = JSON.stringify(payload);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (!editRideId) {
        let key: string;
        if (customAttemptRef.current && customAttemptRef.current.payloadStr === payloadStr) {
          key = customAttemptRef.current.key;
        } else {
          key = generateIdempotencyKey();
          customAttemptRef.current = { key, payloadStr };
        }
        headers['Idempotency-Key'] = key;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: payloadStr,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Failed to ${editRideId ? 'update' : 'publish'} ride (${res.status})`);
      }

      if (!editRideId) {
        // Confirmed success: clear active attempt so subsequent publications get a fresh key
        customAttemptRef.current = null;
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

  // Handle Cab Share publishing
  const handleCabSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!cabOrigin.trim()) {
      setError('Please provide a pickup origin for the cab share.');
      return;
    }

    if (!cabDestination.trim()) {
      setError('Please provide a drop-off destination for the cab share.');
      return;
    }

    if (!cabDepartureTime) {
      setError('Please select a departure date and time.');
      return;
    }

    const depDate = parseKolkataDateTimeInput(cabDepartureTime);
    if (isNaN(depDate.getTime()) || depDate.getTime() <= Date.now() + 10 * 60 * 1000) {
      setError('Departure time must be scheduled at least 10 minutes in the future.');
      return;
    }

    if (!cabBookingDeadline) {
      setError('Please choose a booking deadline.');
      return;
    }

    const deadlineDate = parseKolkataDateTimeInput(cabBookingDeadline);
    if (isNaN(deadlineDate.getTime())) {
      setError('Please provide a valid booking deadline.');
      return;
    }

    if (deadlineDate.getTime() > depDate.getTime()) {
      setError('Booking deadline must be before or equal to departure time.');
      return;
    }

    if (cabTotalCapacity < 2 || cabTotalCapacity > 8) {
      setError('Total cab capacity must be between 2 and 8 seats (including organiser).');
      return;
    }

    const fareNum = Number(cabEstimatedTotalFare);
    if (isNaN(fareNum) || fareNum < 50 || fareNum > 20000) {
      setError('Estimated total fare must be between ₹50 and ₹20,000.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        origin: cabOrigin.trim(),
        destination: cabDestination.trim(),
        departureTime: depDate.toISOString(),
        bookingDeadline: deadlineDate.toISOString(),
        totalCapacity: cabTotalCapacity,
        estimatedTotalFare: Math.round(fareNum),
      };

      if (cabOriginLocation?.address || cabOrigin.trim()) {
        payload.originAddress = cabOriginLocation?.address || cabOrigin.trim();
      }
      if (cabOriginLocation?.latitude !== undefined && cabOriginLocation?.longitude !== undefined) {
        payload.originLatitude = cabOriginLocation.latitude;
        payload.originLongitude = cabOriginLocation.longitude;
        payload.originPlaceId = cabOriginLocation.id;
      }

      if (cabDestLocation?.address || cabDestination.trim()) {
        payload.destinationAddress = cabDestLocation?.address || cabDestination.trim();
      }
      if (cabDestLocation?.latitude !== undefined && cabDestLocation?.longitude !== undefined) {
        payload.destinationLatitude = cabDestLocation.latitude;
        payload.destinationLongitude = cabDestLocation.longitude;
        payload.destinationPlaceId = cabDestLocation.id;
      }

      if (cabService.trim()) payload.cabService = cabService.trim();
      if (cabPickupDescription.trim()) payload.pickupDescription = cabPickupDescription.trim();
      if (cabDropoffDescription.trim()) payload.dropoffDescription = cabDropoffDescription.trim();
      if (cabMaxDetourMinutes) payload.maxDetourMinutes = cabMaxDetourMinutes;

      const payloadStr = JSON.stringify(payload);
      let key: string;
      if (cabAttemptRef.current && cabAttemptRef.current.payloadStr === payloadStr) {
        key = cabAttemptRef.current.key;
      } else {
        key = generateIdempotencyKey();
        cabAttemptRef.current = { key, payloadStr };
      }

      const res = await fetch('/api/rides/cab-share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Idempotency-Key': key,
        },
        body: payloadStr,
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `Cab share publishing failed (${res.status})`);
      }

      cabAttemptRef.current = null;
      setSuccessMsg('Shared Cab successfully published! Eligible campus peers can now join and split the fare.');
      setTimeout(() => {
        navigate('/my-rides');
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Unable to publish shared cab. Please verify your details.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeVehicle = vehicles.find((v) => v.id === (mode === 'quick' ? quickVehicleId : selectedVehicleId));
  const isSelectedVehicleDeleted = selectedTemplate && !vehicles.some((v) => v.id === selectedTemplate.vehicleId);

  return (
    <PageShell width="narrow">
      <PageHeader
        title={editRideId ? 'Edit Published Ride' : 'Offer a Campus Ride'}
        description="Share your daily commute with verified peers in your campus community. Split fuel costs, skip the solo drive."
      />

      {/* Primary Category Selector: My Vehicle vs Shared Cab */}
      {!editRideId && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            backgroundColor: '#f1f5f9',
            padding: '4px',
            borderRadius: '12px',
            marginBottom: '20px',
            gap: '6px',
            border: '1px solid var(--border-light, #e2e8f0)',
          }}
          role="tablist"
          id="ride-category-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rideCategory === 'VEHICLE'}
            onClick={() => {
              setRideCategory('VEHICLE');
              setError(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 16px',
              fontSize: '0.9rem',
              fontWeight: rideCategory === 'VEHICLE' ? 700 : 500,
              color: rideCategory === 'VEHICLE' ? 'var(--color-brand-700, #1d4ed8)' : 'var(--text-secondary, #64748b)',
              backgroundColor: rideCategory === 'VEHICLE' ? '#ffffff' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: rideCategory === 'VEHICLE' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="tab-category-vehicle"
          >
            <Car size={16} />
            <span>My Vehicle</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={rideCategory === 'CAB_SHARE'}
            onClick={() => {
              setRideCategory('CAB_SHARE');
              setError(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 16px',
              fontSize: '0.9rem',
              fontWeight: rideCategory === 'CAB_SHARE' ? 700 : 500,
              color: rideCategory === 'CAB_SHARE' ? '#92400e' : 'var(--text-secondary, #64748b)',
              backgroundColor: rideCategory === 'CAB_SHARE' ? '#ffffff' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              boxShadow: rideCategory === 'CAB_SHARE' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="tab-category-cab-share"
          >
            <Users size={16} />
            <span>Shared Cab</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: rideCategory === 'CAB_SHARE' ? '#fef3c7' : '#e2e8f0',
                color: rideCategory === 'CAB_SHARE' ? '#92400e' : '#475569',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              No Car Needed
            </span>
          </button>
        </div>
      )}

      {/* Shared Cab Publishing Form (No Vehicle Required) */}
      {rideCategory === 'CAB_SHARE' && !editRideId ? (
        <form
          onSubmit={handleCabSubmit}
          className="form-card-responsive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            marginBottom: '40px',
          }}
          id="cab-share-publish-form"
        >
          {/* Explanation Banner */}
          <div
            style={{
              padding: '16px',
              backgroundColor: '#fffbeb',
              borderRadius: '10px',
              border: '1px solid #fde68a',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <Info size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', marginBottom: '2px' }}>
                Organise a Shared Cab (Uber / Ola / Taxi)
              </div>
              <p style={{ margin: 0, fontSize: '0.825rem', color: '#78350f', lineHeight: 1.45 }}>
                No vehicle ownership required! As the organiser, you automatically occupy <strong>1 seat</strong> as a passenger. Other verified campus peers travelling the same corridor can join and split the actual cab bill with you.
              </p>
            </div>
          </div>

          {/* Route Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              1. Cab Corridor &amp; Route
            </div>
            <div className="responsive-two-col" style={{ gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={14} style={{ color: '#2563eb' }} /> Pickup Origin *
                </label>
                <LocationAutocomplete
                  id="cab-origin-input"
                  value={cabOrigin}
                  onChange={(val, loc) => {
                    setCabOrigin(val);
                    setCabOriginLocation(loc || null);
                  }}
                  selectedLocation={cabOriginLocation}
                  placeholder="e.g. Tambaram Railway Station"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Navigation size={14} style={{ color: '#16a34a' }} /> Destination *
                </label>
                <LocationAutocomplete
                  id="cab-destination-input"
                  value={cabDestination}
                  onChange={(val, loc) => {
                    setCabDestination(val);
                    setCabDestLocation(loc || null);
                  }}
                  selectedLocation={cabDestLocation}
                  placeholder="e.g. VIT Chennai Campus"
                />
              </div>
            </div>
          </div>

          {/* Schedule Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              2. Schedule &amp; Deadlines
            </div>
            <div className="responsive-two-col" style={{ gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} style={{ color: '#2563eb' }} /> Departure Date &amp; Time *
                </label>
                <input
                  type="datetime-local"
                  id="cab-departure-time"
                  value={cabDepartureTime}
                  onChange={(e) => {
                    setCabDepartureTime(e.target.value);
                    if (!cabBookingDeadline && e.target.value) {
                      const dep = parseKolkataDateTimeInput(e.target.value);
                      if (!isNaN(dep.getTime())) {
                        const dline = new Date(dep.getTime() - 60 * 60 * 1000);
                        setCabBookingDeadline(toKolkataInputString(dline));
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: '#ffffff',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} style={{ color: '#d97706' }} /> Booking Deadline *
                </label>
                <input
                  type="datetime-local"
                  id="cab-booking-deadline"
                  value={cabBookingDeadline}
                  onChange={(e) => setCabBookingDeadline(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: '#ffffff',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Cutoff time after which new booking requests cannot be submitted.
                </span>
              </div>
            </div>
          </div>

          {/* Capacity and Fare Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              3. Cab Capacity &amp; Estimated Fare
            </div>
            <div className="responsive-two-col" style={{ gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} style={{ color: '#2563eb' }} /> Total Cab Capacity (Seats) *
                </label>
                <select
                  id="cab-total-capacity"
                  value={cabTotalCapacity}
                  onChange={(e) => setCabTotalCapacity(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.875rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    backgroundColor: '#ffffff',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value={2}>2 Persons (1 Organiser + 1 Passenger Seat)</option>
                  <option value={3}>3 Persons (1 Organiser + 2 Passenger Seats)</option>
                  <option value={4}>4 Persons (Standard Sedan - 1 Organiser + 3 Passenger Seats)</option>
                  <option value={5}>5 Persons (1 Organiser + 4 Passenger Seats)</option>
                  <option value={6}>6 Persons (SUV / XL - 1 Organiser + 5 Passenger Seats)</option>
                  <option value={7}>7 Persons (1 Organiser + 6 Passenger Seats)</option>
                  <option value={8}>8 Persons (Max Mini-Van - 1 Organiser + 7 Passenger Seats)</option>
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Organiser occupies 1 seat. Remaining {cabTotalCapacity - 1} seats open for booking.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IndianRupee size={14} style={{ color: '#16a34a' }} /> Estimated Total Cab Fare (₹) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>
                    ₹
                  </span>
                  <input
                    type="number"
                    id="cab-estimated-fare"
                    value={cabEstimatedTotalFare}
                    onChange={(e) => setCabEstimatedTotalFare(e.target.value)}
                    min={50}
                    max={20000}
                    step={10}
                    placeholder="e.g. 800"
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 28px',
                      fontSize: '0.875rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: '#ffffff',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Fare Preview Card */}
            {Number(cabEstimatedTotalFare) > 0 && (() => {
              const split = calculateCabFareSplit(Math.max(0, Number(cabEstimatedTotalFare) || 0), cabTotalCapacity, 0);
              return (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '10px',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                  id="cab-fare-preview-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 700 }}>
                      Transparent Fare Split Preview
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d' }}>
                      ~₹{split.estimatedPerPersonIfFull} <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>/ person (if full)</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#166534', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>&bull; Total Fare: <strong>₹{cabEstimatedTotalFare}</strong></span>
                    <span>&bull; Capacity: <strong>{cabTotalCapacity} seats</strong> (1 Organiser + {cabTotalCapacity - 1} Passengers)</span>
                    <span>&bull; Your Share: <strong>₹{split.estimatedPerPersonIfFull}</strong></span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#15803d', fontStyle: 'italic' }}>
                    Fares are divided strictly integer-rupee among all confirmed participants. If fewer passengers join, the cost is split among the confirmed group.
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Optional Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              4. Additional Details (Optional)
            </div>
            <div className="responsive-two-col" style={{ gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Cab Service / App
                </label>
                <input
                  type="text"
                  id="cab-service-input"
                  value={cabService}
                  onChange={(e) => setCabService(e.target.value)}
                  placeholder="e.g. Uber XL, Ola Prime, Fast Track"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.825rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Max Detour Tolerance
                </label>
                <select
                  id="cab-max-detour"
                  value={cabMaxDetourMinutes}
                  onChange={(e) => setCabMaxDetourMinutes(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.825rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes (Standard)</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>
            </div>

            <div className="responsive-two-col" style={{ gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Pickup Landmark Note
                </label>
                <input
                  type="text"
                  id="cab-pickup-notes"
                  value={cabPickupDescription}
                  onChange={(e) => setCabPickupDescription(e.target.value)}
                  placeholder="e.g. Near Station Gate 2 auto stand"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.825rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                  Dropoff Landmark Note
                </label>
                <input
                  type="text"
                  id="cab-dropoff-notes"
                  value={cabDropoffDescription}
                  onChange={(e) => setCabDropoffDescription(e.target.value)}
                  placeholder="e.g. Main Gate / Library Circle"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: '0.825rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
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
              disabled={submitting}
              leftIcon={submitting ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
              id="publish-cab-share-submit-btn"
            >
              {submitting ? 'Publishing Cab Share...' : 'Publish Shared Cab'}
            </Button>
          </div>
        </form>
      ) : (
        <>
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
            To offer a ride, you must register at least one passenger car. Two-wheelers and commercial vehicles are not permitted.
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
                  className="form-card-responsive"
                  style={{
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
                        onChange={(e) => {
                          const newId = e.target.value;
                          setQuickVehicleId(newId);
                          const v = vehicles.find((item) => item.id === newId);
                          if (v) {
                            const maxSeats = Math.max(1, v.capacity - 1);
                            setQuickSeats((prev) => Math.min(prev, maxSeats));
                          }
                        }}
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
                        {Array.from({ length: maxQuickPassengerSeats }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num} {num === 1 ? 'Seat' : 'Seats'}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Max {maxQuickPassengerSeats} passenger seat{maxQuickPassengerSeats > 1 ? 's' : ''} ({quickVehicle?.capacity || 4}-seater vehicle)
                      </span>
                    </div>

                    {/* Cost Per Seat */}
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                        Cost per Seat (₹) *
                      </label>
                      <input
                        type="number"
                        min={0}
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
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                        Fair fuel contribution (Driver sets final amount)
                      </span>
                      {quickRouteGuidance.available && (
                        <div
                          style={{
                            marginTop: '6px',
                            padding: '6px 8px',
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            color: '#166534',
                          }}
                        >
                          <strong>Guidance:</strong> ~₹{quickRouteGuidance.minCost} – ₹{quickRouteGuidance.maxCost} (~{quickRouteGuidance.roadKm} km road route). Driver sets final rate.
                        </div>
                      )}
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
          className="form-card-responsive"
          style={{
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
                const newId = e.target.value;
                setSelectedVehicleId(newId);
                const v = vehicles.find((item) => item.id === newId);
                if (v) {
                  const maxSeats = Math.max(1, v.capacity - 1);
                  setAvailableSeats((prev) => Math.min(prev, maxSeats));
                }
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
          <div className="responsive-two-col" style={{ gap: '16px' }}>
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
                {Array.from({ length: effectiveMaxSeats }, (_, i) => i + 1).map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'Seat' : 'Seats'}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                {editRideId && editingConfirmedSeats > 0
                  ? `Max ${effectiveMaxSeats} passenger seats available (${editingConfirmedSeats} already booked)`
                  : `Max ${effectiveMaxSeats} passenger seat${effectiveMaxSeats > 1 ? 's' : ''} for this ${selectedVehicle?.capacity || 4}-seater vehicle`}
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', display: 'block' }}>
                Cost per Seat (₹) *
              </label>
              <input
                type="number"
                min={0}
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
                Fair fuel contribution (Driver sets final amount)
              </span>
              {routeGuidance.available ? (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '8px 10px',
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    fontSize: '0.725rem',
                    color: '#166534',
                    lineHeight: '1.4',
                  }}
                  id="offer-cost-guidance-box"
                >
                  <strong>Suggested guidance:</strong> ~₹{routeGuidance.minCost} – ₹{routeGuidance.maxCost} based on ~{routeGuidance.roadKm} km estimated road distance. This is non-binding guidance to help split actual fuel expenses; you set the final contribution (not an official VIT rate).
                </div>
              ) : (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '8px 10px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '0.725rem',
                    color: '#64748b',
                    lineHeight: '1.4',
                  }}
                  id="offer-cost-unavailable-box"
                >
                  Suggested estimate is unavailable without selected map coordinates. Please enter your fair fuel contribution.
                </div>
              )}
            </div>
          </div>

          {/* Pickup & Dropoff Notes */}
          <div className="responsive-two-col" style={{ gap: '16px' }}>
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
        </>
      )}
    </PageShell>
  );
};
