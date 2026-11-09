import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
    setMobileMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setMobileMenuOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileMenuOpen]);

  React.useEffect(() => {
    if (!user || !token) return;
    const checkUnread = () => {
      fetch('/api/chat/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.unreadCount === 'number') setUnreadCount(d.unreadCount);
        })
        .catch(() => {});

      fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          const count = typeof d?.unreadCount === 'number' ? d.unreadCount : typeof d?.count === 'number' ? d.count : 0;
          setUnreadNotifCount(count);
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
              <NavLink to="/" end className={getNavLinkClass} id="nav-link-home" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Home size={15} />
                <span>Home</span>
              </NavLink>
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
              <NavLink to="/" end className={getNavLinkClass} id="nav-link-home" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Home size={15} />
                <span>Home</span>
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
      {mobileMenuOpen &&
        createPortal(
          <>
            <div
              className="mobile-nav-backdrop"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div className="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Mobile Navigation">
              {user ? (
                <>
                  {/* User Identity / Dashboard Link Card */}
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    id="mobile-drawer-dashboard"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--bg-subtle, #f8fafc)',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      marginBottom: '8px',
                      textDecoration: 'none',
                      minWidth: 0,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--brand-subtle, #eef3ff)',
                            color: 'var(--brand-blue, #2340b8)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {user.fullName
                            ? user.fullName
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()
                            : 'U'}
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.2,
                          }}
                        >
                          {user.fullName}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}
                          title={`${user.email} • ${user.audience === 'FACULTY' ? 'Faculty Cohort' : 'Student Cohort'}`}
                        >
                          <span>{user.email}</span>
                          <span style={{ margin: '0 4px', opacity: 0.6 }}>&bull;</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {user.audience === 'FACULTY' ? 'Faculty Cohort' : 'Student Cohort'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-brand-600, #2563eb)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <span>Dashboard</span>
                      <span>&rarr;</span>
                    </div>
                  </Link>

              {/* Home Navigation Link */}
              <Link
                to="/"
                className="nav-link"
                onClick={() => setMobileMenuOpen(false)}
                id="mobile-drawer-home"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: location.pathname === '/' ? 'var(--color-brand-600, #2563eb)' : 'var(--text-primary)',
                  backgroundColor: location.pathname === '/' ? 'var(--bg-subtle, #f1f5f9)' : 'transparent',
                }}
              >
                <Home size={16} style={{ marginRight: '8px', color: 'var(--color-brand-600, #2563eb)' }} />
                <span>Home</span>
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
          </>,
          document.body
        )}
    </header>
  );
};
