import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHealthStatus } from './services/api';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './features/landing/LandingPage';
import { AuthModal } from './features/modals/AuthModal';
import { SearchResultsModal } from './features/modals/SearchResultsModal';
import { OfferRideModal } from './features/modals/OfferRideModal';
import { VerificationRequestModal } from './features/modals/VerificationRequestModal';
import { VehicleManagementModal } from './features/vehicles/VehicleManagementModal';
import { BookingsModal } from './features/modals/BookingsModal';
import { DevDiagnosticsDrawer } from './components/dev/DevDiagnosticsDrawer';
import { useAuth } from './features/auth/AuthContext';
import { Terminal, ShieldAlert, AlertTriangle } from 'lucide-react';
import { getLocalTodayDate } from './utils/date';

export const App: React.FC = () => {
  const { user } = useAuth();

  // Query backend health to preserve infrastructure integration
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealthStatus,
    refetchInterval: 10000,
    retry: 2,
  });

  // Modal States
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerModalTab, setOfferModalTab] = useState<'PUBLISH' | 'MY_RIDES'>('PUBLISH');
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [vehiclesModalOpen, setVehiclesModalOpen] = useState(false);
  const [bookingsModalOpen, setBookingsModalOpen] = useState(false);
  const [bookingsModalTab, setBookingsModalTab] = useState<'PASSENGER' | 'DRIVER'>('PASSENGER');
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);


  // Search parameters for modal preview
  const [searchParams, setSearchParams] = useState<{
    origin: string;
    destination: string;
    date: string;
    seats: number;
  } | null>(null);

  // Check URL hash for direct dev access
  useEffect(() => {
    if (window.location.hash === '#diagnostics') {
      setDevDrawerOpen(true);
    }
  }, []);

  const handleSearchSubmit = (params: {
    origin: string;
    destination: string;
    date: string;
    seats: number;
  }) => {
    setSearchParams(params);
    setSearchModalOpen(true);
  };

  const handleSelectRoute = (origin: string, destination: string) => {
    const today = getLocalTodayDate();
    setSearchParams({ origin, destination, date: today, seats: 1 });
    setSearchModalOpen(true);
  };

  const isHealthy = !isError && data?.status === 'ok';

  return (
    <div className="app-wrapper">
      {/* Account Verification Status Alert Banner */}
      {user && user.verificationStatus === 'PENDING' && (
        <div
          style={{
            backgroundColor: '#fef3c7',
            borderBottom: '1px solid #fde68a',
            color: '#92400e',
            padding: '10px 16px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
          id="banner-pending-verification"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldAlert size={16} />
            <span>
              <strong>Account Pending Verification:</strong> Complete campus affiliation verification to unlock ride publishing and seat requests.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setVerificationModalOpen(true)}
            style={{
              padding: '4px 10px',
              backgroundColor: '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Submit Proof
          </button>
        </div>
      )}

      {user && user.verificationStatus === 'SUSPENDED' && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            borderBottom: '1px solid #fecaca',
            color: '#991b1b',
            padding: '10px 16px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          id="banner-account-suspended"
        >
          <AlertTriangle size={16} />
          <span>
            <strong>Account Suspended:</strong> This account has been suspended by campus moderators. Carpooling participation is disabled.
          </span>
        </div>
      )}

      {/* Primary Navigation Bar */}
      <Navbar
        onOpenSearch={() => {
          const searchEl = document.getElementById('search');
          searchEl?.scrollIntoView({ behavior: 'smooth' });
        }}
        onOpenOffer={() => {
          setOfferModalTab('PUBLISH');
          setOfferModalOpen(true);
        }}
        onOpenMyRides={() => {
          setOfferModalTab('MY_RIDES');
          setOfferModalOpen(true);
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenVerification={() => setVerificationModalOpen(true)}
        onOpenVehicles={() => setVehiclesModalOpen(true)}
        onOpenBookings={() => {
          setBookingsModalTab('PASSENGER');
          setBookingsModalOpen(true);
        }}
      />

      {/* Main Product Landing Experience */}
      <LandingPage
        onSearch={handleSearchSubmit}
        onOfferRide={() => {
          setOfferModalTab('PUBLISH');
          setOfferModalOpen(true);
        }}
        onSelectRoute={handleSelectRoute}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Primary Footer */}
      <Footer onOpenDevStatus={() => setDevDrawerOpen(true)} />

      {/* Modal Dialogs */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <VerificationRequestModal
        isOpen={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />

      <VehicleManagementModal
        isOpen={vehiclesModalOpen}
        onClose={() => setVehiclesModalOpen(false)}
        onOpenVerification={() => setVerificationModalOpen(true)}
      />

      <SearchResultsModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchParams={searchParams}
        onOfferRide={() => {
          setOfferModalTab('PUBLISH');
          setOfferModalOpen(true);
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenVerification={() => setVerificationModalOpen(true)}
        onOpenBookings={() => {
          setBookingsModalTab('PASSENGER');
          setBookingsModalOpen(true);
        }}
      />

      <OfferRideModal
        isOpen={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
        initialTab={offerModalTab}
        onOpenVehicles={() => {
          setOfferModalOpen(false);
          setVehiclesModalOpen(true);
        }}
        onOpenVerification={() => {
          setOfferModalOpen(false);
          setVerificationModalOpen(true);
        }}
        onOpenAuth={() => {
          setOfferModalOpen(false);
          setAuthModalOpen(true);
        }}
      />

      <BookingsModal
        isOpen={bookingsModalOpen}
        onClose={() => setBookingsModalOpen(false)}
        initialTab={bookingsModalTab}
        onFindRides={() => {
          setBookingsModalOpen(false);
          const searchEl = document.getElementById('search');
          searchEl?.scrollIntoView({ behavior: 'smooth' });
        }}
        onOpenOffer={() => {
          setBookingsModalOpen(false);
          setOfferModalTab('PUBLISH');
          setOfferModalOpen(true);
        }}
      />


      {/* Developer Diagnostics Drawer */}
      <DevDiagnosticsDrawer
        isOpen={devDrawerOpen}
        onClose={() => setDevDrawerOpen(false)}
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRefresh={() => refetch()}
      />

      {/* Floating Developer Status Pill (Only visible in development mode) */}
      {import.meta.env.DEV && (
        <button
          type="button"
          className="dev-floating-pill"
          onClick={() => setDevDrawerOpen(true)}
          title="Open Developer Diagnostics Drawer (Dev Mode Only)"
          id="dev-status-pill"
        >
          <span
            className={`dev-live-dot ${
              isLoading ? 'loading' : isHealthy ? '' : 'down'
            }`}
          />
          <Terminal size={12} />
          <span>
            Dev Status: {isLoading ? 'Checking...' : isHealthy ? `API OK (${data?.database.latencyMs ?? 3}ms)` : 'API Down'}
          </span>
        </button>
      )}
    </div>
  );
};
