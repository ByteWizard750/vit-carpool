import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Car,
  Home,
  Menu,
  X,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  AlertCircle,
  Clock,
  Calendar,
  Ticket,
  User,
  LayoutDashboard,
  Search,
  MessageSquare,
  RefreshCw,
  Bell,
  Sparkles,
} from 'lucide-react';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';

interface NavbarProps {
  onOpenVerification?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenVerification }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!user || !token) return;
    const checkUnread = () => {
      fetch('/chat/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setUnreadCount(d.unreadCount);
        })
        .catch(() => {});

      fetch('/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setUnreadNotifCount(d.unreadCount);
        })
        .catch(() => {});
    };
    checkUnread();
    const interval = setInterval(checkUnread, 8000);
    return () => clearInterval(interval);
  }, [user, token]);

  const handleSignOut = () => {
    logout();
    navigate('/');
  };

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'nav-link active' : 'nav-link';

  return (
    <header className="site-header">
      <div className="container nav-container">
        {/* Brand Wordmark */}
        <Link to="/" className="brand-link" aria-label="VIT Carpool Home" onClick={() => setMobileMenuOpen(false)}>
          <div className="brand-logo-mark">
            <Car size={22} strokeWidth={2.2} />
          </div>
          <div className="brand-text-block">
            <div className="brand-name">VIT Carpool</div>
            <div className="brand-tagline">VIT Chennai Campus</div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="nav-desktop-links" aria-label="Primary Navigation">
          {user ? (
            <>
              <NavLink to="/" end className={getNavLinkClass} id="nav-link-home">
                Home
              </NavLink>
              <NavLink to="/dashboard" className={getNavLinkClass} id="nav-link-dashboard">
                Dashboard
              </NavLink>
              <NavLink to="/rides" className={getNavLinkClass} id="nav-link-rides">
                Find Rides
              </NavLink>
              <NavLink to="/offer-ride" className={getNavLinkClass} id="nav-link-offer">
                Offer a Ride
              </NavLink>
              <NavLink to="/my-rides" className={getNavLinkClass} id="nav-link-my-rides">
                My Rides
              </NavLink>
              <NavLink to="/bookings" className={getNavLinkClass} id="nav-link-bookings">
                Bookings
              </NavLink>
              <NavLink to="/recurring-commutes" className={getNavLinkClass} id="nav-link-recurring">
                Recurring
              </NavLink>
              <NavLink to="/ride-alerts" className={getNavLinkClass} id="nav-link-alerts">
                Ride Alerts
              </NavLink>
              <NavLink to="/vehicles" className={getNavLinkClass} id="nav-link-vehicles">
                Vehicles
              </NavLink>
              {user.role === 'ADMIN' && (
                <NavLink to="/admin" className={getNavLinkClass} id="nav-link-admin">
                  <ShieldAlert size={15} style={{ marginRight: '4px', verticalAlign: 'text-bottom', color: '#dc2626' }} /> Admin
                </NavLink>
              )}
            </>
          ) : (
            <>
              <NavLink to="/" end className={getNavLinkClass} id="nav-link-home">
                Home
              </NavLink>
              <NavLink to="/rides" className={getNavLinkClass} id="nav-link-rides">
                Find Rides
              </NavLink>
              <NavLink to="/how-it-works" className={getNavLinkClass} id="nav-link-how-it-works">
                How It Works
              </NavLink>
              <NavLink to="/safety" className={getNavLinkClass} id="nav-link-safety">
                Separation & Safety
              </NavLink>
            </>
          )}
        </nav>

        {/* Desktop Actions */}
        <div className="nav-actions">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Messages Quick-Action Icon Button on Top */}
              <NavLink
                to="/messages"
                title="Messages & Ride Chats"
                id="nav-messages-icon-btn"
                style={({ isActive }) => ({
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                  border: isActive ? '1.5px solid #3b82f6' : '1px solid var(--border-medium)',
                  color: isActive ? '#2563eb' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                })}
              >
                <MessageSquare size={18} />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      minWidth: '18px',
                      height: '18px',
                      padding: '0 4px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                    id="nav-unread-badge"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>

              {/* Notifications Quick-Action Icon Button on Top */}
              <NavLink
                to="/notifications"
                title="Notifications"
                id="nav-notifications-icon-btn"
                style={({ isActive }) => ({
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                  border: isActive ? '1.5px solid #3b82f6' : '1px solid var(--border-medium)',
                  color: isActive ? '#2563eb' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                })}
              >
                <Bell size={18} />
                {unreadNotifCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      minWidth: '18px',
                      height: '18px',
                      padding: '0 4px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                    id="nav-notifications-unread-badge"
                  >
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </NavLink>
              {user.verificationStatus === 'PENDING' && (
                <button
                  type="button"
                  onClick={onOpenVerification}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: '1px solid #fde68a',
                    cursor: 'pointer',
                  }}
                  title="Click to submit verification request"
                  id="nav-pending-badge"
                >
                  <Clock size={13} />
                  <span>Pending Verification</span>
                </button>
              )}

              {user.verificationStatus === 'SUSPENDED' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                  id="nav-suspended-badge"
                >
                  <AlertCircle size={13} />
                  <span>Suspended</span>
                </div>
              )}

              {/* Profile Link Button */}
              <Link to="/profile" style={{ textDecoration: 'none' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<User size={14} />}
                  id="nav-profile-btn"
                  title="View account profile"
                >
                  {user.fullName.split(' ')[0]}
                </Button>
              </Link>

              {/* Logout Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                leftIcon={<LogOut size={13} />}
                id="nav-signout-btn"
                title="Sign out of current account"
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
                <Button variant="ghost" size="sm" id="nav-offer-ride-btn">
                  Offer a Ride
                </Button>
              </Link>
              <Link to="/auth" style={{ textDecoration: 'none' }}>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<ShieldCheck size={14} />}
                  id="nav-signin-btn"
                >
                  Sign In / Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          type="button"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-panel">
          {user ? (
            <>
              <div style={{ padding: '8px 12px', fontSize: '0.85rem', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>
                Signed in as {user.fullName} ({user.audience || 'Campus Member'})
              </div>
              <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Home size={16} style={{ marginRight: '6px' }} /> Home
              </Link>
              <Link to="/dashboard" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <LayoutDashboard size={16} style={{ marginRight: '6px' }} /> Dashboard
              </Link>
              <Link to="/rides" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Search size={16} style={{ marginRight: '6px' }} /> Find Rides
              </Link>
              <Link to="/offer-ride" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Car size={16} style={{ marginRight: '6px' }} /> Offer a Ride
              </Link>
              <Link to="/my-rides" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Calendar size={16} style={{ marginRight: '6px' }} /> My Rides
              </Link>
              <Link to="/bookings" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Ticket size={16} style={{ marginRight: '6px' }} /> Bookings
              </Link>
              <Link to="/recurring-commutes" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <RefreshCw size={16} style={{ marginRight: '6px' }} /> Recurring Commutes
              </Link>
              <Link to="/messages" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <MessageSquare size={16} style={{ marginRight: '6px' }} /> Messages
                {unreadCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>
              <Link to="/notifications" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Bell size={16} style={{ marginRight: '6px' }} /> Notifications
                {unreadNotifCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      backgroundColor: '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    {unreadNotifCount}
                  </span>
                )}
              </Link>
              <Link to="/ride-alerts" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Sparkles size={16} style={{ marginRight: '6px' }} /> Ride Alerts
              </Link>
              <Link to="/vehicles" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <Car size={16} style={{ marginRight: '6px' }} /> Vehicles
              </Link>
              <Link to="/profile" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                <User size={16} style={{ marginRight: '6px' }} /> Profile
              </Link>
              {user.role === 'ADMIN' && (
                <Link to="/admin" className="nav-link" onClick={() => setMobileMenuOpen(false)} style={{ color: '#dc2626', fontWeight: 700 }}>
                  <ShieldAlert size={16} style={{ marginRight: '6px' }} /> Admin Console
                </Link>
              )}
              <div style={{ paddingTop: '8px' }}>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  leftIcon={<LogOut size={16} />}
                  style={{ width: '100%' }}
                >
                  Sign Out
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                Home
              </Link>
              <Link to="/rides" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                Find Rides
              </Link>
              <Link to="/how-it-works" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                How It Works
              </Link>
              <Link to="/safety" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                Separation & Safety
              </Link>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
                <Link to="/offer-ride" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="md" style={{ width: '100%' }}>
                    Offer a Ride
                  </Button>
                </Link>
                <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="primary" size="md" rightIcon={<ArrowRight size={16} />} style={{ width: '100%' }}>
                    Sign In / Sign Up
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
};
