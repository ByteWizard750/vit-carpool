import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  Calendar,
  Ticket,
  ShieldCheck,
  Search,
  PlusCircle,
  RefreshCw,
  Bell,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { RouteSpine } from '../components/common/RouteSpine';
import { useAuth } from '../features/auth/AuthContext';
import {
  PassengerBookingResponseDto,
  DriverRideResponseDto,
  VehicleResponseDto,
} from '@vit-carpool/contracts';

export const DashboardPage: React.FC = () => {
  const { user, token } = useAuth();

  const [bookings, setBookings] = useState<PassengerBookingResponseDto[]>([]);
  const [rides, setRides] = useState<DriverRideResponseDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleResponseDto[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [bookingsRes, ridesRes, vehiclesRes, notifsRes, alertsRes] = await Promise.all([
          fetch('/bookings/mine', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch('/rides/mine', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch('/vehicles', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch('/notifications/unread-count', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }).then((r) => (r.ok ? r.json() : { unreadCount: 0 })),
          fetch('/ride-alerts', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          }).then((r) => (r.ok ? r.json() : [])),
        ]);

        setBookings(Array.isArray(bookingsRes) ? bookingsRes : (bookingsRes?.bookings || []));
        setRides(Array.isArray(ridesRes) ? ridesRes : []);
        setVehicles(Array.isArray(vehiclesRes) ? vehiclesRes : []);
        setUnreadNotifCount(typeof notifsRes?.unreadCount === 'number' ? notifsRes.unreadCount : 0);
        setAlertsCount(Array.isArray(alertsRes) ? alertsRes.length : 0);
      } catch (err) {
        console.warn('Dashboard data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [token]);

  const activeBookings = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'PENDING');
  const activeRides = rides.filter((r) => r.status === 'SCHEDULED');

  return (
    <div className="container" style={{ padding: '36px 16px 64px' }}>
      {/* Welcome & Profile Header */}
      <div
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
          borderRadius: '16px',
          border: '1px solid #bfdbfe',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: user?.audience === 'FACULTY' ? '#f3e8ff' : '#dcfce7',
                  color: user?.audience === 'FACULTY' ? '#6b21a8' : '#15803d',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <ShieldCheck size={13} />
                {user?.audience === 'FACULTY' ? 'Faculty Verified' : 'Student Verified'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                VIT Chennai Campus
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', color: 'var(--text-primary)', margin: 0 }}>
              Welcome back, {user?.fullName}!
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Signed in as <strong>{user?.email}</strong> &bull; {user?.audience === 'FACULTY' ? 'Faculty Circle' : 'Student Circle'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <Link to="/rides">
              <Button variant="primary" size="md" leftIcon={<Search size={16} />}>
                Find Rides
              </Button>
            </Link>
            <Link to="/offer-ride">
              <Button variant="outline" size="md" leftIcon={<PlusCircle size={16} />}>
                Offer a Ride
              </Button>
            </Link>
            <Link to="/recurring-commutes">
              <Button variant="outline" size="md" leftIcon={<RefreshCw size={16} />}>
                Recurring Commutes
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(191, 219, 254, 0.6)',
          }}
        >
          <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Active Bookings</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>
              {activeBookings.length}
            </div>
          </div>
          <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Published Rides</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>
              {activeRides.length}
            </div>
          </div>
          <Link to="/notifications" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: unreadNotifCount > 0 ? '1.5px solid #f87171' : '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Unread Alerts</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: unreadNotifCount > 0 ? '#ef4444' : '#64748b', marginTop: '2px' }}>
                {unreadNotifCount}
              </div>
            </div>
          </Link>
          <Link to="/ride-alerts" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Saved Alerts</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed', marginTop: '2px' }}>
                {alertsCount}
              </div>
            </div>
          </Link>
          <Link to="/vehicles" style={{ textDecoration: 'none' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>My Vehicles</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#7c3aed', marginTop: '2px' }}>
                {vehicles.length}
              </div>
            </div>
          </Link>
          <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Campus Audience</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {user?.audience || 'COMMUNITY'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Activity & Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Card 1: Upcoming Bookings as Passenger */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Ticket size={20} style={{ color: '#2563eb' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>My Passenger Bookings</h2>
            </div>
            <Link to="/bookings?tab=passenger" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#2563eb' }}>
              View All &rarr;
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading bookings...
            </div>
          ) : activeBookings.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.875rem' }}>You have no active ride bookings.</p>
              <Link to="/rides">
                <Button variant="outline" size="sm" leftIcon={<Search size={14} />}>
                  Explore Corridors
                </Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeBookings.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-page)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: b.status === 'CONFIRMED' ? '#dcfce7' : '#fef3c7',
                        color: b.status === 'CONFIRMED' ? '#166534' : '#92400e',
                      }}
                    >
                      {b.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {b.requestedSeats} Seat{b.requestedSeats > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <RouteSpine
                      origin={b.ride.origin}
                      destination={b.ride.destination}
                      departureTime={new Date(b.ride.departureTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      variant="compact"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Upcoming Rides as Driver */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid var(--border-light)',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} style={{ color: '#16a34a' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Rides You Are Driving</h2>
            </div>
            <Link to="/my-rides" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#16a34a' }}>
              Manage &rarr;
            </Link>
          </div>

          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading driver rides...
            </div>
          ) : activeRides.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.875rem' }}>You have not published any upcoming rides.</p>
              <Link to="/offer-ride">
                <Button variant="outline" size="sm" leftIcon={<PlusCircle size={14} />}>
                  Publish a Campus Ride
                </Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeRides.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-page)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                      }}
                    >
                      {r.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {r.availableSeats} of {r.totalSeats} seats open &bull; ₹{r.costPerSeat}/seat
                    </span>
                  </div>
                  <div style={{ marginTop: '6px' }}>
                    <RouteSpine
                      origin={r.origin}
                      destination={r.destination}
                      departureTime={new Date(r.departureTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      variant="compact"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation Cards Grid */}
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Platform Quick Links</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <Link to="/rides" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <Search size={24} style={{ color: '#2563eb', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Find Rides</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Search Chennai transit corridors & book verified seats</div>
            </div>
          </Link>

          <Link to="/offer-ride" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <PlusCircle size={24} style={{ color: '#16a34a', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Offer a Ride</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Publish your commute and share fuel costs with peers</div>
            </div>
          </Link>

          <Link to="/bookings" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <Ticket size={24} style={{ color: '#d97706', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Bookings & Requests</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Track passenger tickets and approve driver requests</div>
            </div>
          </Link>

          <Link to="/vehicles" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <Car size={24} style={{ color: '#7c3aed', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>My Vehicles</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Register cars and maintain driver vehicle fleet</div>
            </div>
          </Link>

          <Link to="/ride-alerts" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <Sparkles size={24} style={{ color: '#7c3aed', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Ride Alerts</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Save corridor preferences and get notified of new rides</div>
            </div>
          </Link>

          <Link to="/notifications" style={{ textDecoration: 'none' }}>
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
              }}
              className="dashboard-nav-card"
            >
              <Bell size={24} style={{ color: '#2563eb', marginBottom: '8px' }} />
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Notifications</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Check matching ride alerts and booking updates</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};
