import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Briefcase, MessageSquare, LayoutDashboard, User } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export const BottomNav: React.FC = () => {
  const { user, token } = useAuth();
  const location = useLocation();
  const [chatUnread, setChatUnread] = useState<number>(0);
  const [notifUnread, setNotifUnread] = useState<number>(0);

  useEffect(() => {
    if (!user || !token) return;
    const fetchCounts = () => {
      fetch('/chat/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setChatUnread(d.unreadCount);
        })
        .catch(() => {});

      fetch('/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setNotifUnread(d.unreadCount);
        })
        .catch(() => {});
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [user, token]);

  const isHomeActive = user
    ? location.pathname === '/dashboard'
    : location.pathname === '/';

  const isTripsActive = user
    ? ['/bookings', '/my-rides', '/recurring-commutes', '/ride-alerts'].some((p) =>
        location.pathname.startsWith(p),
      )
    : location.pathname === '/how-it-works';

  const isInboxActive = user
    ? ['/messages', '/notifications'].some((p) => location.pathname.startsWith(p))
    : location.pathname === '/safety';

  const isProfileActive = user
    ? location.pathname === '/profile'
    : location.pathname === '/auth';

  const totalUnreadText = [
    chatUnread > 0 ? `${chatUnread} unread message${chatUnread > 1 ? 's' : ''}` : '',
    notifUnread > 0 ? `${notifUnread} unread update${notifUnread > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <nav className="bottom-nav" aria-label="Mobile Bottom Navigation">
      <NavLink
        to={user ? '/dashboard' : '/'}
        end={!user}
        className={`bottom-nav-item ${isHomeActive ? 'active' : ''}`}
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
        to={user ? '/bookings' : '/how-it-works'}
        className={`bottom-nav-item ${isTripsActive ? 'active' : ''}`}
        id="bottom-nav-trips"
      >
        <Briefcase size={20} />
        <span>{user ? 'My Trips' : 'Guide'}</span>
      </NavLink>

      <NavLink
        to={user ? '/messages' : '/safety'}
        className={`bottom-nav-item ${isInboxActive ? 'active' : ''}`}
        id="bottom-nav-inbox"
      >
        <div className="bottom-nav-icon-wrap">
          <MessageSquare size={20} />
          {chatUnread > 0 && (
            <span
              className="bottom-nav-badge"
              aria-label={totalUnreadText || `${chatUnread} unread messages`}
            >
              {chatUnread > 9 ? '9+' : chatUnread}
            </span>
          )}
          {notifUnread > 0 && chatUnread > 0 && (
            <span
              className="bottom-nav-notif-dot"
              title={`${notifUnread} updates`}
              aria-label={`${notifUnread} new updates`}
            />
          )}
          {notifUnread > 0 && chatUnread === 0 && (
            <span
              className="bottom-nav-badge bottom-nav-badge-notif"
              aria-label={totalUnreadText || `${notifUnread} new updates`}
            >
              {notifUnread > 9 ? '9+' : notifUnread}
            </span>
          )}
        </div>
        <span>{user ? 'Inbox' : 'Safety'}</span>
      </NavLink>

      <NavLink
        to={user ? '/profile' : '/auth'}
        className={`bottom-nav-item ${isProfileActive ? 'active' : ''}`}
        id="bottom-nav-profile"
      >
        <User size={20} />
        <span>{user ? 'Profile' : 'Sign In'}</span>
      </NavLink>
    </nav>
  );
};
