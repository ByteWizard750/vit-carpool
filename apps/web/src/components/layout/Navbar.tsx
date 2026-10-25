import React, { useState } from 'react';
import { Car, Menu, X, ArrowRight, ShieldCheck, LogOut, AlertCircle, CheckCircle, Clock, Calendar } from 'lucide-react';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenOffer: () => void;
  onOpenAuth: () => void;
  onOpenVerification?: () => void;
  onOpenVehicles?: () => void;
  onOpenMyRides?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSearch,
  onOpenOffer,
  onOpenAuth,
  onOpenVerification,
  onOpenVehicles,
  onOpenMyRides,
}) => {

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <header className="site-header">
      <div className="container nav-container">
        {/* Brand Wordmark */}
        <a href="#hero" className="brand-link" aria-label="VIT Carpool Home">
          <div className="brand-logo-mark">
            <Car size={22} strokeWidth={2.2} />
          </div>
          <div className="brand-text-block">
            <div className="brand-name">VIT Carpool</div>
            <div className="brand-tagline">VIT Chennai Campus</div>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="nav-desktop-links" aria-label="Primary Navigation">
          <a
            href="#search"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              onOpenSearch();
            }}
          >
            Find Rides
          </a>
          <a href="#separation" className="nav-link">
            Separation & Safety
          </a>
          <a href="#how-it-works" className="nav-link">
            How It Works
          </a>
          <a href="#corridors" className="nav-link">
            Campus Corridors
          </a>
          <a href="#charter" className="nav-link">
            Trust Charter
          </a>
        </nav>

        {/* Desktop Actions */}
        <div className="nav-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenOffer}
            id="nav-offer-ride-btn"
          >
            Offer a Ride
          </Button>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Verification Status Pill */}
              {user.verificationStatus === 'VERIFIED' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    backgroundColor: user.audience === 'FACULTY' ? '#f3e8ff' : '#dcfce7',
                    color: user.audience === 'FACULTY' ? '#6b21a8' : '#15803d',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                  id="nav-verified-badge"
                >
                  <CheckCircle size={13} />
                  <span>{user.audience === 'FACULTY' ? 'Faculty Verified' : 'Student Verified'}</span>
                </div>
              )}

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

              {/* My Vehicles & My Rides Buttons for Verified Users */}
              {user.verificationStatus === 'VERIFIED' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenVehicles}
                    leftIcon={<Car size={13} />}
                    id="nav-my-vehicles-btn"
                    title="Manage your registered vehicles"
                  >
                    My Vehicles
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenMyRides || onOpenOffer}
                    leftIcon={<Calendar size={13} />}
                    id="nav-my-rides-btn"
                    title="Manage your published rides"
                  >
                    My Rides
                  </Button>
                </>
              )}

              {/* User Name & Sign Out */}
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {user.fullName}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                leftIcon={<LogOut size={13} />}
                id="nav-signout-btn"
                title="Sign out of current account"
              >
                Sign Out
              </Button>
            </div>

          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenAuth}
              leftIcon={<ShieldCheck size={14} />}
              id="nav-signin-btn"
            >
              Sign In
            </Button>
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
          <a
            href="#search"
            className="nav-link"
            onClick={() => {
              setMobileMenuOpen(false);
              onOpenSearch();
            }}
          >
            Find Rides
          </a>
          <a
            href="#separation"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            Separation & Safety
          </a>
          <a
            href="#how-it-works"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            How It Works
          </a>
          <a
            href="#corridors"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            Campus Corridors
          </a>
          <a
            href="#charter"
            className="nav-link"
            onClick={() => setMobileMenuOpen(false)}
          >
            Trust Charter
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px' }}>
            {user ? (
              <>
                <div style={{ padding: '8px 12px', fontSize: '0.85rem', fontWeight: 600 }}>
                  Signed in as {user.fullName} ({user.verificationStatus})
                </div>
                {user.verificationStatus === 'PENDING' && (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenVerification?.();
                    }}
                  >
                    Submit Verification Request
                  </Button>
                )}
                {user.verificationStatus === 'VERIFIED' && (
                  <>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenVehicles?.();
                      }}
                      leftIcon={<Car size={16} />}
                    >
                      My Vehicles
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenMyRides ? onOpenMyRides() : onOpenOffer();
                      }}
                      leftIcon={<Calendar size={16} />}
                    >
                      My Rides
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  leftIcon={<LogOut size={16} />}
                >
                  Sign Out
                </Button>

              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenOffer();
                  }}
                >
                  Offer a Ride
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                  rightIcon={<ArrowRight size={16} />}
                >
                  Sign In
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
