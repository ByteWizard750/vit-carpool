import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Car,
  Lock,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { SeparationBanner } from '../features/safety/SeparationBanner';
import { TrustCharterSection } from '../features/safety/TrustCharterSection';

export const SafetyPage: React.FC = () => {
  return (
    <div>
      {/* Header Banner */}
      <section style={{ padding: '60px 16px 48px', backgroundColor: '#f0fdf4', textAlign: 'center', borderBottom: '1px solid #bbf7d0' }}>
        <div className="container" style={{ maxWidth: '720px' }}>
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
            <ShieldCheck size={14} /> Security & Trust Architecture
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Campus Safety & Cohort Separation
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 auto 24px' }}>
            To safeguard comfortable communication, institutional respect, and peer trust, VIT Carpool enforces strict audience separation, domain-verified authentication, and privacy-first location handling.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link to="/auth">
              <Button variant="primary" size="lg" leftIcon={<ShieldCheck size={18} />}>
                Verify Your Campus Affiliation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Strict Student & Faculty Separation Section */}
      <SeparationBanner />

      {/* Core Safety Charter Section */}
      <TrustCharterSection />

      {/* Deep-Dive Architectural Guarantees */}
      <section style={{ padding: '60px 16px', backgroundColor: 'var(--bg-page)', borderTop: '1px solid var(--border-light)' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '24px', textAlign: 'center' }}>
            Architectural Guarantees
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                <Lock size={18} style={{ color: '#2563eb' }} /> Trusted Server-Side Enforcement
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Your audience (Student or Faculty) is derived authoritatively on our trusted backend from your institutional email domain (@vitstudent.ac.in or @vit.ac.in).
                The client cannot submit, tamper with, or override audience or verification status.
              </p>
            </div>

            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                <Car size={18} style={{ color: '#16a34a' }} /> Cars-Only Standard
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Two-wheelers and commercial vehicles (autos, yellow-board taxis) are strictly blocked by schema validation and rate limiters.
                Carpools take place solely in registered passenger cars for weather protection and travel comfort.
              </p>
            </div>

            <div style={{ padding: '24px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                <ShieldCheck size={18} style={{ color: '#7c3aed' }} /> PostGIS Spatial Privacy
              </div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Public search listings expose only general neighborhood and transit corridor names. Precise pickup doorsteps and contact numbers are encrypted and unlocked only after mutual booking confirmation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
