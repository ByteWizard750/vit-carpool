import React, { useState, useEffect } from 'react';
import { Bell, Check, X, Shield, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';
import { activateWebPush } from '../../features/notifications/webPush';

const DISMISS_STORAGE_KEY = 'vit_push_prompt_dismissed_until';
const DISMISS_DAYS = 5;

export const NotificationPromptModal: React.FC = () => {
  const { user, token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [deniedGuidance, setDeniedGuidance] = useState(false);

  useEffect(() => {
    // Only prompt authenticated users
    if (!user || !token) return;

    // Check browser support
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    // Only prompt if permission is currently default (not already granted or denied)
    if (Notification.permission !== 'default') {
      return;
    }

    // Check if dismissed recently
    const dismissedUntil = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedUntil && parseInt(dismissedUntil, 10) > Date.now()) {
      return;
    }

    // Gentle 2.5-second delay so user is not bombarded immediately on page load
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [user, token]);

  const handleDismiss = () => {
    const expireTime = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_STORAGE_KEY, String(expireTime));
    setIsOpen(false);
  };

  const handleEnablePush = async () => {
    if (!token) return;
    setLoading(true);
    setDeniedGuidance(false);

    try {
      const res = await activateWebPush(token);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
        }, 1400);
      } else {
        if (res.reason === 'denied' || Notification.permission === 'denied') {
          setDeniedGuidance(true);
        } else {
          // General failure or unsupported
          handleDismiss();
        }
      }
    } catch {
      handleDismiss();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modal-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes modal-fade-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* Top Header Badge */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            padding: '28px 24px 20px',
            color: '#ffffff',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
            }}
            title="Dismiss"
          >
            <X size={16} />
          </button>

          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.1)',
            }}
          >
            <Bell size={28} style={{ color: '#ffffff' }} />
          </div>

          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            Turn On Ride Alerts
          </h3>
          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#dbeafe', lineHeight: 1.4 }}>
            Stay updated in real time when you carpool on campus
          </p>
        </div>

        {/* Body Content */}
        <div style={{ padding: '20px 24px' }}>
          {success ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '20px 0',
                textAlign: 'center',
                color: '#15803d',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <Check size={24} />
              </div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Notifications Active!</h4>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#166534' }}>
                You'll receive instant alerts for approaching drivers and seat bookings.
              </p>
            </div>
          ) : deniedGuidance ? (
            <div
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: '12px',
                padding: '14px',
                color: '#92400e',
                fontSize: '0.83rem',
                lineHeight: 1.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
                <AlertCircle size={18} style={{ color: '#d97706' }} />
                <span>Permission was blocked</span>
              </div>
              <p style={{ margin: 0 }}>
                To enable notifications, tap the lock/settings icon next to the URL in your browser's address bar and set <strong>Notifications</strong> to <strong>Allow</strong>.
              </p>
              <Button
                variant="outline"
                size="sm"
                style={{ marginTop: '12px', width: '100%' }}
                onClick={handleDismiss}
              >
                Got It
              </Button>
            </div>
          ) : (
            <>
              {/* Feature highlights */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                      Driver Arrival & Pickup Alerts
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Know the moment your driver starts the trip or pulls up at your gate.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Bell size={16} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                      Booking Requests & Updates
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Instant updates when a campus peer requests a seat or confirms your booking.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    <Shield size={16} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>
                      100% Campus Safe & Zero Spam
                    </strong>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Only active trip notifications. Easily toggle off anytime in settings.
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Button
                  variant="primary"
                  size="md"
                  id="btn-modal-allow-notifications"
                  onClick={handleEnablePush}
                  disabled={loading}
                  style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
                  leftIcon={loading ? <Loader2 size={18} className="animate-spin" /> : <Bell size={18} />}
                >
                  {loading ? 'Requesting Permission...' : 'Allow Notifications'}
                </Button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    padding: '8px',
                    cursor: 'pointer',
                  }}
                >
                  Maybe Later
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
