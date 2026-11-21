import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { useAuth } from '../features/auth/AuthContext';
import { GLOBAL_ADMIN_RESERVED_EMAIL } from '@vit-carpool/contracts';

export const AdminLoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite') || searchParams.get('inviteToken');

  // Step state: 'email' | 'mfa' | 'invite'
  const [step, setStep] = useState<'email' | 'mfa' | 'invite'>(inviteToken ? 'invite' : 'email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  // Countdown timer for MFA resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // If already authenticated with administrative role, redirect to /admin
  useEffect(() => {
    const adminRoles = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];
    if (user && adminRoles.includes(user.role)) {
      navigate('/admin', { replace: true });
    }
  }, [user, navigate]);

  const handleSendChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Administrative authentication failed.');
      }

      if (data.devOtp) {
        setDevOtp(data.devOtp);
        setCode(data.devOtp);
        setMessage(`Verification code: ${data.devOtp} (Local network blocked outbound SMTP; code auto-filled)`);
      } else {
        setMessage('A 6-digit two-factor authentication challenge has been dispatched to your email.');
      }
      setCooldown(data.cooldownSeconds || 30);
      setStep('mfa');
    } catch (err: any) {
      setError(err.message || 'Failed to initiate admin authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0 || loading || !email.trim()) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to resend MFA challenge.');
      }

      if (data.devOtp) {
        setDevOtp(data.devOtp);
        setCode(data.devOtp);
        setMessage(`Fresh verification code: ${data.devOtp} (SMTP blocked by local ISP; code auto-filled)`);
      } else {
        setMessage('A fresh 6-digit challenge has been dispatched to your email.');
      }
      setCooldown(data.cooldownSeconds || 30);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'MFA challenge verification failed.');
      }

      // Elevated session established
      login(data.token, data.user);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid two-factor authentication code.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken || !fullName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken.trim(),
          fullName: fullName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to activate administrator invitation.');
      }

      login(data.token, data.user);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Invalid or expired invitation token.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className="admin-login-card">
        {/* Header Banner */}
        <div className="admin-login-header">
          <div className="admin-login-icon-badge">
            <ShieldCheck size={28} />
          </div>
          <h1 className="admin-login-title">
            VIT Carpool Operations Portal
          </h1>
          <p className="admin-login-subtitle">
            Restricted administrative gateway for campus operations, Trust &amp; Safety, and moderation staff.
          </p>
        </div>

        {/* Content Body */}
        <div className="admin-login-body">
          {error && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#f87171',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '18px',
              }}
              id="admin-login-error"
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '8px',
                color: '#93c5fd',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '18px',
              }}
            >
              <KeyRound size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{message}</span>
            </div>
          )}

          {/* Step 1: Email Form */}
          {step === 'email' && (
            <form onSubmit={handleSendChallenge}>
              <div className="admin-input-group">
                <label htmlFor="admin-email" className="admin-input-label">
                  Authorized Staff Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="admin-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={GLOBAL_ADMIN_RESERVED_EMAIL}
                    required
                    className="admin-input-field"
                  />
                  <Mail
                    size={16}
                    className="admin-input-icon"
                  />
                </div>
                {/* Mobile Convenience Quick-Fill Chip */}
                <div>
                  <button
                    type="button"
                    className="admin-quick-fill-chip"
                    onClick={() => setEmail(GLOBAL_ADMIN_RESERVED_EMAIL)}
                    id="btn-quick-fill-admin-email"
                  >
                    <ShieldCheck size={13} style={{ color: '#60a5fa' }} />
                    <span>Use {GLOBAL_ADMIN_RESERVED_EMAIL}</span>
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%', minHeight: '48px', fontSize: '0.95rem' }}
                disabled={loading || !email.trim()}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                id="btn-admin-continue"
              >
                Authenticate with 2FA
              </Button>
            </form>
          )}

          {/* Step 2: 2FA MFA Verification Form */}
          {step === 'mfa' && (
            <form onSubmit={handleVerifyMfa}>
              <div className="admin-input-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="admin-mfa-code" className="admin-input-label" style={{ marginBottom: 0 }}>
                    6-Digit Security Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                    className="admin-tap-target-btn"
                  >
                    Change Email
                  </button>
                </div>
                <input
                  id="admin-mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  required
                  className="admin-mfa-input"
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                    fontSize: '0.8rem',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <span style={{ color: '#94a3b8' }}>
                    Code sent to <strong style={{ color: '#e2e8f0' }}>{email}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={cooldown > 0 || loading}
                    className="admin-tap-target-btn"
                  >
                    {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                  </button>
                </div>

                {devOtp && (
                  <div
                    style={{
                      marginTop: '14px',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                    id="banner-dev-otp"
                  >
                    <div>
                      <div>
                        Dev Mode Security Code: <strong style={{ color: '#ffffff', fontSize: '1.05rem', letterSpacing: '0.1em' }}>{devOtp}</strong>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        Outbound SMTP is blocked on local network. Code auto-filled above.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCode(devOtp)}
                      style={{
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        minHeight: '32px',
                      }}
                    >
                      Fill Code
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%', minHeight: '48px', fontSize: '0.95rem' }}
                disabled={loading || code.length < 6}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                id="btn-admin-verify-mfa"
              >
                Verify &amp; Enter Control Centre
              </Button>
            </form>
          )}

          {/* Step 3: Accept Invitation Form */}
          {step === 'invite' && (
            <form onSubmit={handleAcceptInvite}>
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '8px',
                  color: '#86efac',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                You have been invited by a Super Administrator to join the VIT Carpool operations team.
              </div>

              <div className="admin-input-group">
                <label htmlFor="invite-fullname" className="admin-input-label">
                  Your Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="invite-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Prof. R. Ramanathan"
                    required
                    className="admin-input-field"
                  />
                  <User
                    size={16}
                    className="admin-input-icon"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%', minHeight: '48px', fontSize: '0.95rem' }}
                disabled={loading || !fullName.trim()}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                id="btn-accept-invite"
              >
                Activate Staff Account
              </Button>
            </form>
          )}

          <div className="admin-login-footer">
            <span>Not staff?</span>
            <Link
              to="/auth"
              style={{
                color: '#60a5fa',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
                minHeight: '36px',
                padding: '4px 8px',
              }}
            >
              Student / Faculty Sign In <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
