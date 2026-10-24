import React from 'react';
import { Car, ShieldCheck, Terminal, ExternalLink } from 'lucide-react';

interface FooterProps {
  onOpenDevStatus: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenDevStatus }) => {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top-grid">
          {/* Brand Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  backgroundColor: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Car size={16} />
              </div>
              <h3 className="footer-brand-title">VIT Carpool</h3>
            </div>
            <p style={{ maxWidth: '420px', lineHeight: '1.6', fontSize: '0.85rem' }}>
              Planned carpooling platform for the VIT Chennai student and faculty communities.
              Designed for safe, cost-shared daily commutes between Chennai and the Vandalur-Kelambakkam campus.
            </p>
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
              Vandalur-Kelambakkam Road, Rajan Nagar, Chennai, Tamil Nadu 600127
            </div>
          </div>

          {/* Platform Navigation */}
          <div>
            <h4 className="footer-col-title">Platform Areas</h4>
            <ul className="footer-links-list">
              <li>
                <a href="#search">Route Search</a>
              </li>
              <li>
                <a href="#separation">Student & Faculty Separation</a>
              </li>
              <li>
                <a href="#how-it-works">How Carpooling Works</a>
              </li>
              <li>
                <a href="#corridors">Campus Transit Corridors</a>
              </li>
              <li>
                <a href="#charter">Trust Charter & Standards</a>
              </li>
            </ul>
          </div>

          {/* Community & Engineering */}
          <div>
            <h4 className="footer-col-title">Community & Tech</h4>
            <ul className="footer-links-list">
              <li>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={14} style={{ color: '#16a34a' }} />
                  <span>Planned Verification Gate</span>
                </span>
              </li>
              <li>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span>Strict Separation Design</span>
                </span>
              </li>
              <li>
                <a
                  href="https://github.com/ByteWizard750/vit-carpool"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>Architecture Docs</span>
                  <ExternalLink size={12} />
                </a>
              </li>
              {import.meta.env.DEV && (
                <li style={{ paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={onOpenDevStatus}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#60a5fa',
                    }}
                    id="footer-dev-diagnostics-btn"
                  >
                    <Terminal size={14} />
                    <span>Developer Diagnostics (Dev Mode)</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Disclaimers */}
        <div className="footer-bottom-bar">
          <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
            &copy; {new Date().getFullYear()} VIT Carpool. Independent community project for VIT Chennai.
            Not an official VIT administrative service.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem' }}>
            <span>Cars Only Policy</span>
            <span>&bull;</span>
            <span>Zero Platform Fees</span>
            <span>&bull;</span>
            <span>Direct Cost Share</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
