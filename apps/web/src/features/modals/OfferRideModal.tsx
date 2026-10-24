import React, { useState } from 'react';
import { Car, MapPin, Navigation, Fuel, ShieldCheck, Info } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';

interface OfferRideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OfferRideModal: React.FC<OfferRideModalProps> = ({ isOpen, onClose }) => {
  const [vehicle, setVehicle] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [availableSeats, setAvailableSeats] = useState(3);
  const [fuelShare, setFuelShare] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Offer a Ride (Publishing Preview)"
      maxWidth="580px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled
            style={{ opacity: 0.6, cursor: 'not-allowed' }}
            id="offer-disabled-btn"
          >
            Publishing Launches in Milestone 4
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Planned Status Banner */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-brand-50)',
            border: '1px solid var(--color-brand-200)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '0.825rem',
            color: 'var(--color-brand-900)',
          }}
        >
          <Info size={18} style={{ color: 'var(--color-brand-700)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Driver Publishing Workflow Planned for Milestone 4:</strong> Ride publishing is not yet operational.
            When deployed, verified car owners will be able to publish recurring commutes and one-off rides.
            No vehicle or personal data is collected or stored during this design preview.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label htmlFor="offer-vehicle" className="form-label">
              Car Details (Cars Only Standard)
            </label>
            <div className="form-control-wrap">
              <span className="form-icon-left">
                <Car size={16} />
              </span>
              <input
                id="offer-vehicle"
                type="text"
                className="form-input form-input-with-icon"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                placeholder="e.g. 4-door passenger car (Swift, City, Nexon...)"
                disabled
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Two-wheelers, auto-rickshaws, and commercial vehicles will not be permitted on VIT Carpool.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label htmlFor="offer-origin" className="form-label">
                Departure Point (Preview)
              </label>
              <div className="form-control-wrap">
                <span className="form-icon-left">
                  <MapPin size={16} />
                </span>
                <input
                  id="offer-origin"
                  type="text"
                  className="form-input form-input-with-icon"
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="e.g. Tambaram East"
                  disabled
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="offer-destination" className="form-label">
                Campus Drop Point (Preview)
              </label>
              <div className="form-control-wrap">
                <span className="form-icon-left">
                  <Navigation size={16} />
                </span>
                <input
                  id="offer-destination"
                  type="text"
                  className="form-input form-input-with-icon"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. VIT Chennai Campus Gate"
                  disabled
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label htmlFor="offer-seats" className="form-label">
                Empty Seats (Max 4)
              </label>
              <select
                id="offer-seats"
                className="form-select"
                value={availableSeats}
                onChange={(e) => setAvailableSeats(Number(e.target.value))}
                disabled
              >
                <option value={1}>1 Passenger Seat</option>
                <option value={2}>2 Passenger Seats</option>
                <option value={3}>3 Passenger Seats</option>
                <option value={4}>4 Passenger Seats</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="offer-fuel" className="form-label">
                Suggested Fuel Contribution
              </label>
              <div className="form-control-wrap">
                <span className="form-icon-left">
                  <Fuel size={16} />
                </span>
                <input
                  id="offer-fuel"
                  type="text"
                  className="form-input form-input-with-icon"
                  value={fuelShare}
                  onChange={(e) => setFuelShare(e.target.value)}
                  placeholder="e.g. ₹50 (non-commercial)"
                  disabled
                />
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <ShieldCheck size={16} style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
            <span>
              <strong>Driver Discretion Invariant:</strong> When live, drivers will have 100% control over seat approvals.
              Unapproved automatic bookings will not be allowed.
            </span>
          </div>
        </form>
      </div>
    </Modal>
  );
};
