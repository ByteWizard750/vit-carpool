import React from 'react';
import { GraduationCap, Briefcase, Lock, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components/common/Badge';

export const SeparationBanner: React.FC = () => {
  return (
    <section className="section-padding" id="separation" style={{ backgroundColor: '#ffffff' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Architectural Requirement & Security Design</span>
          <h2 className="section-title">Strict Student & Faculty Community Separation</h2>
          <p className="section-subtitle">
            To ensure mutual comfort, appropriate peer communication, and institutional safety,
            the platform architecture requires complete segregation between student and faculty carpools.
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
                <h3 style={{ fontSize: '1.25rem' }}>Student Commuter Network</h3>
              </div>
              <Badge variant="student">Student Circle</Badge>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Planned for undergraduate and postgraduate students commuting between Chennai residential hubs
              (Tambaram, Velachery, Sholinganallur, OMR) and the campus.
            </p>

            <ul className="feature-list">
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Student-only rides (Requirement):</strong> When live, students will only be
                  permitted to view, request, and join rides published by verified student peers.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Institutional verification (Planned):</strong> Access will require confirmed institutional
                  affiliation, with audience determined strictly by server-side verification.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Database isolation (Design):</strong> Cross-circle queries will be blocked at the database
                  layer so faculty rides remain invisible to students.
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
                <h3 style={{ fontSize: '1.25rem' }}>Faculty & Staff Network</h3>
              </div>
              <Badge variant="faculty">Faculty Circle</Badge>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
              Dedicated for professors, academic researchers, and university staff commuting on regular
              academic schedules and departmental timings.
            </p>

            <ul className="feature-list">
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Faculty-only rides (Requirement):</strong> Faculty members will share rides
                  exclusively with other verified faculty colleagues.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Staff verification (Planned):</strong> Access will be verified through confirmed
                  university staff credentials before carpooling access is granted.
                </span>
              </li>
              <li className="feature-item">
                <CheckCircle2 size={16} className="feature-icon-check" />
                <span>
                  <strong>Segregated data (Design):</strong> Student listings and personal details will be
                  completely segregated in independent database partitions.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Database Invariant Callout */}
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
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0 }}>
            <strong>Server-Side Enforcement Standard:</strong> Audience assignment must be derived strictly from trusted
            server-side verification rules. Users will never be permitted to select or alter their own audience.
            PostgreSQL constraints and query filters will enforce this segregation before any ride is published or booked.
          </p>
        </div>
      </div>
    </section>
  );
};
