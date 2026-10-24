import React from 'react';
import { MapPin, Navigation, Calendar, Users, ShieldCheck, Clock } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { formatDisplayDate } from '../../utils/date';

interface SearchParams {
  origin: string;
  destination: string;
  date: string;
  seats: number;
}

interface SearchResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchParams: SearchParams | null;
  onOfferRide: () => void;
}

export const SearchResultsModal: React.FC<SearchResultsModalProps> = ({
  isOpen,
  onClose,
  searchParams,
  onOfferRide,
}) => {
  if (!searchParams) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ride Search Status"
      maxWidth="620px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Route query saved locally
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close Preview
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onOfferRide();
              }}
            >
              Preview Driver Publishing
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* User Search Query Summary */}
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: '8px',
            border: '1px solid var(--border-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Your Search Parameters
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <MapPin size={15} style={{ color: 'var(--color-brand-600)', flexShrink: 0 }} />
            <span>{searchParams.origin}</span>
            <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
            <Navigation size={15} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
            <span>{searchParams.destination}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={13} />
              <span>{formatDisplayDate(searchParams.date)}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Users size={13} />
              <span>{searchParams.seats} seat{searchParams.seats > 1 ? 's' : ''} requested</span>
            </span>
          </div>
        </div>

        {/* Honest Coming-Soon Empty State */}
        <div
          style={{
            padding: '24px 20px',
            borderRadius: '10px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
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
            <Clock size={24} />
          </div>

          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Live Ride Search Is Not Available Yet
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '460px', margin: '0 auto', lineHeight: '1.5' }}>
              The ride discovery and booking engine is currently under development. No live rides are currently scheduled or searchable in the system.
            </p>
          </div>

          <div
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-light)',
              textAlign: 'left',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} style={{ color: 'var(--color-brand-600)' }} />
              <span>Planned Ride-Search Architecture (Milestone 3):</span>
            </div>
            <ul style={{ paddingLeft: '20px', margin: 0, lineHeight: '1.5' }}>
              <li>Spatial matching will identify driver routes intersecting your transit corridor.</li>
              <li>Results will be strictly filtered at the database level to your verified circle (Student or Faculty).</li>
              <li>Atomic database locks will ensure seats cannot be overbooked.</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
};
