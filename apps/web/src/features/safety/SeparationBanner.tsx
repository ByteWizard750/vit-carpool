import React from 'react';
import { GraduationCap, Briefcase, Lock, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components/common/Badge';

export const SeparationBanner: React.FC = () => {
  return (
    <section className="section-padding" id="separation" style={{ backgroundColor: '#ffffff' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Campus Safety</span>
          <h2 className="section-title">Independent Student and Faculty Communities</h2>
          <p className="section-subtitle">
            To ensure mutual comfort, appropriate peer communication, and campus trust,
            VIT Carpool maintains complete separation between student and faculty rides.
          </p>
        </div>

        <div className="separation-grid">
          {/* Student Network Card */}
          <div className="separation-card student">
            <div className="separation-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-brand-50)',
                    color: 'var(--color-brand-700)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GraduationCap size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem' }}>Student Community</h3>
              </div>
              <Badge variant="student">Student Community</Badge>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Designed for undergraduate and postgraduate students commuting between Chennai residential hubs
              (Tambaram, Velachery, Sholinganallur, OMR) and the campus.
            </p>

            <ul className="feature-list">
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Student-only rides:</strong> Students only view, request, and join rides
                  published by verified student peers.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Campus email verification:</strong> Access requires an active VIT student
                  email address with automated OTP confirmation.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Independent listings:</strong> Faculty listings remain strictly separate,
                  giving students an authentic peer carpool experience.
                </span>
              </li>
            </ul>
          </div>

          {/* Faculty Network Card */}
          <div className="separation-card faculty">
            <div className="separation-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#f5f3ff',
                    color: '#6d28d9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Briefcase size={20} />
                </div>
                <h3 style={{ fontSize: '1.25rem' }}>Faculty Community</h3>
              </div>
              <Badge variant="faculty">Faculty Community</Badge>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Dedicated for professors, academic researchers, and campus staff commuting on regular
              academic schedules and departmental timings.
            </p>

            <ul className="feature-list">
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Colleague-only rides:</strong> Faculty members share rides exclusively with
                  other verified academic and campus staff.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Institutional credentials:</strong> Access requires an active VIT institutional
                  email address with automated OTP verification.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Protected privacy:</strong> Direct messages, ride rosters, and contact info
                  remain strictly within the faculty community.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Audience Policy Callout */}
        <div
          style={{
            marginTop: '2rem',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Lock size={18} style={{ color: 'var(--color-brand-700)', flexShrink: 0 }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            <strong>Automatic Community Assignment:</strong> Your community is automatically assigned based on your verified
            institutional email domain (e.g. <code>@vitstudent.ac.in</code> vs <code>@vit.ac.in</code>) and cannot be modified manually.
          </p>
        </div>
      </div>
    </section>
  );
};
