import React from 'react';
import { NavLink } from 'react-router-dom';
import { Ticket, Car, Repeat, BellRing } from 'lucide-react';

interface MyTripsTabsProps {
  counts?: {
    bookings?: number;
    driving?: number;
    schedules?: number;
    alerts?: number;
  };
}

export const MyTripsTabs: React.FC<MyTripsTabsProps> = ({ counts }) => {
  return (
    <div className="segmented-tabs-wrapper" role="navigation" aria-label="My trips sections">
      <div className="segmented-tabs">
        <NavLink
          to="/bookings"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-my-trips-bookings"
        >
          <Ticket size={15} strokeWidth={2} />
          <span>Bookings</span>
          {typeof counts?.bookings === 'number' && counts.bookings > 0 && (
            <span className="segmented-tab-badge">{counts.bookings}</span>
          )}
        </NavLink>

        <NavLink
          to="/my-rides"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-my-trips-driving"
        >
          <Car size={15} strokeWidth={2} />
          <span>Driving</span>
          {typeof counts?.driving === 'number' && counts.driving > 0 && (
            <span className="segmented-tab-badge">{counts.driving}</span>
          )}
        </NavLink>

        <NavLink
          to="/recurring-commutes"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-my-trips-schedules"
        >
          <Repeat size={15} strokeWidth={2} />
          <span>Schedules</span>
          {typeof counts?.schedules === 'number' && counts.schedules > 0 && (
            <span className="segmented-tab-badge">{counts.schedules}</span>
          )}
        </NavLink>

        <NavLink
          to="/ride-alerts"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-my-trips-alerts"
        >
          <BellRing size={15} strokeWidth={2} />
          <span>Alerts</span>
          {typeof counts?.alerts === 'number' && counts.alerts > 0 && (
            <span className="segmented-tab-badge">{counts.alerts}</span>
          )}
        </NavLink>
      </div>
    </div>
  );
};
