import React from 'react';
import { MapPin, Navigation, Clock, ArrowRight, Info } from 'lucide-react';

interface RouteCorridor {
  id: string;
  from: string;
  to: string;
  approxDistanceKm: number;
  typicalDurationMin: number;
  samplePickupArea: string;
  illustrativeFuelShare: string;
}

const CORRIDORS: RouteCorridor[] = [
  {
    id: 'corridor-tambaram',
    from: 'Tambaram Station / GST Rd',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 14,
    typicalDurationMin: 25,
    samplePickupArea: 'Tambaram East Bus Stand / Sanatorium corridor',
    illustrativeFuelShare: '~₹40 - ₹60',
  },
  {
    id: 'corridor-sholinganallur',
    from: 'Sholinganallur / OMR',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 16,
    typicalDurationMin: 30,
    samplePickupArea: 'Elcot SEZ / Medavakkam link',
    illustrativeFuelShare: '~₹50 - ₹75',
  },
  {
    id: 'corridor-velachery',
    from: 'Velachery MRTS / Bypass',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 22,
    typicalDurationMin: 45,
    samplePickupArea: 'Velachery Bypass / Pallikaranai corridor',
    illustrativeFuelShare: '~₹80 - ₹110',
  },
  {
    id: 'corridor-guindy',
    from: 'Guindy Kathipara / Metro',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 26,
    typicalDurationMin: 50,
    samplePickupArea: 'Kathipara / Alandur Metro area',
    illustrativeFuelShare: '~₹90 - ₹125',
  },
  {
    id: 'corridor-central',
    from: 'Chennai Central / Suburban Hub',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 34,
    typicalDurationMin: 65,
    samplePickupArea: 'Central Station / Anna Salai corridor',
    illustrativeFuelShare: '~₹120 - ₹160',
  },
  {
    id: 'corridor-kelambakkam',
    from: 'Kelambakkam / OMR Junction',
    to: 'VIT Chennai Campus',
    approxDistanceKm: 6,
    typicalDurationMin: 12,
    samplePickupArea: 'Kelambakkam Bus Stand / Vandalur Rd',
    illustrativeFuelShare: '~₹20 - ₹35',
  },
];

interface PopularRoutesGridProps {
  onSelectRoute: (origin: string, destination: string) => void;
}

export const PopularRoutesGrid: React.FC<PopularRoutesGridProps> = ({ onSelectRoute }) => {
  return (
    <section className="section-padding" id="corridors" style={{ backgroundColor: '#ffffff' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Transit Corridors &bull; Planning Reference</span>
          <h2 className="section-title">Major Campus Commute Routes</h2>
          <p className="section-subtitle">
            Illustrative travel corridors between Chennai transit hubs and the Vandalur-Kelambakkam campus.
            Click any corridor to populate the search panel.
          </p>
        </div>

        {/* Transparent Disclaimer Banner */}
        <div
          style={{
            maxWidth: '860px',
            margin: '0 auto 2rem auto',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            fontSize: '0.825rem',
            color: 'var(--text-secondary)',
          }}
        >
          <Info size={18} style={{ color: 'var(--color-brand-600)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Illustrative Route Reference:</strong> Distance, duration, and fuel-split estimates shown below
            are non-binding planning references based on typical highway driving. No live rides are currently scheduled.
            When carpooling launches, verified drivers will publish their own specific itineraries and agreed fuel shares.
          </div>
        </div>

        <div className="corridors-grid">
          {CORRIDORS.map((corridor) => (
            <div
              key={corridor.id}
              className="corridor-card"
              onClick={() => onSelectRoute(corridor.from, corridor.to)}
              style={{ cursor: 'pointer' }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectRoute(corridor.from, corridor.to);
              }}
              aria-label={`Select illustrative corridor from ${corridor.from} to ${corridor.to}`}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--color-brand-700)',
                      backgroundColor: 'var(--color-brand-50)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    ~{corridor.approxDistanceKm} km approx
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <Clock size={12} />
                    <span>~{corridor.typicalDurationMin} min typical</span>
                  </span>
                </div>

                <div className="corridor-route">
                  <div className="corridor-endpoint">
                    <MapPin size={15} style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.9rem' }}>{corridor.from}</span>
                  </div>
                  <div
                    style={{
                      borderLeft: '2px dashed var(--border-medium)',
                      marginLeft: '7px',
                      height: '14px',
                    }}
                  />
                  <div className="corridor-endpoint">
                    <Navigation size={15} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.9rem' }}>{corridor.to}</span>
                  </div>
                </div>

                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Sample corridor stop: {corridor.samplePickupArea}
                </div>
              </div>

              <div className="corridor-meta">
                <div>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', display: 'block', color: 'var(--text-muted)' }}>
                    Fuel Share Benchmark
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                    {corridor.illustrativeFuelShare} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ seat</span>
                  </span>
                </div>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--color-brand-600)',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  <span>Use in Search</span>
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
