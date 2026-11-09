import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  Home,
  Camera,
  Upload,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Only JPEG, PNG, or WebP images are allowed.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image file size must be less than 5MB.');
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);
    setAvatarSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/users/me/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        setAvatarSuccess('Profile photo updated successfully!');
        await refreshProfile();
        setTimeout(() => setAvatarSuccess(null), 3000);
      } else {
        const body = await res.json().catch(() => ({}));
        setAvatarError(body.message || 'Failed to upload profile photo.');
      }
    } catch {
      setAvatarError('Network error uploading profile photo.');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!token) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const res = await fetch('/api/users/me/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAvatarSuccess('Profile photo removed.');
        await refreshProfile();
        setTimeout(() => setAvatarSuccess(null), 3000);
      }
    } catch {
      setAvatarError('Network error removing photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const fetchBlockedUsers = React.useCallback(async () => {
    if (!token) return;
    setLoadingBlocks(true);
    try {
      const res = await fetch('/api/moderation/blocks', {
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
      const res = await fetch(`/api/moderation/blocks/${targetUserId}`, {
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
    fetch(`/api/ratings/driver/${user.id}`, {
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
    <PageShell width="narrow">
      <PageHeader
        title="Profile"
        description="Manage your campus affiliation, verification credentials, reputation, and privacy settings."
        action={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link to="/dashboard" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm" leftIcon={<Home size={14} />}>
                Dashboard
              </Button>
            </Link>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="sm" leftIcon={<Home size={14} />}>
                Home
              </Button>
            </Link>
          </div>
        }
      />

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
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            {/* Avatar with Camera badge */}
            <div style={{ position: 'relative' }}>
              <div
                id="profile-avatar-display"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: isFaculty ? '#f3e8ff' : '#dbeafe',
                  color: isFaculty ? '#6b21a8' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.5rem',
                  overflow: 'hidden',
                  border: '3px solid #ffffff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                }}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  user?.fullName?.charAt(0) || 'U'
                )}
              </div>
              <button
                type="button"
                id="btn-upload-avatar-badge"
                title="Upload Profile Picture"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: '2px solid white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }}
              >
                {avatarUploading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Camera size={13} />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                id="input-avatar-file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
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

          {/* Avatar Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              id="btn-change-avatar"
              leftIcon={<Upload size={14} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
            >
              {user?.avatarUrl ? 'Change Photo' : 'Upload Photo'}
            </Button>
            {user?.avatarUrl && (
              <Button
                variant="ghost"
                size="sm"
                id="btn-remove-avatar"
                leftIcon={<Trash2 size={14} style={{ color: '#ef4444' }} />}
                onClick={handleRemoveAvatar}
                disabled={avatarUploading}
              >
                <span style={{ color: '#ef4444' }}>Remove</span>
              </Button>
            )}
          </div>
        </div>

        {/* Avatar Status Banners */}
        {avatarSuccess && (
          <div
            id="avatar-success-banner"
            style={{
              padding: '10px 24px',
              backgroundColor: '#ecfdf5',
              borderBottom: '1px solid #a7f3d0',
              color: '#065f46',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{avatarSuccess}</span>
          </div>
        )}
        {avatarError && (
          <div
            id="avatar-error-banner"
            style={{
              padding: '10px 24px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              color: '#991b1b',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{avatarError}</span>
          </div>
        )}

        {/* Profile Fields List */}
        <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="responsive-two-col" style={{ gap: '16px' }}>
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

          <div className="responsive-two-col" style={{ gap: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-light)' }}>
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
    </PageShell>
  );
};
