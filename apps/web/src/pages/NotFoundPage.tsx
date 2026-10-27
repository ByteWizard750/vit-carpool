import React from 'react';
import { Link } from 'react-router-dom';
import { MapPinOff, Home, Search } from 'lucide-react';
import { Button } from '../components/common/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '480px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-brand-100)',
            color: 'var(--color-brand-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <MapPinOff size={32} />
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
          404 &bull; Corridor Not Found
        </h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '28px', lineHeight: '1.6' }}>
          The transit route or campus page you requested does not exist or has been relocated.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/">
            <Button variant="primary" size="md" leftIcon={<Home size={16} />}>
              Back to Home
            </Button>
          </Link>
          <Link to="/rides">
            <Button variant="outline" size="md" leftIcon={<Search size={16} />}>
              Explore Rides
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
