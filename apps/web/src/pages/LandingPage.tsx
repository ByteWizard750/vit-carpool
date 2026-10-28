import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, GraduationCap, Car, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { RideSearchPanel, SearchPanelParams } from '../features/search/RideSearchPanel';
import { SeparationBanner } from '../features/safety/SeparationBanner';
import { PopularRoutesGrid } from '../features/search/PopularRoutesGrid';
import { HowItWorksSection } from '../features/how-it-works/HowItWorksSection';
import { TrustCharterSection } from '../features/safety/TrustCharterSection';
import { Button } from '../components/common/Button';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleSearch = (params: SearchPanelParams) => {
    const searchParams = new URLSearchParams();
    if (params.origin) searchParams.set('origin', params.origin);
    if (params.destination) searchParams.set('destination', params.destination);
    if (params.date) searchParams.set('date', params.date);
    if (params.seats) searchParams.set('seats', params.seats.toString());
    if (params.originLat !== undefined) searchParams.set('originLat', params.originLat.toString());
    if (params.originLon !== undefined) searchParams.set('originLon', params.originLon.toString());
    if (params.destLat !== undefined) searchParams.set('destLat', params.destLat.toString());
    if (params.destLon !== undefined) searchParams.set('destLon', params.destLon.toString());

    navigate(`/rides?${searchParams.toString()}`);
  };

  const handleSelectRoute = (origin: string, destination: string) => {
    const searchParams = new URLSearchParams({
      origin,
      destination,
      seats: '1',
    });
    navigate(`/rides?${searchParams.toString()}`);
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="hero-section" id="hero">
        <div className="container">
          <div className="hero-header">
            <div className="hero-kicker-badge">
              <Sparkles size={13} />
              <span>Campus Carpool &bull; VIT Chennai</span>
            </div>
            <h1 className="hero-title">
              Share the ride to campus.
              <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}>
                Dedicated Campus Carpooling
              </span>
            </h1>
            <p className="hero-lead">
              VIT Chennai students and faculty heading your way. Split the fuel, skip the solo drive,
              and commute safely with verified campus peers.
            </p>
          </div>

          {/* Prominent Ride Search Panel */}
          <RideSearchPanel
            onSearch={handleSearch}
            onOfferRide={() => navigate('/offer-ride')}
          />

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
              <CheckCircle2 size={14} style={{ color: 'var(--color-brand-600)' }} />
              <span>Fair Fuel Cost Sharing</span>
            </div>
          </div>
        </div>
      </section>

      {/* Student & Faculty Separation Section */}
      <SeparationBanner />

      {/* Popular Campus Corridors */}
      <PopularRoutesGrid onSelectRoute={handleSelectRoute} />

      {/* How Carpooling Works (Tabbed Passenger / Driver) */}
      <HowItWorksSection />

      {/* Trust & Safety Charter */}
      <TrustCharterSection />

      {/* Action Banner */}
      <section className="section-padding" style={{ backgroundColor: '#ffffff', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: '680px' }}>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '12px' }}>
            Safer, Greener Commutes for VIT Chennai
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
            Connect with daily commuters traveling between campus and Chennai transit hubs.
            Sign in with your official VIT email to get started.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/auth')}
              leftIcon={<ShieldCheck size={18} />}
              id="cta-join-btn"
            >
              Sign In / Sign Up
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate('/offer-ride')}
              rightIcon={<ArrowRight size={18} />}
              id="cta-offer-btn"
            >
              Offer a Ride
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
