import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Mail,
  AlertTriangle,
  UserX,
  Navigation,
  KeyRound,
  FileCheck2,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { SeparationBanner } from '../features/safety/SeparationBanner';
import { TrustCharterSection } from '../features/safety/TrustCharterSection';

export const SafetyPage: React.FC = () => {
  return (
    <div>
      {/* Header Banner */}
      <section style={{ padding: '60px 16px 48px', backgroundColor: '#f0fdf4', textAlign: 'center', borderBottom: '1px solid #bbf7d0' }}>
        <div className="container" style={{ maxWidth: '760px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '9999px',
              backgroundColor: '#dcfce7',
              color: '#166534',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginBottom: '14px',
            }}
          >
            <ShieldCheck size={14} /> Campus Safety &amp; Trust Architecture
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Campus Safety, Privacy &amp; Community Standards
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 auto 24px' }}>
            To safeguard comfortable peer communication, institutional respect, and passenger peace of mind,
            VIT Carpool enforces separate student and faculty communities, domain-verified authentication,
            live GPS tracking privacy, and OTP boarding verification.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link to="/auth">
              <Button variant="primary" size="lg" leftIcon={<ShieldCheck size={18} />}>
                Sign In with Institutional Email
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Strict Student & Faculty Separation Section */}
      <SeparationBanner />

      {/* Core Safety Charter Section */}
      <TrustCharterSection />

      {/* Comprehensive Safety & Policy Guide */}
      <section style={{ padding: '60px 16px', backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-light)' }}>
        <div className="container" style={{ maxWidth: '860px' }}>
          <div className="section-header" style={{ marginBottom: '36px' }}>
            <span className="section-tag">Safety Standards</span>
            <h2 className="section-title">Safety, Privacy &amp; Community Guidelines</h2>
            <p className="section-subtitle">
              Clear, transparent explanations of our technical invariants, commuter responsibilities,
              and safety controls.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. What Institutional Email Verification Means */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Mail size={20} style={{ color: '#2563eb' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  What Institutional Email Verification Means
                </h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 10px' }}>
                Authentication confirms that a commuter has active, direct access to an official VIT email inbox
                (<code>@vitstudent.ac.in</code> for students, or <code>@vit.ac.in</code> for faculty and university staff).
              </p>
              <div style={{ padding: '12px 14px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '0.825rem', color: 'var(--text-secondary)', borderLeft: '3px solid #2563eb' }}>
                <strong>Important Clarification:</strong> Email verification authenticates campus email domain ownership.
                It does not constitute an official university endorsement, police background check, or physical identity verification.
                Commuters are advised to exercise standard personal prudence when coordinating trips.
              </div>
            </div>

            {/* 2. Boarding OTP Verification */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <KeyRound size={20} style={{ color: '#16a34a' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Cryptographic Boarding OTP Verification
                </h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 10px' }}>
                When your booking is confirmed, a unique, cryptographically random 6-digit boarding OTP is generated for each passenger.
              </p>
              <ul style={{ margin: '0 0 10px', paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li>Passengers present their boarding OTP upon physically entering the car.</li>
                <li>The driver inputs the OTP into the application to verify boarding before departing.</li>
                <li>OTPs are securely hashed using salted SHA-256; plaintexts are never stored in databases or driver payloads.</li>
                <li>Rate limits and brute-force lockouts prevent guess attacks.</li>
              </ul>
            </div>

            {/* 3. Live Tracking & Location Privacy */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <Navigation size={20} style={{ color: '#7c3aed' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Live Ride Tracking &amp; Location Privacy
                </h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 10px' }}>
                Live GPS tracking is accessible strictly during an active, in-progress ride, and exclusively to the confirmed driver
                and accepted passengers on that specific trip.
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li><strong>No Permanent Tracking:</strong> Location broadcasts terminate immediately when the driver completes or cancels the ride.</li>
                <li><strong>Doorstep Privacy:</strong> General transit corridors are shown publicly; precise landmark descriptions are unlocked only after booking confirmation.</li>
                <li><strong>Stale Detection:</strong> If a driver's GPS updates lapse for over 30 seconds, tracking is marked stale rather than falsely concluding the trip.</li>
              </ul>
            </div>

            {/* 4. Reporting & Blocking Controls */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <UserX size={20} style={{ color: '#dc2626' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Two-Tap Report &amp; Block Controls
                </h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 10px' }}>
                Commuters maintain immediate control over their peer interactions. Report and Block actions are accessible
                within two taps from relevant ride details, booking cards, and chat conversations.
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li><strong>Blocking:</strong> Instantly prevents the blocked user from viewing your rides, booking seats, sending messages, or viewing live tracking.</li>
                <li><strong>Reporting:</strong> Submits structured safety flags (unsafe driving, commercial fare solicitation, harassment, or no-shows) for administrative review.</li>
              </ul>
            </div>

            {/* 5. Moderation & Account Restrictions Process */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <AlertTriangle size={20} style={{ color: '#d97706' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Moderation &amp; Account Review Process
                </h3>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 10px' }}>
                We believe in fair, honest moderation. Reports are reviewed carefully based on community guidelines.
              </p>
              <div style={{ padding: '12px 14px', backgroundColor: '#fffbeb', borderRadius: '8px', fontSize: '0.825rem', color: '#92400e', borderLeft: '3px solid #d97706' }}>
                <strong>Fair Review Policy:</strong> Violations of campus trust (such as commercial fare extortion, reckless driving,
                unexcused no-shows, or harassment) may result in account restrictions or suspension following administrative review.
                Users facing restrictions receive transparent notices detailing the reason and status of their account.
              </div>
            </div>

            {/* 6. Commuter Responsibilities */}
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} id="terms">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <FileCheck2 size={20} style={{ color: '#059669' }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Commuter Responsibilities &amp; Terms
                </h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <li><strong>Drivers:</strong> Must possess a valid motor vehicle driving license, active vehicular insurance, and maintain their vehicle in roadworthy condition.</li>
                <li><strong>Punctuality:</strong> Both drivers and passengers must arrive at agreed pickup landmarks on time. Drivers should provide reasonable notice if transit delays occur.</li>
                <li><strong>Direct Fuel Sharing:</strong> Contributions are strictly non-commercial cost-sharing arrangements negotiated transparently between peers. Platform fees are zero.</li>
                <li><strong>Campus Decorum:</strong> Commuters must maintain respectful peer communication and uphold institutional codes of conduct at all times.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
