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
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { useAuth } from '../features/auth/AuthContext';
import { VehicleResponseDto } from '@vit-carpool/contracts';

export const VehiclesPage: React.FC = () => {
  const { user, token } = useAuth();

  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal form states: null | 'CREATE' | 'EDIT'
  const [formMode, setFormMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleResponseDto | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  // Form inputs
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [capacity, setCapacity] = useState<number>(4);
  const [submitting, setSubmitting] = useState(false);

  const fetchVehicles = async () => {
    if (!token || user?.verificationStatus !== 'VERIFIED') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vehicles', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
      } else {
        if (res.status === 401) return;
        const body = await res.json().catch(() => ({}));
        setError(body.message || 'Failed to load registered vehicles.');
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [token, user?.verificationStatus]);

  const resetForm = () => {
    setMake('');
    setModel('');
    setColor('');
    setRegistrationNumber('');
    setCapacity(4);
    setEditingVehicleId(null);
    setFormMode(null);
    setError(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setFormMode('CREATE');
  };

  const handleStartEdit = (v: VehicleResponseDto) => {
    setEditingVehicleId(v.id);
    setMake(v.make);
    setModel(v.model);
    setColor(v.color);
    setRegistrationNumber(v.registrationNumber);
    setCapacity(v.capacity);
    setFormMode('EDIT');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const payload = {
      make: make.trim(),
      model: model.trim(),
      color: color.trim(),
      registrationNumber: registrationNumber.trim().toUpperCase(),
      capacity: Number(capacity),
    };

    try {
      const url = formMode === 'EDIT' ? `/api/vehicles/${editingVehicleId}` : '/api/vehicles';
      const method = formMode === 'EDIT' ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (res.ok) {
        setSuccessMsg(formMode === 'EDIT' ? 'Vehicle updated successfully!' : 'Vehicle registered successfully!');
        resetForm();
        fetchVehicles();
      } else {
        setError(body.message || 'Failed to save vehicle details.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!vehicleToDelete || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/vehicles/${vehicleToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSuccessMsg('Vehicle removed successfully.');
        setVehicleToDelete(null);
        fetchVehicles();
      } else {
        const body = await res.json();
        setError(body.message || 'Failed to remove vehicle.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell width="content">
      <PageHeader
        title="Registered Vehicles"
        description="Register and manage personal cars used for campus carpooling. Only verified cars are eligible."
        action={
          <Button
            variant="primary"
            size="md"
            onClick={handleStartCreate}
            leftIcon={<Plus size={16} />}
            id="btn-add-vehicle"
          >
            Add Vehicle
          </Button>
        }
      />

      {/* Safety Standard Notice */}
      <div
        style={{
          padding: '14px 18px',
          backgroundColor: '#eff6ff',
          borderRadius: '10px',
          border: '1px solid #bfdbfe',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.825rem',
          color: '#1e40af',
          marginBottom: '24px',
        }}
      >
        <ShieldCheck size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
        <span>
          <strong>Cars Only Policy:</strong> For community safety and weather resilience, only passenger cars are permitted on VIT Carpool. Two-wheelers and commercial autos are strictly restricted.
        </span>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: '10px',
            color: '#166534',
            fontSize: '0.85rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#991b1b',
            fontSize: '0.85rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Vehicle Cards Grid */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Loading your registered vehicles...</div>
        </div>
      ) : vehicles.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            textAlign: 'center',
          }}
        >
          <Car size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>No Vehicles Registered</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 24px' }}>
            Register your car to start offering rides to campus peers. You can register multiple family or personal cars.
          </p>
          <Button variant="primary" size="md" onClick={handleStartCreate} leftIcon={<Plus size={16} />}>
            Register a Vehicle
          </Button>
        </div>
      ) : (
        <div className="rides-cards-grid">
          {vehicles.map((v) => (
            <div
              key={v.id}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '1px solid var(--border-light)',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
              }}
              className="vehicle-card"
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-brand-100)',
                      color: 'var(--color-brand-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Car size={22} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <StatusBadge status="VERIFIED" domain="vehicle" />
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#f1f5f9',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {v.capacity} Seats
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {v.make} {v.model}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Color: {v.color}
                </div>
                <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-brand-800)', backgroundColor: 'var(--bg-subtle)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                  {v.registrationNumber}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleStartEdit(v)}
                  leftIcon={<Edit2 size={13} />}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVehicleToDelete(v)}
                  leftIcon={<Trash2 size={13} style={{ color: '#dc2626' }} />}
                >
                  <span style={{ color: '#dc2626' }}>Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form for Create / Edit */}
      {formMode && (
        <Modal
          isOpen={Boolean(formMode)}
          onClose={resetForm}
          title={formMode === 'CREATE' ? 'Register New Car' : 'Edit Vehicle Details'}
          maxWidth="480px"
        >
          <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="responsive-two-col" style={{ gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Make *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maruti Suzuki"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border-medium)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Model *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Swift"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border-medium)', outline: 'none' }}
                />
              </div>
            </div>

            <div className="responsive-two-col" style={{ gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Color *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Silver"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border-medium)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Total Seating Capacity (including driver) *
                </label>
                <select
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  style={{ width: '100%', padding: '9px 12px', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border-medium)', outline: 'none', backgroundColor: '#fff' }}
                >
                  <option value={2}>2 Seater (1 passenger)</option>
                  <option value={3}>3 Seater (up to 2 passengers)</option>
                  <option value={4}>4 Seater (up to 3 passengers)</option>
                  <option value={5}>5 Seater (up to 4 passengers)</option>
                  <option value={6}>6 Seater (up to 5 passengers)</option>
                  <option value={7}>7 Seater (up to 6 passengers)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                License Plate / Registration Number *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. TN19AJ4321"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.875rem', borderRadius: '6px', border: '1px solid var(--border-medium)', outline: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              />
              <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Public viewers see masked plates (e.g. TN 19 ****) for privacy.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                {submitting ? 'Saving...' : formMode === 'EDIT' ? 'Save Changes' : 'Register Car'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {vehicleToDelete && (
        <Modal
          isOpen={Boolean(vehicleToDelete)}
          onClose={() => setVehicleToDelete(null)}
          title="Remove Vehicle"
          maxWidth="440px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Are you sure you want to remove your <strong>{vehicleToDelete.make} {vehicleToDelete.model}</strong> ({vehicleToDelete.registrationNumber})?
              Any active rides scheduled with this vehicle must be completed or cancelled first.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button variant="outline" size="sm" onClick={() => setVehicleToDelete(null)}>
                Keep Vehicle
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={submitting}
                onClick={handleConfirmDelete}
                style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
              >
                {submitting ? 'Removing...' : 'Confirm Remove'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </PageShell>
  );
};
