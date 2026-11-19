import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Star,
  CheckCircle2,
  Car,
  Users,
  Calendar,
  MessageSquare,
  Shield,
  Loader2,
  AlertCircle,
  Flag,
} from 'lucide-react';
import { Button } from '../common/Button';
import { PublicUserProfileDto } from '@vit-carpool/contracts';

interface PublicProfileModalProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onReportUser?: (userId: string, userName: string) => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({
  userId,
  isOpen,
  onClose,
  token,
  onReportUser,
}) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicUserProfileDto | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId || !token) {
      setProfile(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/users/public/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('User profile is private or not accessible in your community.');
          }
          throw new Error('Failed to load user profile.');
        }
        return res.json();
      })
      .then((data: PublicUserProfileDto) => {
        if (isMounted) {
          setProfile(data);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Unable to display profile.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId, token]);

  if (!isOpen) return null;

  const isFaculty = profile?.audience === 'FACULTY';
  const isVerified = profile?.verificationStatus === 'VERIFIED';
  const memberDate = profile?.memberSince
    ? new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(
        new Date(profile.memberSince),
      )
    : 'Recent Member';

  const handleStartMessage = () => {
    onClose();
    if (userId) {
      navigate(`/messages?recipientId=${userId}`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'profile-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes profile-pop {
            from { opacity: 0; transform: scale(0.96) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>

        {/* Modal Header Bar */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} style={{ color: '#2563eb' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
              Campus Member Profile
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div
            style={{
              padding: '48px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              color: '#64748b',
            }}
          >
            <Loader2 size={32} className="animate-spin" style={{ color: '#2563eb' }} />
            <span style={{ fontSize: '0.9rem' }}>Loading verified campus profile...</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div
            style={{
              padding: '36px 24px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertCircle size={24} />
            </div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }}>
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Dismiss
            </Button>
          </div>
        )}

        {/* Profile Content */}
        {!loading && !error && profile && (
          <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Identity Block */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '68px',
                  height: '68px',
                  borderRadius: '50%',
                  backgroundColor: isFaculty ? '#f3e8ff' : '#dbeafe',
                  color: isFaculty ? '#6b21a8' : '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.6rem',
                  overflow: 'hidden',
                  border: '3px solid #ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  flexShrink: 0,
                }}
              >
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.fullName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  profile.fullName.charAt(0).toUpperCase()
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {profile.fullName}
                  </h2>
                  {isVerified && (
                    <span
                      title="Verified Campus Member"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: '#059669',
                      }}
                    >
                      <CheckCircle2 size={18} />
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: isFaculty ? '#f3e8ff' : '#eff6ff',
                      color: isFaculty ? '#7e22ce' : '#1d4ed8',
                      border: `1px solid ${isFaculty ? '#e9d5ff' : '#dbeafe'}`,
                    }}
                  >
                    {isFaculty ? 'VIT Faculty' : 'VIT Student'}
                  </span>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Calendar size={12} /> Joined {memberDate}
                  </span>
                </div>
              </div>
            </div>

            {/* Rating Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: '#fef08a',
                    color: '#854d0e',
                    padding: '3px 8px',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                  }}
                >
                  <Star size={14} style={{ fill: '#eab308', color: '#ca8a04' }} />
                  <span>
                    {profile.driverRating.averageRating !== null
                      ? profile.driverRating.averageRating.toFixed(1)
                      : 'New'}
                  </span>
                </div>
                <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                  Driver Rating
                </span>
              </div>

              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {profile.driverRating.totalReviews > 0
                  ? `${profile.driverRating.totalReviews} verified review${
                      profile.driverRating.totalReviews > 1 ? 's' : ''
                    }`
                  : 'No reviews yet'}
              </span>
            </div>

            {/* Activity Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Car size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    {profile.stats.ridesOffered}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                    Rides Offered
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    backgroundColor: '#ecfdf5',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    {profile.stats.ridesCompleted}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
                    Trips Taken
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy Guarantee Notice */}
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#f1f5f9',
                borderRadius: '10px',
                fontSize: '0.775rem',
                color: '#475569',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Shield size={14} style={{ color: '#64748b', flexShrink: 0 }} />
              <span>
                Personal contact details (email and mobile number) are private and never shared
                publicly.
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <Button
                variant="primary"
                size="md"
                style={{ flex: 1 }}
                onClick={handleStartMessage}
                leftIcon={<MessageSquare size={16} />}
              >
                Send Message
              </Button>

              {onReportUser && (
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => {
                    onClose();
                    onReportUser(profile.id, profile.fullName);
                  }}
                  leftIcon={<Flag size={15} style={{ color: '#dc2626' }} />}
                  title="Report Member for Safety Review"
                >
                  <span style={{ color: '#dc2626' }}>Report</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
