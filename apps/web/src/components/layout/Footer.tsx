import React from 'react';
import { Link } from 'react-router-dom';
import { Car, Terminal, ExternalLink } from 'lucide-react';

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  backgroundColor: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <Car size={16} />
              </div>
              <h3 className="footer-brand-title" style={{ margin: 0, fontSize: '1.1rem' }}>VIT Carpool</h3>
            </div>
            <p style={{ maxWidth: '360px', lineHeight: '1.5', fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 10px' }}>
              Verified campus carpooling for the VIT Chennai student and faculty community.
            </p>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Vandalur-Kelambakkam Road, Chennai 600127
            </div>
          </div>

          {/* Quick Explore */}
          <div>
            <h4 className="footer-col-title">Explore</h4>
            <ul className="footer-links-list">
              <li>
                <Link to="/rides">Find Rides</Link>
              </li>
              <li>
                <Link to="/offer-ride">Offer a Ride</Link>
              </li>
              <li>
                <Link to="/safety">Cohort Separation</Link>
              </li>
              <li>
                <Link to="/how-it-works">How It Works</Link>
              </li>
            </ul>
          </div>

          {/* Platform & Resources */}
          <div>
            <h4 className="footer-col-title">Resources</h4>
            <ul className="footer-links-list">
              <li>
                <a
                  href="https://github.com/ByteWizard750/vit-carpool"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <span>Architecture Docs</span>
                  <ExternalLink size={12} />
                </a>
              </li>
              {import.meta.env.DEV && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenDevStatus}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      color: '#60a5fa',
                      fontSize: '0.825rem',
                    }}
                    id="footer-dev-diagnostics-btn"
                  >
                    <Terminal size={13} />
                    <span>Dev Diagnostics</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Disclaimers */}
        <div className="footer-bottom-bar" style={{ paddingTop: '16px', borderTop: '1px solid #1e293b' }}>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>
            &copy; {new Date().getFullYear()} VIT Carpool &bull; Independent student project &bull; Not an official VIT administrative service.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: '#64748b' }}>
            <span>Cars Only Policy</span>
            <span>&bull;</span>
            <span>Zero Fees</span>
            <span>&bull;</span>
            <span>Direct Cost Share</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
