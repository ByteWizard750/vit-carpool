import React from 'react';
import { Shield, Car, CheckCircle2, DollarSign, Users, AlertTriangle } from 'lucide-react';

export const TrustCharterSection: React.FC = () => {
  return (
    <section className="section-padding charter-section" id="charter">
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Safety Standards & Operating Principles</span>
          <h2 className="section-title">The VIT Carpool Trust Charter</h2>
          <p className="section-subtitle">
            Core principles guiding our community design: verified institutional affiliation, driver discretion,
            and transparent non-commercial carpooling.
          </p>
        </div>

        <div className="charter-grid">
          {/* Item 1: Cars Only */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <Car size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Cars Only Standard</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Two-wheelers, auto-rickshaws, and commercial vehicles are not permitted. Every published ride
              must be in a privately owned four-wheeler adhering to standard highway safety requirements.
            </p>
          </div>

          {/* Item 2: Institutional Verification */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <Shield size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Institutional Verification (Planned)</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Access will require confirmed institutional credentials. Public consumer email accounts (Gmail,
              Outlook, Yahoo) will be ineligible from browsing or publishing rides.
            </p>
          </div>

          {/* Item 3: Driver Discretion */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <Users size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Driver Seat Approval</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              No automatic bookings. Car owners will maintain complete discretion to accept or decline any
              seat request after reviewing the passenger’s campus profile and proposed pickup point.
            </p>
          </div>

          {/* Item 4: Direct Non-Commercial Fuel Share */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <DollarSign size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Non-Commercial Cost Sharing</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              VIT Carpool is not a commercial taxi service. Passengers contribute transparently toward direct
              fuel and toll expenses via UPI or cash, with zero platform commissions.
            </p>
          </div>

          {/* Item 5: Strict Audience Separation */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <CheckCircle2 size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Strict Circle Segregation (Design)</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Enforced at the backend and database layer. Students cannot see or join faculty rides, and faculty
              cannot view student rides, ensuring appropriate campus boundaries.
            </p>
          </div>

          {/* Item 6: Community Standards */}
          <div className="charter-card">
            <div className="charter-icon-box">
              <AlertTriangle size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Community Standards</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Safe driving, punctuality, and mutual respect are essential. Unsafe driving, no-shows, harassment,
              or commercial fare solicitation will result in permanent account suspension.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
