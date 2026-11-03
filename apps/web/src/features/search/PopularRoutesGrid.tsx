import React from 'react';
import { MapPin, Navigation, ArrowRight, Compass } from 'lucide-react';

interface RouteCorridor {
  id: string;
  from: string;
  to: string;
  corridorType: string;
  keyPickupAreas: string;
}

const CORRIDORS: RouteCorridor[] = [
  {
    id: 'corridor-tambaram',
    from: 'Tambaram Railway Station',
    to: 'VIT Chennai Campus',
    corridorType: 'Suburban Rail & GST Road Link',
    keyPickupAreas: 'East Tambaram Bus Stand, Sanatorium, MEPZ',
  },
  {
    id: 'corridor-sholinganallur',
    from: 'Sholinganallur Junction',
    to: 'VIT Chennai Campus',
    corridorType: 'OMR IT Corridor',
    keyPickupAreas: 'Elcot SEZ, Medavakkam Link Road, Navalur',
  },
  {
    id: 'corridor-velachery',
    from: 'Velachery MRTS Station',
    to: 'VIT Chennai Campus',
    corridorType: 'Bypass & Rapid Transit Link',
    keyPickupAreas: 'Velachery Bypass, Pallikaranai, Medavakkam',
  },
  {
    id: 'corridor-guindy',
    from: 'Guindy Metro Station',
    to: 'VIT Chennai Campus',
    corridorType: 'Metro & Inner Ring Road',
    keyPickupAreas: 'Kathipara Junction, Alandur, GST Road',
  },
  {
    id: 'corridor-central',
    from: 'Chennai Central / City Hub',
    to: 'VIT Chennai Campus',
    corridorType: 'Suburban Transit Hub',
    keyPickupAreas: 'Chennai Central, Egmore, Anna Salai',
  },
  {
    id: 'corridor-kelambakkam',
    from: 'Kelambakkam Junction',
    to: 'VIT Chennai Campus',
    corridorType: 'Vandalur-Kelambakkam Arterial',
    keyPickupAreas: 'Kelambakkam Bus Stand, Chettinad Hospital Rd',
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
          <span className="section-tag">Campus Transit Corridors</span>
          <h2 className="section-title">Major Campus Commute Routes</h2>
          <p className="section-subtitle">
            Frequent travel corridors connecting Chennai transit hubs and the Vandalur-Kelambakkam campus.
            Select any corridor to check for active rides.
          </p>
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
              aria-label={`Search corridor from ${corridor.from} to ${corridor.to}`}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--color-brand-700)',
                      backgroundColor: 'var(--color-brand-50)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {corridor.corridorType}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <Compass size={13} />
                    <span>Campus Route</span>
                  </span>
                </div>

                <div className="corridor-route">
                  <div className="corridor-endpoint">
                    <MapPin size={15} style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{corridor.from}</span>
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
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{corridor.to}</span>
                  </div>
                </div>

                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Common stops: {corridor.keyPickupAreas}
                </div>
              </div>

              <div className="corridor-meta" style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Verified Commuters
                </span>

                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: 'var(--color-brand-600)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                  }}
                >
                  <span>Search Route</span>
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
