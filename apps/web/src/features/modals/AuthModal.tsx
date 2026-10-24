import React, { useState } from 'react';
import { Mail, Lock, GraduationCap, Briefcase, Info } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Institutional Sign-In (Planned Feature)"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Preview
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled
            style={{ opacity: 0.6, cursor: 'not-allowed' }}
            id="auth-disabled-btn"
          >
            Sign-In Launches in Milestone 2.2
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Planned Status Banner */}
        <div
          style={{
            padding: '12px 14px',
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
          <Info size={18} style={{ color: 'var(--color-brand-700)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Identity Verification Planned for Milestone 2.2:</strong> Authentication is not yet operational.
            When deployed, access will be restricted to verified members of the VIT Chennai community.
            No personal or account data is stored during this design preview.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label htmlFor="auth-email-input" className="form-label">
              Institutional Email Address (Preview)
            </label>
            <div className="form-control-wrap">
              <span className="form-icon-left">
                <Mail size={16} />
              </span>
              <input
                id="auth-email-input"
                type="email"
                className="form-input form-input-with-icon"
                placeholder="e.g. your institutional email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled
              />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Institutional email domain formats are subject to confirmation during backend setup. Commercial personal accounts will not be eligible.
            </span>
          </div>

          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              <Lock size={15} style={{ color: 'var(--color-brand-700)' }} />
              <span>Security Rule: Server-Derived Audience Classification</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div
                style={{
                  padding: '8px',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--color-brand-700)' }}>
                  <GraduationCap size={13} />
                  <span>Student Circle</span>
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                  Derived strictly by server verification once rules are confirmed
                </div>
              </div>

              <div
                style={{
                  padding: '8px',
                  backgroundColor: '#ffffff',
                  borderRadius: '6px',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: '#6d28d9' }}>
                  <Briefcase size={13} />
                  <span>Faculty Circle</span>
                </div>
                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                  Derived strictly by server verification once rules are confirmed
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <strong>Zero Self-Selection:</strong> Users will never be permitted to select or alter their own audience.
              The backend verification engine and database constraints will govern classification to guarantee complete community isolation.
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};
