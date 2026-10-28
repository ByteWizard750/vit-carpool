import React, { useState } from 'react';
import { ShieldAlert, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';
import { ReportCategory } from '@vit-carpool/contracts';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetName?: string;
  reportedUserId?: string;
  rideId?: string;
  bookingId?: string;
  messageId?: string;
  onReportSubmitted?: () => void;
}

const CATEGORY_OPTIONS: Array<{ value: ReportCategory; label: string; description: string }> = [
  {
    value: 'SAFETY_CONCERN',
    label: 'Physical Safety or Reckless Driving',
    description: 'Dangerous driving, route deviation, harassment, or safety violations.',
  },
  {
    value: 'HARASSMENT',
    label: 'Harassment or Inappropriate Behavior',
    description: 'Unwanted advances, abusive language, or threatening conduct.',
  },
  {
    value: 'NO_SHOW',
    label: 'No-Show or Abandonment',
    description: 'Driver or passenger failed to arrive without timely communication.',
  },
  {
    value: 'FRAUD',
    label: 'Fraud or Identity Misrepresentation',
    description: 'Vehicle does not match profile, or wrong driver/passenger.',
  },
  {
    value: 'FARE_DISPUTE',
    label: 'Fare Inflation or Cash Demands',
    description: 'Demanding payment beyond platform-listed cost-sharing limit.',
  },
  {
    value: 'SPAM',
    label: 'Spam or Advertising',
    description: 'Commercial promotions or irrelevant messaging.',
  },
  {
    value: 'INAPPROPRIATE_BEHAVIOR',
    label: 'Community Standards Violation',
    description: 'Disrespectful conduct or failure to follow campus etiquette.',
  },
  {
    value: 'OTHER',
    label: 'Other Concern',
    description: 'Any other issue that requires moderation review.',
  },
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetName,
  reportedUserId,
  rideId,
  bookingId,
  messageId,
  onReportSubmitted,
}) => {
  const { token } = useAuth();
  const [category, setCategory] = useState<ReportCategory>('SAFETY_CONCERN');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || loading) return;

    if (description.trim().length < 10) {
      setErrorMsg('Please describe what happened in at least 10 characters.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/moderation/reports', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          reportedUserId,
          rideId,
          bookingId,
          messageId,
          category,
          description: description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to submit report. Please try again.');
      }

      setSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }
      setTimeout(() => {
        setSuccess(false);
        setDescription('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting your report.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setErrorMsg(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={targetName ? `Report ${targetName}` : 'Submit Safety Report'}
      maxWidth="560px"
    >
      {success ? (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <CheckCircle2 size={32} />
          </div>
          <h4 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 8px', color: '#166534' }}>
            Report Submitted Confidentially
          </h4>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Thank you for helping keep the VIT Chennai carpool community safe. Campus administrators will inspect this incident.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Information Notice */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <ShieldAlert size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.825rem', color: '#991b1b', lineHeight: 1.45 }}>
              <strong>Confidential Review:</strong> Reports are handled confidentially by authorized campus administrators. The reported person will not see who filed this report.
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: '#fef2f2',
                color: '#b91c1c',
                borderRadius: '8px',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Category Selection */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '6px',
              }}
            >
              Incident Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="input"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {CATEGORY_OPTIONS.find((c) => c.value === category)?.description}
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: '6px',
              }}
            >
              Description of Incident (Min 10 characters)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide specific details about what occurred, including approximate times, location, or direct quotes..."
              rows={4}
              className="input"
              style={{
                width: '100%',
                resize: 'vertical',
                minHeight: '100px',
                padding: '10px 12px',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
              }}
              maxLength={1000}
              disabled={loading}
              required
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginTop: '4px',
              }}
            >
              <span>Be as specific and factual as possible.</span>
              <span>{description.length}/1000</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={loading || description.trim().length < 10}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Submitting...
                </>
              ) : (
                'Submit Confidential Report'
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
