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

      setMessage('A 6-digit two-factor authentication challenge has been dispatched to your email.');
      setStep('mfa');
    } catch (err: any) {
      setError(err.message || 'Failed to initiate admin authentication.');
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
    <div
      style={{
        minHeight: '85vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        backgroundColor: '#0f172a',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#1e293b',
          borderRadius: '16px',
          border: '1px solid #334155',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          color: '#f8fafc',
        }}
      >
        {/* Header Banner */}
        <div
          style={{
            padding: '28px 24px 20px',
            textAlign: 'center',
            borderBottom: '1px solid #334155',
            backgroundColor: '#0f172a',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: '#60a5fa',
            }}
          >
            <ShieldCheck size={30} />
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
            VIT Carpool Operations Portal
          </h1>
          <p style={{ fontSize: '0.825rem', color: '#94a3b8', lineHeight: '1.45' }}>
            Restricted administrative gateway for campus operations, Trust &amp; Safety, and moderation staff.
          </p>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px' }}>
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
              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="admin-email"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Authorized Staff Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="moderator@vit.ac.in"
                    required
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 38px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                  <Mail
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '14px', color: '#64748b' }}
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%' }}
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
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label
                    htmlFor="admin-mfa-code"
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    6-Digit Security Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Change Email
                  </button>
                </div>
                <input
                  id="admin-mfa-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '8px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '0.3em',
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px', display: 'block' }}>
                  Code sent to <strong style={{ color: '#e2e8f0' }}>{email}</strong>
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%' }}
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

              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="invite-fullname"
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
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
                    style={{
                      width: '100%',
                      padding: '12px 14px 12px 38px',
                      borderRadius: '8px',
                      border: '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                  <User
                    size={16}
                    style={{ position: 'absolute', left: '12px', top: '14px', color: '#64748b' }}
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{ width: '100%' }}
                disabled={loading || !fullName.trim()}
                leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                id="btn-accept-invite"
              >
                Activate Staff Account
              </Button>
            </form>
          )}

          <div
            style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.775rem',
              color: '#64748b',
            }}
          >
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
              }}
            >
              Student / Faculty Sign In <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
