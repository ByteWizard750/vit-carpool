import React from 'react';
import { HealthResponse } from '@vit-carpool/contracts';

interface Props {
  data?: HealthResponse;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
}

export const HealthStatusCard: React.FC<Props> = ({
  data,
  isLoading,
  isError,
  error,
  onRefresh,
}) => {
  const status = isError ? 'down' : data?.status || 'degraded';

  return (
    <div className="diag-card">
      <div className="diag-header">
        <div className="diag-title-group">
          <span style={{ fontSize: '1.25rem' }}>⚡</span>
          <h2 className="diag-title">Foundation & Infrastructure</h2>
        </div>
        <div className={`status-badge ${status}`}>
          <span className="pulse-dot"></span>
          <span>{isLoading ? 'Checking...' : status}</span>
        </div>
      </div>

      <div className="diag-grid">
        <div className="diag-item">
          <span className="diag-label">NestJS REST API</span>
          <span className="diag-value highlight">
            {isError ? 'Unreachable' : data?.service || 'Connecting...'}
          </span>
        </div>

        <div className="diag-item">
          <span className="diag-label">PostgreSQL Database</span>
          <span className="diag-value">
            {data?.database.connected
              ? `Connected (${data.database.databaseName})`
              : 'Disconnected'}
          </span>
        </div>

        <div className="diag-item">
          <span className="diag-label">PostGIS Spatial Extension</span>
          <span className="diag-value highlight">
            {data?.database.postgisInstalled
              ? `Installed (${data.database.postgisVersion})`
              : 'Not Detected'}
          </span>
        </div>

        <div className="diag-item">
          <span className="diag-label">Database Roundtrip Latency</span>
          <span className="diag-value">
            {data?.database.latencyMs !== undefined
              ? `${data.database.latencyMs} ms`
              : '—'}
          </span>
        </div>
      </div>

      {isError && (
        <div
          style={{
            padding: '0.75rem',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--status-danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: 'var(--status-danger)',
            fontSize: '0.85rem',
          }}
        >
          <strong>API Connection Error:</strong> {error?.message}
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Ensure NestJS API is running on <code>http://localhost:3000</code>.
          </div>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={onRefresh}
        disabled={isLoading}
        type="button"
        id="btn-refresh-health"
      >
        <span>🔄</span>
        <span>{isLoading ? 'Verifying Pipeline...' : 'Test Connection Again'}</span>
      </button>
    </div>
  );
};
