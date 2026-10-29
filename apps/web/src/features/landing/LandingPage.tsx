import React from 'react';
import { ShieldCheck, GraduationCap, Car, Sparkles, ArrowRight } from 'lucide-react';
import { RideSearchPanel, SearchPanelParams } from '../search/RideSearchPanel';
import { SeparationBanner } from '../safety/SeparationBanner';
import { PopularRoutesGrid } from '../search/PopularRoutesGrid';
import { HowItWorksSection } from '../how-it-works/HowItWorksSection';
import { TrustCharterSection } from '../safety/TrustCharterSection';
import { Button } from '../../components/common/Button';

interface LandingPageProps {
  onSearch: (params: SearchPanelParams) => void;
  onOfferRide: () => void;
  onSelectRoute: (origin: string, destination: string) => void;
  onOpenAuth: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSearch,
  onOfferRide,
  onSelectRoute,
  onOpenAuth,
}) => {
  return (
    <main>
      {/* Hero Section */}
      <section className="hero-section" id="hero">
        <div className="container">
          <div className="hero-header">
            <div className="hero-kicker-badge">
              <Sparkles size={13} />
              <span>Campus Carpool &bull; VIT Chennai</span>
            </div>
            <h1 className="hero-title">
              Dedicated Campus Carpooling
            </h1>
            <p className="hero-lead">
              VIT Chennai students and faculty heading your way. Split the fuel, skip the solo drive,
              and commute safely with verified campus peers.
            </p>
          </div>

          {/* Prominent Ride Search Panel */}
          <RideSearchPanel onSearch={onSearch} onOfferRide={onOfferRide} />

          {/* Trust Invariants Strip */}
          <div className="trust-strip">
            <div className="trust-item">
              <ShieldCheck size={14} style={{ color: 'var(--color-brand-600)' }} />
              <span>Student &amp; Faculty Separation</span>
            </div>
            <div className="trust-item">
              <GraduationCap size={14} style={{ color: 'var(--color-brand-600)' }} />
              <span>Campus Affiliation Verification</span>
            </div>
            <div className="trust-item">
              <Car size={14} style={{ color: 'var(--color-brand-600)' }} />
              <span>Registered Personal Vehicles</span>
            </div>
            <div className="trust-item">
              <span>Fair Fuel Cost Sharing</span>
            </div>
          </div>
        </div>
      </section>

      {/* Strict Student & Faculty Separation Invariant */}
      <SeparationBanner />

      {/* Popular Campus Corridors */}
      <PopularRoutesGrid onSelectRoute={onSelectRoute} />

      {/* How Carpooling Works (Tabbed Passenger / Driver) */}
      <HowItWorksSection />

      {/* Trust & Safety Charter */}
      <TrustCharterSection />

      {/* Action Banner */}
      <section className="section-padding" style={{ backgroundColor: '#ffffff', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: '680px' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>
            Preparing Safer, Greener Commutes for Campus Peers
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
            Explore planned transit corridors and preview platform workflows as we build out institutional
            verification and verified carpooling features.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={onOpenAuth}
              leftIcon={<ShieldCheck size={18} />}
              id="cta-join-btn"
            >
              Preview Institutional Access
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={onOfferRide}
              rightIcon={<ArrowRight size={18} />}
              id="cta-offer-btn"
            >
              Preview Driver Publishing
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
};
