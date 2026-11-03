import React from 'react';
import { Search, UserCheck, ShieldCheck } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  return (
    <section className="section-padding" id="how-it-works" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Simple &amp; Safe Workflow</span>
          <h2 className="section-title">How Campus Carpooling Works</h2>
          <p className="section-subtitle">
            A straightforward three-step process built around verified institutional email authentication,
            driver discretion, and secure boarding verification.
          </p>
        </div>

        {/* 3 Straightforward Steps */}
        <div className="steps-grid">
          <div className="step-card">
            <div className="step-num-badge">1</div>
            <h3 className="step-title">Find or Offer a Ride</h3>
            <p className="step-desc">
              Search active campus corridors by area and schedule, or offer spare seats in your personal car
              to split travel costs with peers traveling the same way.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <Search size={16} />
              <span>Community-isolated route discovery</span>
            </div>
          </div>

          <div className="step-card">
            <div className="step-num-badge">2</div>
            <h3 className="step-title">Connect &amp; Confirm a Seat</h3>
            <p className="step-desc">
              Request a seat on a matching ride. Drivers review the requester's campus profile and pickup stop
              before confirming, keeping seat allocation completely in driver control.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <UserCheck size={16} />
              <span>Mutual profile visibility &amp; driver approval</span>
            </div>
          </div>

          <div className="step-card">
            <div className="step-num-badge">3</div>
            <h3 className="step-title">Coordinate &amp; Verify Boarding</h3>
            <p className="step-desc">
              Track live driver approach on the map, coordinate via secure messaging, and show your unique
              6-digit boarding OTP when entering the vehicle for verified departure.
            </p>
            <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <ShieldCheck size={16} />
              <span>Live tracking &amp; secure OTP verification</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
