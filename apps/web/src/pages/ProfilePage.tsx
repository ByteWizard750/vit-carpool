import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap,
  Briefcase,
  LogOut,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Lock,
  Star,
  UserX,
  Loader2,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { VerificationRequestModal } from '../features/modals/VerificationRequestModal';
import { useAuth } from '../features/auth/AuthContext';
import { DriverRatingSummaryDto, BlockResponseDto } from '@vit-carpool/contracts';

export const ProfilePage: React.FC = () => {
  const { user, token, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [driverSummary, setDriverSummary] = useState<DriverRatingSummaryDto | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockResponseDto[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const fetchBlockedUsers = React.useCallback(async () => {
    if (!token) return;
    setLoadingBlocks(true);
    try {
      const res = await fetch('/moderation/blocks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data);
      }
    } catch {
      // silent
    } finally {
      setLoadingBlocks(false);
    }
  }, [token]);

  React.useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const handleUnblock = async (targetUserId: string) => {
    if (!token) return;
    setUnblockingId(targetUserId);
    try {
      const res = await fetch(`/moderation/blocks/${targetUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchBlockedUsers();
      }
    } catch {
      // silent
    } finally {
      setUnblockingId(null);
    }
  };

  React.useEffect(() => {
    if (!token || !user?.id) return;
    fetch(`/ratings/driver/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.totalReviews !== undefined) setDriverSummary(d);
      })
      .catch(() => {});
  }, [token, user?.id]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isFaculty = user?.audience === 'FACULTY';
  const isVerified = user?.verificationStatus === 'VERIFIED';
  const isPending = user?.verificationStatus === 'PENDING';
  const isSuspended = user?.verificationStatus === 'SUSPENDED';

  return (
    <div className="container" style={{ padding: '36px 16px 64px', maxWidth: '680px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Account & Institutional Profile
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
          Manage your verified campus credentials, campus affiliation, and account security.
        </p>
      </div>

      {/* Main Profile Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          overflow: 'hidden',
          marginBottom: '24px',
        }}
      >
        {/* Profile Card Header */}
        <div
          style={{
            padding: '24px 28px',
            background: 'linear-gradient(135deg, var(--color-brand-50) 0%, #ffffff 100%)',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: isFaculty ? '#f3e8ff' : '#dbeafe',
              color: isFaculty ? '#6b21a8' : '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.4rem',
            }}
          >
            {user?.fullName?.charAt(0) || 'U'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {user?.fullName}
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: isFaculty ? '#f3e8ff' : '#dcfce7',
                  color: isFaculty ? '#6b21a8' : '#15803d',
                }}
              >
                {isFaculty ? 'Faculty Member' : 'Student Member'}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {user?.email}
            </div>
          </div>
        </div>

        {/* Profile Fields List */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                CAMPUS AFFILIATION
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {isFaculty ? <Briefcase size={16} style={{ color: '#6b21a8' }} /> : <GraduationCap size={16} style={{ color: '#15803d' }} />}
                <span>{isFaculty ? 'Faculty & Staff' : 'Student Commuter'}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                VERIFICATION STATUS
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
                {isVerified && (
                  <span style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={16} /> Verified Active
                  </span>
                )}
                {isPending && (
                  <span style={{ color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={16} /> Pending Proof Review
                  </span>
                )}
                {isSuspended && (
                  <span style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={16} /> Suspended
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                VERIFICATION METHOD
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {user?.verificationMethod === 'AUTOMATIC_EMAIL'
                  ? 'Automatic Campus Domain'
                  : user?.verificationMethod || 'Institutional Review'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                MEMBER SINCE
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Campus Baseline'}
              </div>
            </div>
          </div>

          {/* Pending verification trigger button */}
          {isPending && (
            <div style={{ marginTop: '8px', padding: '14px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
                Account Pending Institutional Verification
              </div>
              <p style={{ fontSize: '0.8rem', color: '#78350f', margin: '0 0 12px' }}>
                Upload your campus ID card or proof of affiliation to unlock ride publishing and booking.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setVerificationModalOpen(true)}
              >
                Submit ID Verification Proof
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Driver Reputation Section */}
      {driverSummary && driverSummary.totalReviews > 0 && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
          id="driver-rating-card"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Driver Community Reputation
            </h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#fef3c7',
                padding: '4px 10px',
                borderRadius: '8px',
                color: '#b45309',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              <Star size={15} style={{ fill: '#eab308', color: '#eab308' }} />
              <span>{driverSummary.averageRating?.toFixed(1)} / 5.0 ({driverSummary.totalReviews} {driverSummary.totalReviews === 1 ? 'review' : 'reviews'})</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {driverSummary.reviews.slice(0, 5).map((rev) => (
              <div
                key={rev.id}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600 }}>{rev.passengerName}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#b45309', fontWeight: 700 }}>
                    <Star size={12} style={{ fill: '#eab308', color: '#eab308' }} /> {rev.rating}/5
                  </span>
                </div>
                {rev.review && <div style={{ color: 'var(--text-secondary)' }}>"{rev.review}"</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocked Members Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          padding: '24px 28px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <UserX size={18} style={{ color: '#dc2626' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Blocked Members ({blockedUsers.length})
          </h3>
        </div>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
          Blocked members are mutually invisible to you. Neither party will see each other's rides, and messaging between you is locked.
        </p>

        {loadingBlocks ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <Loader2 size={16} className="animate-spin" /> Loading blocked members...
          </div>
        ) : blockedUsers.length === 0 ? (
          <div
            style={{
              padding: '16px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            You have not blocked any members.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {blockedUsers.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {b.blockedUser?.fullName || 'Member'}
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                    Blocked on {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(b.createdAt))}
                    {b.reason && ` • Reason: ${b.reason}`}
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnblock(b.blockedId)}
                  disabled={unblockingId === b.blockedId}
                >
                  {unblockingId === b.blockedId ? <Loader2 size={14} className="animate-spin" /> : 'Unblock'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Safety & Trust Invariants Card */}
      <div
        style={{
          padding: '20px 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          <Lock size={16} style={{ color: '#2563eb' }} /> Institutional Privacy Charter
        </div>
        <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Your phone number and specific pickup coordinates are never visible publicly on ride search results.
          They are revealed exclusively to confirmed passengers and drivers on scheduled trips.
        </p>
      </div>

      {/* Logout Action Card */}
      <div
        style={{
          padding: '20px 24px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid var(--border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
            Sign Out of Account
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Ends your current session on this device.
          </div>
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={handleLogout}
          leftIcon={<LogOut size={16} style={{ color: '#dc2626' }} />}
          id="btn-profile-logout"
        >
          <span style={{ color: '#dc2626' }}>Sign Out</span>
        </Button>
      </div>

      {/* Verification proof upload modal */}
      <VerificationRequestModal
        isOpen={verificationModalOpen}
        onClose={() => {
          setVerificationModalOpen(false);
          refreshProfile();
        }}
      />
    </div>
  );
};
