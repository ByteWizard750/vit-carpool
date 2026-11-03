import React from 'react';
import { ShieldCheck, CheckCircle2, DollarSign, Users } from 'lucide-react';

export const TrustCharterSection: React.FC = () => {
  return (
    <section className="section-padding charter-section" id="charter">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Safety Standards &amp; Principles</span>
          <h2 className="section-title">The VIT Carpool Trust Charter</h2>
          <p className="section-subtitle">
            Core trust invariants guiding the platform: verified institutional affiliation, community separation,
            driver discretion, and transparent fuel-cost sharing.
          </p>
        </div>

        <div className="charter-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {/* Fact 1: VIT institutional email authentication */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Institutional Email Authentication</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Access requires an active <code>@vitstudent.ac.in</code> or <code>@vit.ac.in</code> email address
              with automated OTP confirmation. Public consumer email accounts cannot access carpool features.
            </p>
          </div>

          {/* Fact 2: Separate student and faculty communities */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <CheckCircle2 size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Separate Student &amp; Faculty Communities</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Enforced strictly at the API and database layer. Students and faculty discover, request, and share
              rides exclusively within their respective campus communities.
            </p>
          </div>

          {/* Fact 3: Driver-approved bookings */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <Users size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Driver-Approved Bookings</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              No automatic bookings. Car owners maintain complete discretion to accept or decline seat requests
              after reviewing the passenger's verified campus profile and pickup stop.
            </p>
          </div>

          {/* Fact 4: Direct fuel-cost sharing */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <DollarSign size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Direct Fuel-Cost Sharing</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              A strictly non-commercial peer commute model. Passengers contribute fairly toward actual fuel
              expenses directly to the driver with zero platform commissions.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
