import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHealthStatus } from './services/api';
import { HealthStatusCard } from './components/HealthStatusCard';

export const App: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealthStatus,
    refetchInterval: 10000, // Periodic health ping every 10s
    retry: 2,
  });

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-icon">🚗</div>
          <div>
            <div className="brand-title">VIT Carpool</div>
            <div className="brand-subtitle">Campus Ride Share</div>
          </div>
        </div>
        <div className="campus-pill">🎓 VIT Chennai</div>
      </header>

      {/* Hero Intro */}
      <section className="hero-card">
        <div className="hero-tag">Milestone 1 — Foundation Shell</div>
        <h1 className="hero-title">Exclusive Campus Carpooling</h1>
        <p className="hero-desc">
          A mobile-first, verified ride-sharing platform connecting VIT Chennai students and faculty
          to share daily commutes, reduce fuel costs, and travel safely with trusted peers.
        </p>
      </section>

      {/* Invariants Assurance Strip */}
      <section className="invariants-strip">
        <div className="invariant-pill">
          <span className="invariant-icon">🛡️</span>
          <span>Strict Student / Faculty Separation</span>
        </div>
        <div className="invariant-pill">
          <span className="invariant-icon">🔐</span>
          <span>Verified Institutional Accounts</span>
        </div>
        <div className="invariant-pill">
          <span className="invariant-icon">🚘</span>
          <span>Cars Only (Non-Commercial)</span>
        </div>
        <div className="invariant-pill">
          <span className="invariant-icon">⚡</span>
          <span>Atomic Concurrency (No Overbooking)</span>
        </div>
      </section>

      {/* Live System Diagnostics */}
      <main>
        <HealthStatusCard
          data={data}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRefresh={() => refetch()}
        />
      </main>

      {/* Architecture Highlights */}
      <section className="diag-card">
        <div className="diag-title-group">
          <span style={{ fontSize: '1.25rem' }}>📐</span>
          <h2 className="diag-title">Milestone 1 Deliverables Verified</h2>
        </div>
        <ul
          style={{
            listStyleType: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
          }}
        >
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--status-success)' }}>✔</span>
            <span>Dockerized PostgreSQL 16 + PostGIS 3.6 (Native Apple Silicon arm64)</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--status-success)' }}>✔</span>
            <span>Separate Isolated DBs: Development, Automated Testing, and Shadow</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--status-success)' }}>✔</span>
            <span>pnpm Monorepo: NestJS API, React 18 PWA Shell, Shared Contracts</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--status-success)' }}>✔</span>
            <span>OpenAPI (Swagger) Engine at <code>/api/docs</code></span>
          </li>
        </ul>
      </section>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          VIT Chennai Carpooling Platform &bull; Independent Community Project
        </p>
        <p style={{ marginTop: '0.25rem' }}>
          Explore project specifications in the{' '}
          <a
            href="https://github.com"
            className="footer-link"
            target="_blank"
            rel="noreferrer"
          >
            docs/
          </a>{' '}
          directory.
        </p>
      </footer>
    </div>
  );
};
