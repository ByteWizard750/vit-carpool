import React, { useState, useEffect } from 'react';
import {
  Mail,
  User,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const { login } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Synchronize initial mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setStep('input');
      setOtp('');
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialMode]);

  // Handle countdown timer for OTP resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    setStep('input');
    setOtp('');
    setError(null);
    setSuccessMsg(null);
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setError('Please enter a valid institutional email address.');
      return;
    }

    if (mode === 'signup' && (!fullName.trim() || fullName.trim().length < 2)) {
      setError('Please enter your full legal name.');
      return;
    }

    // Quick client-side sanity check for VIT domains
    const isStudent = /^[a-zA-Z0-9._%+-]+@vitstudent\.ac\.in$/i.test(normalizedEmail);
    const isFaculty = /^[a-zA-Z0-9._%+-]+@vit\.ac\.in$/i.test(normalizedEmail);

    if (!isStudent && !isFaculty) {
      setError(
        'Please enter your official VIT Chennai email (@vitstudent.ac.in for students, @vit.ac.in for faculty).',
      );
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
          email: email.trim().toLowerCase(),
          token,
          intent: mode,
          fullName: mode === 'signup' ? fullName.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || 'Invalid or expired verification code.');
        return;
      }

      // Successful verification
      login(data.token, data.user);
      onClose();
    } catch {
      setError('Network error during verification. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (cooldown > 0 || isResending) return;

    setError(null);
    setSuccessMsg(null);
    setIsResending(true);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          intent: mode,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message || 'Failed to resend verification code.');
        return;
      }

      setCooldown(data.cooldownSeconds || 30);
      setSuccessMsg('A fresh verification code has been dispatched to your email.');
    } catch {
      setError('Network error while resending verification code.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'signup' ? 'Join VIT Chennai Carpool' : 'Institutional Sign-In'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {mode === 'signin' ? (
              <span>
                New commuter?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  style={{
                    color: 'var(--color-brand-600)',
                    fontWeight: 600,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  id="auth-switch-to-signup"
                >
                  Create an account
                </button>
              </span>
            ) : (
              <span>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  style={{
                    color: 'var(--color-brand-600)',
                    fontWeight: 600,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                  id="auth-switch-to-signin"
                >
                  Sign in here
                </button>
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation Mode Tabs */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: '8px',
            padding: '4px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => switchMode('signin')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              backgroundColor: mode === 'signin' ? '#ffffff' : 'transparent',
              color: mode === 'signin' ? 'var(--color-brand-900)' : 'var(--text-muted)',
              boxShadow: mode === 'signin' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="auth-tab-signin"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              backgroundColor: mode === 'signup' ? '#ffffff' : 'transparent',
              color: mode === 'signup' ? 'var(--color-brand-900)' : 'var(--text-muted)',
              boxShadow: mode === 'signup' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
            id="auth-tab-signup"
          >
            Sign Up
          </button>
        </div>

        {/* Informative Security Banner */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--color-brand-50)',
            border: '1px solid var(--color-brand-200)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '0.825rem',
            color: 'var(--color-brand-900)',
          }}
        >
          <ShieldCheck size={18} style={{ color: 'var(--color-brand-700)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Campus Circle Automatic Assignment:</strong> Students (<code>@vitstudent.ac.in</code>) and faculty (<code>@vit.ac.in</code>) are automatically verified server-side.
          </div>
        </div>

        {/* Error Notification Alert */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.825rem',
              color: '#991b1b',
            }}
            role="alert"
            id="auth-error-alert"
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Success Notification Alert */}
        {successMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.825rem',
              color: '#166534',
            }}
            role="status"
            id="auth-success-alert"
          >
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step 1: Institutional Email & Profile Input */}
        {step === 'input' && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="auth-fullname-input" className="form-label">
                  Full Legal Name <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <div className="form-control-wrap">
                  <span className="form-icon-left">
                    <User size={16} />
                  </span>
                  <input
                    id="auth-fullname-input"
                    type="text"
                    className="form-input form-input-with-icon"
                    placeholder="e.g. Rohan Rayavarapu"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="auth-email-input" className="form-label">
                Official Institutional Email <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <div className="form-control-wrap">
                <span className="form-icon-left">
                  <Mail size={16} />
                </span>
                <input
                  id="auth-email-input"
                  type="email"
                  className="form-input form-input-with-icon"
                  placeholder={mode === 'signup' ? 'name.year@vitstudent.ac.in or name@vit.ac.in' : 'your.email@vitstudent.ac.in'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Must end with <code>@vitstudent.ac.in</code> (Students) or <code>@vit.ac.in</code> (Faculty).
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              style={{ width: '100%' }}
              isLoading={isLoading}
              rightIcon={<ArrowRight size={16} />}
              id="auth-submit-request-otp"
            >
              {mode === 'signup' ? 'Send Registration Code' : 'Send Login Code'}
            </Button>
          </form>
        )}

        {/* Step 2: 6-Digit Email OTP Verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle)',
                fontSize: '0.825rem',
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Code sent to: <strong>{email}</strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('input');
                  setOtp('');
                  setError(null);
                  setSuccessMsg(null);
                }}
                style={{
                  color: 'var(--color-brand-600)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.775rem',
                }}
                id="auth-change-email-btn"
              >
                <ArrowLeft size={13} />
                Change
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="auth-otp-input" className="form-label">
                Enter 6-Digit Verification Code <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <div className="form-control-wrap">
                <span className="form-icon-left">
                  <KeyRound size={16} />
                </span>
                <input
                  id="auth-otp-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  className="form-input form-input-with-icon"
                  placeholder="e.g. 123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.trim())}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  style={{ letterSpacing: '0.25em', fontWeight: 700, fontSize: '1.1rem' }}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              style={{ width: '100%' }}
              isLoading={isLoading}
              rightIcon={<CheckCircle size={16} />}
              id="auth-verify-otp-btn"
            >
              {mode === 'signup' ? 'Complete Registration' : 'Verify & Sign In'}
            </Button>

            {/* Resend Code Section */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              <span>Didn&apos;t receive code?</span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || isResending}
                style={{
                  color: cooldown > 0 ? 'var(--text-muted)' : 'var(--color-brand-600)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: cooldown > 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                id="auth-resend-otp-btn"
              >
                {isResending && <RefreshCw size={13} className="spin" />}
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
              </button>
            </div>
          </form>
        )}

        {/* Development Quick-Fill Helper (Development/Test Mode Only) */}
        {import.meta.env.DEV && (
          <details
            style={{
              marginTop: '8px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: '#f8fafc',
              border: '1px dashed var(--border-light)',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
              🛠️ Local Dev Quick-Fill Helper (Non-Production Only)
            </summary>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMode('signin');
                  setEmail('rohan.student@vitstudent.ac.in');
                  setStep('input');
                  setError(null);
                }}
              >
                🎓 Fill Student
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMode('signin');
                  setEmail('prof.sharma@vit.ac.in');
                  setStep('input');
                  setError(null);
                }}
              >
                💼 Fill Faculty
              </Button>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
};
