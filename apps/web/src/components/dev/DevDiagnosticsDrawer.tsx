import React from 'react';
import { HealthResponse } from '@vit-carpool/contracts';
import { Terminal, X, RefreshCw, Database, Server, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '../common/Button';

interface DevDiagnosticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data?: HealthResponse;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
}

export const DevDiagnosticsDrawer: React.FC<DevDiagnosticsDrawerProps> = ({
  isOpen,
  onClose,
  data,
  isLoading,
  isError,
  error,
  onRefresh,
}) => {
  if (!isOpen) return null;

  const isHealthy = !isError && data?.status === 'ok';
  const statusLabel = isError ? 'Unreachable' : data?.status?.toUpperCase() || 'Checking';

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="dev-drawer-title">
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={18} style={{ color: '#38bdf8' }} />
            <div>
              <h3 id="dev-drawer-title" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Developer Diagnostics
              </h3>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Internal Architecture & Infrastructure Monitor
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
            aria-label="Close diagnostics drawer"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Health Status Summary Badge */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: isHealthy ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${isHealthy ? '#a7f3d0' : '#fecaca'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isHealthy ? (
                <CheckCircle2 size={18} style={{ color: '#059669' }} />
              ) : (
                <AlertCircle size={18} style={{ color: '#dc2626' }} />
              )}
              <div>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isHealthy ? '#065f46' : '#991b1b',
                    textTransform: 'uppercase',
                  }}
                >
                  System Status: {statusLabel}
                </span>
                <div style={{ fontSize: '0.7rem', color: isHealthy ? '#047857' : '#b91c1c' }}>
                  {isError && error ? error.message : data?.environment ? `Environment: ${data.environment}` : 'Local Monorepo Dev'}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              isLoading={isLoading}
              leftIcon={<RefreshCw size={13} />}
              style={{ fontSize: '0.75rem', padding: '4px 10px', height: '30px' }}
              id="dev-drawer-refresh-btn"
            >
              Ping API
            </Button>
          </div>

          {/* Infrastructure Metrics Grid */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Active Backend Services
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* NestJS */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={16} style={{ color: '#2563eb' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      NestJS REST API
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Port 3000 / Proxy /health
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isError ? '#dc2626' : '#16a34a',
                  }}
                >
                  {isError ? 'Down' : data?.service || 'Online'}
                </span>
              </div>

              {/* PostgreSQL */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={16} style={{ color: '#0284c7' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      PostgreSQL Engine
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {data?.database.databaseName || 'vit_carpool_dev'} (127.0.0.1:5433)
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: data?.database.connected ? '#16a34a' : '#dc2626',
                  }}
                >
                  {data?.database.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              {/* PostGIS */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      PostGIS Spatial Extension
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {data?.database.postgisVersion || 'PostGIS 3.6 arm64'}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>
                  Installed
                </span>
              </div>

              {/* Roundtrip Latency */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} style={{ color: '#d97706' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Database Roundtrip Latency
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Prisma query benchmark
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {data?.database.latencyMs !== undefined ? `${data.database.latencyMs} ms` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Architecture Deliverables Checklist */}
          <div>
            <h4
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '10px',
              }}
            >
              Monorepo Architecture
            </h4>

            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
              }}
            >
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>Dockerized PostgreSQL 16 + PostGIS 3.6 (Native arm64)</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>Separated DBs: Dev, Test, and Prisma Shadow DB</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>pnpm Monorepo: NestJS API, Vite Web, Shared Contracts</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>OpenAPI (Swagger) Engine at <code>/api/docs</code></span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                <span>Milestone 2.1 Identity & Verification Architecture approved</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          <span>VIT Carpool Developer Tools</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close Panel
          </Button>
        </div>
      </aside>
    </>
  );
};
