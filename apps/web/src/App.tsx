import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHealthStatus } from './services/api';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LandingPage } from './features/landing/LandingPage';
import { AuthModal } from './features/modals/AuthModal';
import { SearchResultsModal } from './features/modals/SearchResultsModal';
import { OfferRideModal } from './features/modals/OfferRideModal';
import { DevDiagnosticsDrawer } from './components/dev/DevDiagnosticsDrawer';
import { Terminal } from 'lucide-react';
import { getLocalTodayDate } from './utils/date';

export const App: React.FC = () => {
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
  const [searchModalOpen, setSearchModalOpen] = useState(false);
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
      {/* Primary Navigation Bar */}
      <Navbar
        onOpenSearch={() => {
          const searchEl = document.getElementById('search');
          searchEl?.scrollIntoView({ behavior: 'smooth' });
        }}
        onOpenOffer={() => setOfferModalOpen(true)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Main Product Landing Experience */}
      <LandingPage
        onSearch={handleSearchSubmit}
        onOfferRide={() => setOfferModalOpen(true)}
        onSelectRoute={handleSelectRoute}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      {/* Primary Footer */}
      <Footer onOpenDevStatus={() => setDevDrawerOpen(true)} />

      {/* Modal Dialogs */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      <SearchResultsModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        searchParams={searchParams}
        onOfferRide={() => setOfferModalOpen(true)}
      />

      <OfferRideModal
        isOpen={offerModalOpen}
        onClose={() => setOfferModalOpen(false)}
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
