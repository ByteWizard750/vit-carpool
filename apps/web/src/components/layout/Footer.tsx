import React from 'react';
import { Link } from 'react-router-dom';
import { Car } from 'lucide-react';

interface FooterProps {
  onOpenDevStatus?: () => void;
}

export const Footer: React.FC<FooterProps> = () => {
  return (
    <footer
      className="site-footer"
      style={{
        backgroundColor: '#0f172a',
        color: '#94a3b8',
        borderTop: '1px solid #1e293b',
        paddingTop: '36px',
        // Mobile bottom padding ensures content is never obscured by the fixed BottomNav
        paddingBottom: 'calc(28px + 72px)',
      }}
    >
      <style>{`
        @media (min-width: 768px) {
          .site-footer {
            padding-bottom: 36px !important;
          }
        }
      `}</style>
      <div className="container" style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '32px',
            marginBottom: '28px',
          }}
        >
          {/* Brand Info */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Car size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                VIT Carpool
              </h3>
            </div>
            <p style={{ lineHeight: '1.5', fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 10px' }}>
              Verified campus carpooling for the VIT Chennai student and faculty community.
            </p>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Vandalur-Kelambakkam Road, Chennai 600127
            </div>
          </div>

          {/* Quick Explore */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Explore
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <li>
                <Link to="/rides" style={{ color: '#94a3b8', textDecoration: 'none' }}>Find Rides</Link>
              </li>
              <li>
                <Link to="/offer-ride" style={{ color: '#94a3b8', textDecoration: 'none' }}>Offer a Ride</Link>
              </li>
              <li>
                <Link to="/safety" style={{ color: '#94a3b8', textDecoration: 'none' }}>Community Safety</Link>
              </li>
              <li>
                <Link to="/how-it-works" style={{ color: '#94a3b8', textDecoration: 'none' }}>How It Works</Link>
              </li>
            </ul>
          </div>

          {/* Campus & Legal */}
          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Campus &amp; Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <li>
                <Link to="/terms" style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>Terms &amp; Conditions</Link>
              </li>
              <li>
                <Link to="/privacy" style={{ color: '#94a3b8', textDecoration: 'none', fontWeight: 500 }}>Privacy Policy</Link>
              </li>
              <li>
                <Link to="/safety" style={{ color: '#94a3b8', textDecoration: 'none' }}>Safety &amp; Verification</Link>
              </li>
              <li>
                <a href="mailto:support@vitcarpool.app" style={{ color: '#94a3b8', textDecoration: 'none' }}>Contact Support</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with Disclaimers */}
        <div
          style={{
            paddingTop: '20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.78rem',
            color: '#64748b',
          }}
        >
          <div>
            &copy; {new Date().getFullYear()} VIT Carpool &bull; Independent student project &bull; Not an official VIT administrative service.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
