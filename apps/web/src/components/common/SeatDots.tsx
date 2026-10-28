import React from 'react';
import { Users } from 'lucide-react';

export interface SeatDotsProps {
  available: number;
  total?: number;
  className?: string;
  showIcon?: boolean;
}

export const SeatDots: React.FC<SeatDotsProps> = ({
  available,
  total,
  className = '',
  showIcon = true,
}) => {
  const isFull = available <= 0;
  const computedTotal = total && total >= available ? total : Math.max(available, 4);
  const occupied = Math.max(0, computedTotal - available);

  return (
    <div
      className={`seat-indicator ${isFull ? 'seat-indicator-full' : 'seat-indicator-available'} ${className}`}
      title={`${available} of ${computedTotal} seats available`}
    >
      {showIcon && <Users size={14} className="seat-indicator-icon" />}
      <div className="seat-dots" aria-hidden="true">
        {Array.from({ length: computedTotal }).map((_, i) => {
          const isOccupied = i < occupied;
          return (
            <span
              key={i}
              className={`seat-dot ${isOccupied ? 'seat-dot-filled' : 'seat-dot-open'}`}
            />
          );
        })}
      </div>
      <span className="seat-text font-tabular">
        {isFull ? (
          <span className="text-danger font-semibold">Full</span>
        ) : (
          <span>
            <strong>{available}</strong> {available === 1 ? 'seat left' : 'seats left'}
          </span>
        )}
      </span>
    </div>
  );
};
