import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchHealthStatus } from '../../services/api';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { DevDiagnosticsDrawer } from '../dev/DevDiagnosticsDrawer';
import { VerificationRequestModal } from '../../features/modals/VerificationRequestModal';
import { useAuth } from '../../features/auth/AuthContext';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const isMessagesPage = location.pathname.startsWith('/messages');
  const [devDrawerOpen, setDevDrawerOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealthStatus,
    refetchInterval: 15000,
    retry: 2,
  });

  useEffect(() => {
    if (window.location.hash === '#diagnostics') {
      setDevDrawerOpen(true);
    }
  }, []);

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

      <Navbar onOpenVerification={() => setVerificationModalOpen(true)} />

      <main className="app-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
        <Outlet />
      </main>

      {!isMessagesPage && <Footer onOpenDevStatus={() => setDevDrawerOpen(true)} />}

      <DevDiagnosticsDrawer
        isOpen={devDrawerOpen}
        onClose={() => setDevDrawerOpen(false)}
        data={data}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRefresh={() => refetch()}
      />

      <VerificationRequestModal
        isOpen={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
      />

      <BottomNav />
    </div>
  );
};
