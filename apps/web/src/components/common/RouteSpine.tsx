import React from 'react';

export interface RouteSpineProps {
  origin: string;
  destination: string;
  departureTime?: string;
  arrivalTime?: string;
  variant?: 'compact' | 'full';
  className?: string;
}

export const RouteSpine: React.FC<RouteSpineProps> = ({
  origin,
  destination,
  departureTime,
  arrivalTime,
  variant = 'compact',
  className = '',
}) => {
  if (variant === 'compact') {
    return (
      <div className={`route-spine route-spine-compact ${className}`}>
        <div className="route-spine-markers">
          <span className="route-spine-dot route-spine-dot-origin" aria-hidden="true" />
          <span className="route-spine-line" aria-hidden="true" />
          <span className="route-spine-dot route-spine-dot-destination" aria-hidden="true" />
        </div>
        <div className="route-spine-content">
          <div className="route-spine-row">
            <span className="route-spine-place origin-text" title={origin}>
              {origin}
            </span>
            {departureTime && (
              <span className="route-spine-time font-tabular">{departureTime}</span>
            )}
          </div>
          <div className="route-spine-row">
            <span className="route-spine-place destination-text" title={destination}>
              {destination}
            </span>
            {arrivalTime && (
              <span className="route-spine-time font-tabular">{arrivalTime}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`route-spine route-spine-full ${className}`}>
      <div className="route-spine-step">
        <div className="route-spine-icon-col">
          <span className="route-spine-dot route-spine-dot-origin" aria-hidden="true" />
          <span className="route-spine-connector" aria-hidden="true" />
        </div>
        <div className="route-spine-step-info">
          <span className="route-spine-label">Pickup Origin</span>
          <span className="route-spine-location font-semibold">{origin}</span>
          {departureTime && (
            <span className="route-spine-timestamp font-tabular">
              Departs: <strong>{departureTime}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="route-spine-step">
        <div className="route-spine-icon-col">
          <span className="route-spine-dot route-spine-dot-destination" aria-hidden="true" />
        </div>
        <div className="route-spine-step-info">
          <span className="route-spine-label">Drop-off Destination</span>
          <span className="route-spine-location font-semibold">{destination}</span>
          {arrivalTime && (
            <span className="route-spine-timestamp font-tabular">
              Arrives: <strong>{arrivalTime}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
