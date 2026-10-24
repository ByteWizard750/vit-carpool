import React, { useState } from 'react';
import { MapPin, Navigation, Calendar, Users, Search, ArrowRightLeft } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { getLocalTodayDate } from '../../utils/date';

interface RideSearchPanelProps {
  onSearch: (params: { origin: string; destination: string; date: string; seats: number }) => void;
  onOfferRide: () => void;
}

export const RideSearchPanel: React.FC<RideSearchPanelProps> = ({ onSearch, onOfferRide }) => {
  const todayStr = getLocalTodayDate();
  const [origin, setOrigin] = useState('Tambaram Station / GST Rd');
  const [destination, setDestination] = useState('VIT Chennai Campus (Vandalur-Kelambakkam)');
  const [date, setDate] = useState(todayStr);
  const [seats, setSeats] = useState(1);

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ origin, destination, date, seats });
  };

  return (
    <section className="search-widget-container" id="search" aria-label="Search Rides Panel">
      <form onSubmit={handleSubmit} className="search-box-card">
        <div className="search-segments-grid">
          {/* Origin Segment */}
          <div className="search-segment">
            <span className="search-segment-label">
              <MapPin size={12} style={{ color: '#2563eb' }} />
              Leaving From
            </span>
            <input
              type="text"
              className="search-segment-input"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="e.g. Tambaram, Velachery, OMR..."
              required
              id="search-origin"
            />
          </div>

          {/* Destination Segment */}
          <div className="search-segment">
            <span className="search-segment-label">
              <Navigation size={12} style={{ color: '#16a34a' }} />
              Going To
            </span>
            <input
              type="text"
              className="search-segment-input"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. VIT Chennai Campus..."
              required
              id="search-destination"
            />
          </div>

          {/* Date Segment */}
          <div className="search-segment">
            <span className="search-segment-label">
              <Calendar size={12} style={{ color: '#64748b' }} />
              Travel Date
            </span>
            <input
              type="date"
              className="search-segment-input"
              value={date}
              min={todayStr}
              onChange={(e) => setDate(e.target.value)}
              required
              id="search-date"
            />
          </div>

          {/* Passengers Segment */}
          <div className="search-segment">
            <span className="search-segment-label">
              <Users size={12} style={{ color: '#64748b' }} />
              Seats
            </span>
            <select
              className="search-segment-input"
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              id="search-seats"
            >
              <option value={1}>1 Seat</option>
              <option value={2}>2 Seats</option>
              <option value={3}>3 Seats</option>
              <option value={4}>4 Seats</option>
            </select>
          </div>

          {/* Action Button */}
          <div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              leftIcon={<Search size={18} />}
              style={{ width: '100%' }}
              id="btn-search-rides"
            >
              Find Rides
            </Button>
          </div>
        </div>

        {/* Secondary controls strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-light)',
            fontSize: '0.825rem',
            color: 'var(--text-muted)',
          }}
        >
          <button
            type="button"
            onClick={handleSwap}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--color-brand-600)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            <ArrowRightLeft size={13} />
            <span>Swap Origin & Destination</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Planning to drive?</span>
            <button
              type="button"
              onClick={onOfferRide}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand-700)',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
              id="link-offer-ride"
            >
              Preview driver publishing &rarr;
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
