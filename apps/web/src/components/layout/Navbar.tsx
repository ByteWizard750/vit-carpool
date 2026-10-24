import React, { useState } from 'react';
import { Car, Menu, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '../common/Button';

interface NavbarProps {
  onOpenSearch: () => void;
  onOpenOffer: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSearch,
  onOpenOffer,
  onOpenAuth,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAuth}
            leftIcon={<ShieldCheck size={14} />}
            id="nav-signin-btn"
          >
            Sign In (Preview)
          </Button>
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
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenOffer();
              }}
            >
              Offer a Ride (Preview)
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
              Preview Institutional Sign-In
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
