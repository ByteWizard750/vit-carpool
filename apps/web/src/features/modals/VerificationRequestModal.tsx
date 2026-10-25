import React, { useState } from 'react';
import { ShieldAlert, Send, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { AudienceType } from '@vit-carpool/contracts';

interface VerificationRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VerificationRequestModal: React.FC<VerificationRequestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user, token, refreshProfile } = useAuth();
  const [requestedAudience, setRequestedAudience] = useState<AudienceType>('STUDENT');
  const [institutionalEmail, setInstitutionalEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/verification/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestedAudience,
          institutionalEmail,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message || 'Verification submission failed');
      }

      setSubmitted(true);
      await refreshProfile();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit verification request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Campus Institutional Verification"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            {submitted ? 'Close' : 'Cancel'}
          </Button>
          {!submitted && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={submitting}
              leftIcon={<Send size={14} />}
            >
              Submit for Verification
            </Button>
          )}
        </div>
      }
    >
      {submitted ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px', padding: '16px 0' }}>
          <div style={{ color: 'var(--color-success)', display: 'flex' }}>
            <CheckCircle2 size={48} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Verification Request Submitted</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Your request has been queued for administrative review. Once confirmed, your account will be granted access to your verified community circle.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '0.825rem',
              color: '#92400e',
            }}
          >
            <ShieldAlert size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Account Pending Verification:</strong> In accordance with our security invariants, all carpooling participation requires administrative validation of your institutional affiliation.
            </div>
          </div>

          {error && (
            <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Affiliation Category Requested</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setRequestedAudience('STUDENT')}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: requestedAudience === 'STUDENT' ? '2px solid var(--color-brand-600)' : '1px solid var(--border-light)',
                    backgroundColor: requestedAudience === 'STUDENT' ? 'var(--color-brand-50)' : '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Student Circle
                </button>
                <button
                  type="button"
                  onClick={() => setRequestedAudience('FACULTY')}
                  style={{
                    padding: '10px',
                    borderRadius: '6px',
                    border: requestedAudience === 'FACULTY' ? '2px solid var(--color-brand-600)' : '1px solid var(--border-light)',
                    backgroundColor: requestedAudience === 'FACULTY' ? 'var(--color-brand-50)' : '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Faculty Circle
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="verify-email-input" className="form-label">Institutional Email</label>
              <input
                id="verify-email-input"
                type="email"
                className="form-input"
                value={institutionalEmail}
                onChange={(e) => setInstitutionalEmail(e.target.value)}
                placeholder="e.g. name@vitstudent.ac.in"
                required
              />
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
};
