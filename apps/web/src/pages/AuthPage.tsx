import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Mail,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  GraduationCap,
  Briefcase,
  Lock,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { useAuth } from '../features/auth/AuthContext';

type AuthMode = 'signin' | 'signup';
type AuthStep = 'email' | 'otp';

export const AuthPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [step, setStep] = useState<AuthStep>('email');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);

  // If already authenticated, redirect to dashboard or intended route
  useEffect(() => {
    if (user) {
      const destination = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    }
  }, [user, navigate, location.state]);

  // Handle session expiration notification
  useEffect(() => {
    const expiredStorage = sessionStorage.getItem('vit_session_expired');
    const expiredState = (location.state as any)?.sessionExpired;
    if (expiredStorage || expiredState) {
      sessionStorage.removeItem('vit_session_expired');
      setError('Your campus session has expired or is invalid. Please sign in again with your institutional email.');
    }
  }, [location.state]);


  // Cooldown timer interval
  useEffect(() => {
    if (cooldown > 0) {
      cooldownTimerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownTimerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [cooldown]);

  // Auto-focus OTP input when entering OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpInputRef.current?.focus(), 150);
    }
  }, [step]);

  const normalizedEmail = email.trim().toLowerCase();
  const isStudent = normalizedEmail.endsWith('@vitstudent.ac.in');
  const isFaculty = normalizedEmail.endsWith('@vit.ac.in') && !isStudent;
  const isRecognizedDomain = isStudent || isFaculty;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'signup' && !fullName.trim()) {
      setError('Please provide your full legal name for campus registration.');
      return;
    }

    if (!normalizedEmail) {
      setError('Please enter your official VIT Chennai email address.');
      return;
    }

    if (!isRecognizedDomain) {
      setError('Only official @vitstudent.ac.in (students) or @vit.ac.in (faculty) email addresses are permitted.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          intent: mode,
          fullName: mode === 'signup' ? fullName.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || 'Failed to dispatch verification code. Please try again.');
        return;
      }

      setStep('otp');
      setCooldown(data.cooldownSeconds || 30);
      setSuccessMsg(data.message || 'Verification code sent to your email.');
    } catch {
      setError('Network communication failed. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const token = otp.trim();
    if (token.length < 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          token,
          intent: mode,
          fullName: mode === 'signup' ? fullName.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || 'Verification failed. The code may be incorrect or expired.');
        return;
      }

      login(data.token, data.user);
      const destination = (location.state as any)?.from?.pathname || '/dashboard';
      navigate(destination, { replace: true });
    } catch {
      setError('Verification network request failed. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || isLoading) return;
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || 'Could not resend OTP at this time.');
        return;
      }

      setCooldown(data.cooldownSeconds || 30);
      setSuccessMsg('New verification code sent to your email address.');
    } catch {
      setError('Failed to resend code due to network error.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-page-card">
        {/* Header Banner */}
        <div className="auth-card-header">
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-brand-100)',
              color: 'var(--color-brand-700)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <ShieldCheck size={28} />
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {step === 'otp' ? 'Enter Verification Code' : mode === 'signin' ? 'Institutional Sign In' : 'Institutional Registration'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
            {step === 'otp'
              ? `We sent a 6-digit code to ${normalizedEmail}`
              : 'Exclusive peer carpooling for verified VIT Chennai students & faculty.'}
          </p>
        </div>

        <div className="auth-card-body">
          {/* Mode Selector Tabs (only on email step) */}
          {step === 'email' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                padding: '4px',
                marginBottom: '20px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setSuccessMsg(null);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: mode === 'signin' ? '#ffffff' : 'transparent',
                  color: mode === 'signin' ? 'var(--color-brand-700)' : 'var(--text-secondary)',
                  fontWeight: mode === 'signin' ? 700 : 500,
                  fontSize: '0.85rem',
                  boxShadow: mode === 'signin' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                id="tab-auth-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setSuccessMsg(null);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: mode === 'signup' ? '#ffffff' : 'transparent',
                  color: mode === 'signup' ? 'var(--color-brand-700)' : 'var(--text-secondary)',
                  fontWeight: mode === 'signup' ? 700 : 500,
                  fontSize: '0.85rem',
                  boxShadow: mode === 'signup' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                id="tab-auth-signup"
              >
                New Registration
              </button>
            </div>
          )}

          {/* Feedback Banners */}
          {error && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '8px',
                color: '#991b1b',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                marginBottom: '16px',
              }}
              id="auth-error-alert"
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#dcfce7',
                border: '1px solid #86efac',
                borderRadius: '8px',
                color: '#166534',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
              }}
              id="auth-success-alert"
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <div>{successMsg}</div>
            </div>
          )}

          {/* STEP 1: Email & Full Name Form */}
          {step === 'email' ? (
            <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {mode === 'signup' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Full Legal Name *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 38px',
                        fontSize: '0.9rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-medium)',
                        outline: 'none',
                      }}
                      id="input-auth-fullname"
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Institutional Email Address *
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <Mail size={16} />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder={mode === 'signup' ? 'name@vitstudent.ac.in or name@vit.ac.in' : 'your.email@vitstudent.ac.in'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 38px',
                      fontSize: '0.9rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-medium)',
                      outline: 'none',
                    }}
                    id="input-auth-email"
                  />
                </div>

                {/* Domain classification indicator */}
                {normalizedEmail.length > 5 && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isStudent && (
                      <span style={{ color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        <GraduationCap size={13} /> Verified Student Pattern (@vitstudent.ac.in)
                      </span>
                    )}
                    {isFaculty && (
                      <span style={{ color: '#6b21a8', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                        <Briefcase size={13} /> Verified Faculty Pattern (@vit.ac.in)
                      </span>
                    )}
                    {!isRecognizedDomain && (
                      <span style={{ color: '#b45309' }}>
                        Must be @vitstudent.ac.in or @vit.ac.in
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isLoading}
                rightIcon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                id="btn-request-otp"
                style={{ width: '100%', marginTop: '6px' }}
              >
                {isLoading ? 'Requesting Code...' : mode === 'signin' ? 'Send Sign In Code' : 'Send Registration Code'}
              </Button>
            </form>
          ) : (
            /* STEP 2: OTP Verification Form */
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setOtp('');
                      setError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-brand-600)',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronLeft size={13} /> Edit Email
                  </button>
                </div>

                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '1.4rem',
                    textAlign: 'center',
                    letterSpacing: '0.3em',
                    fontWeight: 700,
                    borderRadius: '8px',
                    border: '1px solid var(--border-medium)',
                    outline: 'none',
                  }}
                  id="input-auth-otp"
                />
                {import.meta.env.DEV && (
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '0.75rem',
                      color: '#0369a1',
                      backgroundColor: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      textAlign: 'center',
                    }}
                  >
                    ✉️ Check your institutional inbox for the 6-digit code.{import.meta.env.DEV && <> (Dev mode fallback: <code>123456</code>)</>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  Code expires in 5 minutes
                </span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={cooldown > 0 || isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: cooldown > 0 ? 'var(--text-muted)' : 'var(--color-brand-600)',
                    cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  id="btn-resend-otp"
                >
                  <RotateCcw size={12} />
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={isLoading || otp.length < 6}
                rightIcon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                id="btn-verify-otp"
                style={{ width: '100%' }}
              >
                {isLoading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
            </form>
          )}

          {/* Development Quick-Fill Helper (Local Dev Only) */}
          {import.meta.env.DEV && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border-medium)' }}>
              <details style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                  🔧 Local Dev Fast-Fill (Test Accounts)
                </summary>
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin');
                        setEmail('student@vitstudent.ac.in');
                        setStep('email');
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        backgroundColor: '#dcfce7',
                        color: '#166534',
                        border: '1px solid #bbf7d0',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Fill Student (Commuter)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin');
                        setEmail('faculty@vit.ac.in');
                        setStep('email');
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        backgroundColor: '#f3e8ff',
                        color: '#6b21a8',
                        border: '1px solid #e9d5ff',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      Fill Faculty (Staff)
                    </button>
                    <button
                      type="button"
                      id="btn-dev-login-arjun"
                      onClick={async () => {
                        try {
                          setIsLoading(true);
                          const res = await fetch('/auth/dev-login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: 'arjun.driver@vitstudent.ac.in' }),
                          });
                          const data = await res.json();
                          if (res.ok && data.token && data.user) {
                            login(data.token, data.user);
                            navigate('/recurring-commutes');
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: '1px solid #0369a1',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ⚡ 1-Click Login (Arjun Driver)
                    </button>
                    <button
                      type="button"
                      id="btn-dev-login-admin"
                      onClick={() => {
                        login('dev-admin-token-preview', {
                          id: '34aeec7c-33e1-49ad-97d5-d8541bbe315d',
                          email: 'admin.safety@vitstudent.ac.in',
                          fullName: 'Campus Admin Safety Officer',
                          phoneNumber: null,
                          audience: 'STUDENT',
                          verificationStatus: 'VERIFIED',
                          verificationMethod: 'MANUAL_ID_REVIEW',
                          verifiedAt: new Date().toISOString(),
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                          role: 'ADMIN',
                        } as any);
                        navigate('/admin');
                      }}
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.7rem',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: '1px solid #b91c1c',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      🛡️ 1-Click Login (Admin)
                    </button>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    In dev mode with unconfigured Supabase credentials, use code <code>123456</code>.
                  </span>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Footer Guarantee */}
        <div className="auth-card-footer">
          <Lock size={12} />
          <span>Automatic audience separation: Students travel with students; Faculty with faculty.</span>
        </div>
      </div>
    </div>
  );
};
