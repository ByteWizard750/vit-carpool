import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Shield, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';
import { CURRENT_TERMS_VERSION, ConsentStatusResponseDto } from '@vit-carpool/contracts';

export const TermsUpdateModal: React.FC = () => {
  const { user, token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !user) {
      setIsOpen(false);
      return;
    }

    let isMounted = true;
    fetch('/api/auth/consent-status', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ConsentStatusResponseDto | null) => {
        if (isMounted && data && !data.hasAcceptedLatest) {
          setIsOpen(true);
        }
      })
      .catch(() => {
        // Silent network fallback
      });

    return () => {
      isMounted = false;
    };
  }, [token, user]);

  const handleAccept = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/accept-terms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ termsVersion: CURRENT_TERMS_VERSION }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Failed to record consent.');
      }

      setIsOpen(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
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
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '28px 24px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Scale size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
              Terms &amp; Conditions Update
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Version {CURRENT_TERMS_VERSION} • Campus Charter
            </span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
          We have updated our platform Terms &amp; Conditions and Privacy Policy to enhance safety, clarify campus transit coordination rules, and safeguard institutional privacy.
        </p>

        <div
          style={{
            padding: '12px 14px',
            backgroundColor: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            fontSize: '0.825rem',
            color: '#334155',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={15} style={{ color: '#059669' }} />
            <span>Non-commercial direct cost reimbursement only.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={15} style={{ color: '#059669' }} />
            <span>Strict institutional identity verification and community code of conduct.</span>
          </div>
        </div>

        <div style={{ fontSize: '0.825rem', color: '#64748b' }}>
          Please review the full{' '}
          <Link to="/terms" target="_blank" style={{ color: '#2563eb', fontWeight: 600 }}>
            Terms &amp; Conditions
          </Link>{' '}
          and acknowledge our{' '}
          <Link to="/privacy" target="_blank" style={{ color: '#2563eb', fontWeight: 600 }}>
            Privacy Policy
          </Link>
          .
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: '#fee2e2',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.825rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={handleAccept}
          disabled={loading}
          leftIcon={loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          id="btn-accept-updated-terms"
          style={{ width: '100%', marginTop: '6px' }}
        >
          {loading ? 'Recording Consent...' : 'I Agree & Continue'}
        </Button>
      </div>
    </div>
  );
};
