import React from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { HowItWorksSection } from '../features/how-it-works/HowItWorksSection';
import { PopularRoutesGrid } from '../features/search/PopularRoutesGrid';

export const HowItWorksPage: React.FC = () => {
  return (
    <div>
      {/* Header Banner */}
      <section style={{ padding: '60px 16px 48px', backgroundColor: 'var(--color-brand-50)', textAlign: 'center', borderBottom: '1px solid var(--color-brand-100)' }}>
        <div className="container" style={{ maxWidth: '720px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '9999px',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginBottom: '14px',
            }}
          >
            <ShieldCheck size={14} /> Community Commuter Guide
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            How Campus Carpooling Works
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 auto 24px' }}>
            A transparent, non-commercial peer carpooling network connecting the VIT Chennai campus on Vandalur-Kelambakkam Road with transit corridors across the greater Chennai metropolitan region.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/rides">
              <Button variant="primary" size="lg" leftIcon={<Search size={18} />}>
                Find Active Rides
              </Button>
            </Link>
            <Link to="/offer-ride">
              <Button variant="outline" size="lg" leftIcon={<Car size={18} />}>
                Offer a Ride
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Interactive Tabbed Workflow Section */}
      <div style={{ padding: '48px 0' }}>
        <HowItWorksSection />
      </div>

      {/* Campus Transit Corridors Grid */}
      <div style={{ padding: '24px 0 60px' }}>
        <PopularRoutesGrid onSelectRoute={(origin, destination) => {
          window.location.href = `/rides?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
        }} />
      </div>

      {/* Fuel Cost Sharing Rules */}
      <section style={{ padding: '60px 16px', backgroundColor: '#ffffff', borderTop: '1px solid var(--border-light)' }}>
        <div className="container" style={{ maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>
            Non-Commercial Cost Sharing Standards
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '36px', fontSize: '0.95rem' }}>
            VIT Carpool operates strictly on non-commercial peer principles to protect campus safety and avoid commercial licensing issues.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '20px', backgroundColor: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Zero Platform Fees
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                The platform takes 0% commission. Fuel contributions go directly from passenger to driver.
              </div>
            </div>

            <div style={{ padding: '20px', backgroundColor: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                ₹250 Hard Seat Cap
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Drivers cannot charge more than ₹250 per seat, ensuring contributions only offset fuel and toll costs.
              </div>
            </div>

            <div style={{ padding: '20px', backgroundColor: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                Cars Only Standard
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                All carpools use personal 4-wheel passenger cars. Two-wheelers and commercial taxis are prohibited.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
