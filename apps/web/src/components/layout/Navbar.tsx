import React, { useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Car,
  Home,
  Menu,
  X,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Calendar,
  RefreshCw,
  Bell,
  Sparkles,
} from 'lucide-react';
import { Button } from '../common/Button';
import { AccountMenu } from '../navigation/AccountMenu';
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
  const location = useLocation();

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
              <NavLink to="/dashboard" className={getNavLinkClass} id="nav-link-dashboard">
                Dashboard
              </NavLink>
              <NavLink to="/rides" className={getNavLinkClass} id="nav-link-rides">
                Find Rides
              </NavLink>
              <NavLink
                to="/bookings"
                className={() =>
                  ['/bookings', '/my-rides', '/recurring-commutes', '/ride-alerts'].some((p) =>
                    location.pathname.startsWith(p)
                  )
                    ? 'nav-link active'
                    : 'nav-link'
                }
                id="nav-link-trips"
              >
                My Trips
              </NavLink>
              <NavLink
                to="/messages"
                className={() =>
                  ['/messages', '/notifications'].some((p) => location.pathname.startsWith(p))
                    ? 'nav-link active'
                    : 'nav-link'
                }
                id="nav-link-inbox"
              >
                <span>Inbox</span>
                {unreadCount + unreadNotifCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '18px',
                      height: '18px',
                      padding: '0 4px',
                      borderRadius: '9999px',
                      backgroundColor: 'var(--brand-blue, #2340b8)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 700,
                      marginLeft: '4px',
                    }}
                  >
                    {unreadCount + unreadNotifCount > 99 ? '99+' : unreadCount + unreadNotifCount}
                  </span>
                )}
              </NavLink>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Link to="/offer-ride" style={{ textDecoration: 'none' }} id="nav-link-offer">
                <Button variant="primary" size="sm" id="nav-btn-offer-ride">
                  Offer a Ride
                </Button>
              </Link>
              <AccountMenu onOpenVerification={onOpenVerification} />
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
                  Sign In
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
              {/* User Identity / Dashboard Link Card */}
              <Link
                to="/dashboard"
                className="nav-link"
                onClick={() => setMobileMenuOpen(false)}
                id="mobile-drawer-dashboard"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-subtle)',
                  marginBottom: '6px',
                  textDecoration: 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {user.fullName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {user.email} &bull; {user.audience === 'FACULTY' ? 'Faculty Cohort' : 'Student Cohort'}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-brand-600)', fontWeight: 600 }}>
                  Dashboard &rarr;
                </span>
              </Link>

              {/* Primary Action CTA */}
              <Link
                to="/offer-ride"
                style={{ textDecoration: 'none', marginBottom: '6px', display: 'block' }}
                onClick={() => setMobileMenuOpen(false)}
                id="mobile-drawer-offer-ride"
              >
                <Button variant="primary" size="md" leftIcon={<Car size={16} />} style={{ width: '100%' }}>
                  + Offer a Ride
                </Button>
              </Link>

              <div className="mobile-nav-heading">My Trips &amp; Schedules</div>
              <Link to="/my-rides" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-my-rides">
                <Calendar size={16} style={{ marginRight: '8px' }} /> My Published Rides
              </Link>
              <Link to="/recurring-commutes" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-recurring">
                <RefreshCw size={16} style={{ marginRight: '8px' }} /> Recurring Commutes
              </Link>
              <Link to="/ride-alerts" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-alerts">
                <Sparkles size={16} style={{ marginRight: '8px' }} /> Corridor Alerts
              </Link>

              <div className="mobile-nav-heading">Account &amp; Fleet</div>
              <Link to="/vehicles" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-vehicles">
                <Car size={16} style={{ marginRight: '8px' }} /> Registered Vehicles
              </Link>
              <Link to="/notifications" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-notifications">
                <Bell size={16} style={{ marginRight: '8px' }} /> Notifications
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

              <div className="mobile-nav-heading">Campus Community</div>
              <Link to="/safety" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-safety">
                <ShieldCheck size={16} style={{ marginRight: '8px' }} /> Separation &amp; Safety
              </Link>
              <Link to="/how-it-works" className="nav-link" onClick={() => setMobileMenuOpen(false)} id="mobile-drawer-guide">
                <Home size={16} style={{ marginRight: '8px' }} /> How It Works
              </Link>

              {user.role === 'ADMIN' && (
                <>
                  <div className="mobile-nav-heading" style={{ color: '#dc2626' }}>Administration</div>
                  <Link
                    to="/admin"
                    className="nav-link"
                    onClick={() => setMobileMenuOpen(false)}
                    id="mobile-drawer-admin"
                    style={{ color: '#dc2626', fontWeight: 700 }}
                  >
                    <ShieldAlert size={16} style={{ marginRight: '8px' }} /> Admin Console
                  </Link>
                </>
              )}

              <div style={{ paddingTop: '10px', marginTop: '6px', borderTop: '1px solid var(--border-light)' }}>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  leftIcon={<LogOut size={16} />}
                  style={{ width: '100%' }}
                  id="mobile-drawer-signout"
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
