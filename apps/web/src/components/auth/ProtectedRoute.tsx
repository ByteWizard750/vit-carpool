import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { ShieldAlert, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '../common/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireVerified?: boolean;
  requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireVerified = false,
  requireAdmin = false,
}) => {
  const { user, token, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            border: '3px solid var(--border-light)',
            borderTopColor: 'var(--color-brand-600)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Restoring campus session...
        </span>
      </div>
    );
  }

  // Not signed in: redirect to /auth preserving destination
  if (!token) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Requires admin role
  if (requireAdmin && user?.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  // Account suspended by administration
  if (user?.verificationStatus === 'SUSPENDED' || (user as any)?.isSuspended) {
    return (
      <div className="container" style={{ padding: '60px 16px', maxWidth: '640px' }}>
        <div
          style={{
            padding: '36px 28px',
            backgroundColor: '#fee2e2',
            borderRadius: '16px',
            border: '1px solid #fecaca',
            textAlign: 'center',
          }}
          id="gate-account-suspended"
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fecaca',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#dc2626',
            }}
          >
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ color: '#991b1b', fontSize: '1.5rem', marginBottom: '8px' }}>
            Account Suspended
          </h2>
          <p style={{ color: '#7f1d1d', marginBottom: '24px', fontSize: '0.95rem', lineHeight: '1.6' }}>
            Your account has been suspended by campus moderators due to a policy or trust charter violation.
            Carpool participation, publishing rides, and booking seats are locked.
          </p>
          <Link to="/profile">
            <Button variant="outline" size="md">
              View Profile Status
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Feature requires verified institutional member, but account is pending
  if (requireVerified && user && user.verificationStatus !== 'VERIFIED') {
    return (
      <div className="container" style={{ padding: '60px 16px', maxWidth: '640px' }}>
        <div
          style={{
            padding: '36px 28px',
            backgroundColor: '#fef3c7',
            borderRadius: '16px',
            border: '1px solid #fde68a',
            textAlign: 'center',
          }}
          id="gate-verification-required"
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#d97706',
            }}
          >
            <ShieldAlert size={32} />
          </div>
          <h2 style={{ color: '#92400e', fontSize: '1.5rem', marginBottom: '8px' }}>
            Institutional Verification Required
          </h2>
          <p style={{ color: '#78350f', marginBottom: '24px', fontSize: '0.95rem', lineHeight: '1.6' }}>
            This feature is reserved for verified VIT Chennai community members.
            Complete your institutional verification to unlock ride publishing, vehicle management, and seat bookings.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <Link to="/profile">
              <Button variant="primary" size="md" rightIcon={<ArrowRight size={16} />}>
                Go to Profile & Verification
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
