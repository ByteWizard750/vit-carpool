import React, { useState } from 'react';
import { Search, UserCheck, Fuel, PlusCircle, CheckCircle, Car } from 'lucide-react';

export const HowItWorksSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver'>('passenger');

  return (
    <section className="section-padding" id="how-it-works" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="container">
        <div className="section-header">
          <span className="section-tag">Planned Platform Workflow</span>
          <h2 className="section-title">How Campus Carpooling Works</h2>
          <p className="section-subtitle">
            The intended workflow for VIT Chennai carpooling: verified peer travel, driver discretion,
            and non-commercial fuel cost sharing with zero platform fees.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="steps-tabs-wrap">
          <div className="steps-tabs-nav" role="tablist" aria-label="Carpool Role">
            <button
              type="button"
              className={`steps-tab-btn ${activeTab === 'passenger' ? 'active' : ''}`}
              onClick={() => setActiveTab('passenger')}
              role="tab"
              aria-selected={activeTab === 'passenger'}
              id="tab-passenger"
            >
              For Passengers
            </button>
            <button
              type="button"
              className={`steps-tab-btn ${activeTab === 'driver' ? 'active' : ''}`}
              onClick={() => setActiveTab('driver')}
              role="tab"
              aria-selected={activeTab === 'driver'}
              id="tab-driver"
            >
              For Car Owners (Drivers)
            </button>
          </div>
        </div>

        {/* Steps Grid */}
        {activeTab === 'passenger' ? (
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num-badge">1</div>
              <h3 className="step-title">Find Your Corridor</h3>
              <p className="step-desc">
                Enter your departure area in Chennai, campus destination, and travel date.
                When launched, you will browse routes published exclusively by verified peers in your circle.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <Search size={16} />
                <span>Search by transit corridors & arrival times</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-num-badge">2</div>
              <h3 className="step-title">Request a Seat</h3>
              <p className="step-desc">
                Select an itinerary that matches your schedule and send a seat request. The car owner reviews your
                verified profile before accepting the booking.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <UserCheck size={16} />
                <span>Driver approval required for every seat</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-num-badge">3</div>
              <h3 className="step-title">Ride & Settle Fuel</h3>
              <p className="step-desc">
                Meet at the agreed pickup point on time. Enjoy a direct highway commute and settle the agreed
                fuel/toll cost share directly with the driver via UPI or cash.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <Fuel size={16} />
                <span>Direct peer cost sharing with zero commission</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num-badge">1</div>
              <h3 className="step-title">Publish Your Route</h3>
              <p className="step-desc">
                Driving to VIT Chennai? Specify your car model, start point, campus arrival time, available seats
                (max 4), and suggested per-seat fuel contribution.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <PlusCircle size={16} />
                <span>Publishing workflow launches in Milestone 4</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-num-badge">2</div>
              <h3 className="step-title">Review & Accept Requests</h3>
              <p className="step-desc">
                Receive seat requests strictly from verified community members in your audience. You retain 100% control over
                who travels in your car with one-click acceptance or decline.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--color-brand-600)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <CheckCircle size={16} />
                <span>Full driver discretion on seat approvals</span>
              </div>
            </div>

            <div className="step-card">
              <div className="step-num-badge">3</div>
              <h3 className="step-title">Defray Commute Costs</h3>
              <p className="step-desc">
                Defray regular fuel and toll expenses while travelling with familiar classmates or colleagues.
                Receive direct fuel contributions without any platform deductions.
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '8px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                <Car size={16} />
                <span>Non-commercial cost sharing for campus commuters</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
