import React, { useState, useEffect } from 'react';
import {
  Car,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { VehicleResponseDto } from '@vit-carpool/contracts';

interface VehicleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenVerification?: () => void;
}

export const VehicleManagementModal: React.FC<VehicleManagementModalProps> = ({
  isOpen,
  onClose,
  onOpenVerification,
}) => {
  const { user, token } = useAuth();

  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form mode: 'LIST' | 'CREATE' | 'EDIT' | 'CONFIRM_DELETE'
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'EDIT' | 'CONFIRM_DELETE'>('LIST');

  // Form fields
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [capacity, setCapacity] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleResponseDto | null>(null);

  const fetchVehicles = async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vehicles', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
      } else {
        const body = await res.json();
        setError(body.message || 'Failed to load registered vehicles.');
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setViewMode('LIST');
      setError(null);
      setSuccessMessage(null);
      if (token && user?.verificationStatus === 'VERIFIED') {
        fetchVehicles();
      }
    }
  }, [isOpen, token, user?.verificationStatus]);

  const resetForm = () => {
    setMake('');
    setModel('');
    setColor('');
    setRegistrationNumber('');
    setCapacity(4);
    setEditingVehicleId(null);
    setVehicleToDelete(null);
    setError(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setViewMode('CREATE');
  };

  const handleStartEdit = (vehicle: VehicleResponseDto) => {
    resetForm();
    setEditingVehicleId(vehicle.id);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setColor(vehicle.color);
    setRegistrationNumber(vehicle.registrationNumber);
    setCapacity(vehicle.capacity);
    setViewMode('EDIT');
  };

  const handleStartDelete = (vehicle: VehicleResponseDto) => {
    setVehicleToDelete(vehicle);
    setViewMode('CONFIRM_DELETE');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const isEdit = viewMode === 'EDIT' && editingVehicleId;
      const url = isEdit ? `/api/vehicles/${editingVehicleId}` : '/api/vehicles';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          make,
          model,
          color,
          registrationNumber,
          capacity: Number(capacity),
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || 'Failed to save vehicle.');
      }

      setSuccessMessage(
        isEdit
          ? 'Vehicle details updated successfully.'
          : 'Vehicle registered successfully for carpooling.',
      );
      resetForm();
      setViewMode('LIST');
      await fetchVehicles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!token || !vehicleToDelete) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicleToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || 'Failed to remove vehicle.');
      }

      setSuccessMessage('Vehicle successfully removed.');
      setVehicleToDelete(null);
      setViewMode('LIST');
      await fetchVehicles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        viewMode === 'CREATE'
          ? 'Register New Vehicle'
          : viewMode === 'EDIT'
          ? 'Edit Vehicle Details'
          : viewMode === 'CONFIRM_DELETE'
          ? 'Confirm Vehicle Removal'
          : 'My Registered Vehicles'
      }
      maxWidth="580px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          {viewMode === 'LIST' && (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
              {user?.verificationStatus === 'VERIFIED' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartCreate}
                  leftIcon={<Plus size={14} />}
                  id="add-vehicle-btn"
                >
                  Add Vehicle
                </Button>
              )}
            </>
          )}

          {(viewMode === 'CREATE' || viewMode === 'EDIT') && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setViewMode('LIST');
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={submitting}
                id="save-vehicle-btn"
              >
                {viewMode === 'EDIT' ? 'Save Changes' : 'Register Vehicle'}
              </Button>
            </>
          )}

          {viewMode === 'CONFIRM_DELETE' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setVehicleToDelete(null);
                  setViewMode('LIST');
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                isLoading={submitting}
                id="confirm-delete-vehicle-btn"
              >
                Confirm Removal
              </Button>
            </>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Messages */}
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

        {/* 1. Unauthenticated State */}
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
              Please sign in with your verified VIT Chennai account to view or register vehicles for community carpooling.
            </p>
          </div>
        )}

        {/* 2. Unverified Account State */}
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
              In accordance with our community security invariants, vehicle registration and carpooling capabilities are strictly reserved for verified students and faculty.
              Your account status is currently <strong>{user.verificationStatus}</strong>.
            </p>
            {user.verificationStatus === 'PENDING' && onOpenVerification && (
              <div style={{ paddingTop: '4px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onOpenVerification();
                  }}
                >
                  Submit Verification Request
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 3. Verified User: List View */}
        {user?.verificationStatus === 'VERIFIED' && viewMode === 'LIST' && (
          <div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px 0', gap: '8px', color: 'var(--text-muted)' }}>
                <Loader2 size={20} className="animate-spin" />
                <span>Loading registered vehicles...</span>
              </div>
            ) : vehicles.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '8px',
                  border: '1px dashed var(--border-light)',
                }}
              >
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-brand-100)',
                    color: 'var(--color-brand-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Car size={20} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.95rem' }}>
                    No Vehicles Registered
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                    Register your car to offer carpools to fellow verified campus members.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartCreate}
                  leftIcon={<Plus size={14} />}
                >
                  Register First Vehicle
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    {vehicles.length} {vehicles.length === 1 ? 'Vehicle' : 'Vehicles'} Active
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Cars only standard
                  </span>
                </div>

                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--color-brand-50)',
                          color: 'var(--color-brand-700)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Car size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {v.make} {v.model}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              color: '#0f172a',
                            }}
                          >
                            {v.registrationNumber}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {v.color} • {v.capacity} {v.capacity === 1 ? 'seat' : 'seats'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(v)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          color: 'var(--text-muted)',
                        }}
                        title="Edit Vehicle"
                        aria-label={`Edit ${v.make} ${v.model}`}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartDelete(v)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '4px',
                          color: '#dc2626',
                        }}
                        title="Delete Vehicle"
                        aria-label={`Delete ${v.make} ${v.model}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Verified User: Create / Edit Form */}
        {user?.verificationStatus === 'VERIFIED' && (viewMode === 'CREATE' || viewMode === 'EDIT') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-brand-50)',
                border: '1px solid var(--color-brand-200)',
                fontSize: '0.75rem',
                color: 'var(--color-brand-900)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Info size={14} style={{ color: 'var(--color-brand-700)', flexShrink: 0 }} />
              <span>
                <strong>Cars Only Policy:</strong> Commercial cabs, two-wheelers, and auto-rickshaws are prohibited.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label htmlFor="veh-make" className="form-label">
                  Make / Manufacturer *
                </label>
                <input
                  id="veh-make"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Hyundai, Honda, Tata"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="veh-model" className="form-label">
                  Model *
                </label>
                <input
                  id="veh-model"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Creta, City, Nexon"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div className="form-group">
                <label htmlFor="veh-color" className="form-label">
                  Vehicle Colour *
                </label>
                <input
                  id="veh-color"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Polar White, Silver"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="veh-capacity" className="form-label">
                  Passenger Seat Capacity *
                </label>
                <select
                  id="veh-capacity"
                  className="form-select"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  required
                >
                  <option value={1}>1 Passenger Seat</option>
                  <option value={2}>2 Passenger Seats</option>
                  <option value={3}>3 Passenger Seats</option>
                  <option value={4}>4 Passenger Seats (Standard)</option>
                  <option value={5}>5 Passenger Seats</option>
                  <option value={6}>6 Passenger Seats (MPV / SUV)</option>
                  <option value={7}>7 Passenger Seats (Max)</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="veh-reg" className="form-label">
                Registration Number (License Plate) *
              </label>
              <input
                id="veh-reg"
                type="text"
                className="form-input"
                placeholder="e.g. TN 19 AB 1234"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                required
              />
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                Registration numbers are normalized to uppercase and unique per active vehicle.
              </span>
            </div>
          </form>
        )}

        {/* 5. Delete Confirmation View */}
        {viewMode === 'CONFIRM_DELETE' && vehicleToDelete && (
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', fontWeight: 700 }}>
              <AlertTriangle size={18} />
              <span>Are you sure you want to remove this vehicle?</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#7f1d1d' }}>
              Removing <strong>{vehicleToDelete.make} {vehicleToDelete.model}</strong> ({vehicleToDelete.registrationNumber}) will archive the vehicle record and prevent new rides from being scheduled with it.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
