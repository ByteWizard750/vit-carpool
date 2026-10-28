import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, Bell } from 'lucide-react';

interface InboxTabsProps {
  counts?: {
    messages?: number;
    notifications?: number;
  };
}

export const InboxTabs: React.FC<InboxTabsProps> = ({ counts }) => {
  return (
    <div className="segmented-tabs-wrapper" role="navigation" aria-label="Inbox sections">
      <div className="segmented-tabs">
        <NavLink
          to="/messages"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-inbox-messages"
        >
          <MessageSquare size={15} strokeWidth={2} />
          <span>Messages</span>
          {typeof counts?.messages === 'number' && counts.messages > 0 && (
            <span className="segmented-tab-badge">{counts.messages}</span>
          )}
        </NavLink>

        <NavLink
          to="/notifications"
          className={({ isActive }) =>
            `segmented-tab-btn ${isActive ? 'active' : ''}`
          }
          id="tab-inbox-updates"
        >
          <Bell size={15} strokeWidth={2} />
          <span>Updates</span>
          {typeof counts?.notifications === 'number' && counts.notifications > 0 && (
            <span className="segmented-tab-badge">{counts.notifications}</span>
          )}
        </NavLink>
      </div>
    </div>
  );
};
