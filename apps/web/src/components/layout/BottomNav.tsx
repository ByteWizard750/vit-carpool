import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, PlusCircle, Briefcase, MessageSquare, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export const BottomNav: React.FC = () => {
  const { user, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    if (!user || !token) return;
    const fetchUnread = () => {
      fetch('/chat/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setUnreadCount(d.unreadCount);
        })
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 12000);
    return () => clearInterval(interval);
  }, [user, token]);

  return (
    <nav className="bottom-nav" aria-label="Mobile Bottom Navigation">
      <NavLink
        to={user ? '/dashboard' : '/'}
        end={!user}
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        id="bottom-nav-home"
      >
        {user ? <LayoutDashboard size={20} /> : <Home size={20} />}
        <span>{user ? 'Dashboard' : 'Home'}</span>
      </NavLink>

      <NavLink
        to="/rides"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        id="bottom-nav-find"
      >
        <Search size={20} />
        <span>Find Rides</span>
      </NavLink>

      <NavLink
        to="/offer-ride"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        id="bottom-nav-offer"
      >
        <PlusCircle size={22} className="bottom-nav-action-icon" />
        <span>Offer Ride</span>
      </NavLink>

      <NavLink
        to={user ? '/bookings' : '/how-it-works'}
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        id="bottom-nav-trips"
      >
        <Briefcase size={20} />
        <span>{user ? 'My Trips' : 'Guide'}</span>
      </NavLink>

      <NavLink
        to={user ? '/messages' : '/safety'}
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        id="bottom-nav-inbox"
      >
        <div className="bottom-nav-icon-wrap">
          <MessageSquare size={20} />
          {unreadCount > 0 && (
            <span className="bottom-nav-badge" aria-label={`${unreadCount} unread messages`}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <span>{user ? 'Inbox' : 'Safety'}</span>
      </NavLink>
    </nav>
  );
};
