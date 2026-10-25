import React, { useState } from 'react';
import { Mail, Lock, GraduationCap, Briefcase, Info, UserCheck } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { useAuth } from '../auth/AuthContext';
import { UserProfileResponseDto } from '@vit-carpool/contracts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');

  const simulateDevLogin = async (
    email: string,
    fullName: string,
    status: 'VERIFIED' | 'PENDING' | 'SUSPENDED',
    audience: 'STUDENT' | 'FACULTY' | null,
    role: 'USER' | 'ADMIN' = 'USER',
  ) => {
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, audience, status }),
      });
      if (res.ok) {
        const data = await res.json();
        login(data.token, data.user);
        onClose();
        return;
      }
    } catch {
      // Offline fallback
    }

    const dummyUser: UserProfileResponseDto = {
      id: '00000000-0000-4000-8000-000000000001',
      email,
      fullName,
      phoneNumber: '+91 98765 43210',
      audience,
      verificationStatus: status,
      verificationMethod: status === 'VERIFIED' ? 'MANUAL_ID_REVIEW' : null,
      verifiedAt: status === 'VERIFIED' ? new Date().toISOString() : null,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    login('dev-mock-jwt-token', dummyUser);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Institutional Sign-In"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Development Test Accounts */}
        {import.meta.env.DEV && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.85rem', color: '#166534' }}>
              <UserCheck size={16} />
              <span>Development Identity Switcher (Milestone 2.2 Local Testing)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  simulateDevLogin(
                    'rohan.student@vitstudent.ac.in',
                    'Rohan (Student)',
                    'VERIFIED',
                    'STUDENT',
                  )
                }
              >
                🎓 Verified Student
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  simulateDevLogin(
                    'prof.sharma@vit.ac.in',
                    'Prof. Sharma',
                    'VERIFIED',
                    'FACULTY',
                  )
                }
              >
                💼 Verified Faculty
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  simulateDevLogin(
                    'pending.student@vitstudent.ac.in',
                    'New Student',
                    'PENDING',
                    null,
                  )
                }
              >
                ⏳ Pending Account
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  simulateDevLogin(
                    'suspended.user@vitstudent.ac.in',
                    'Suspended User',
                    'SUSPENDED',
                    'STUDENT',
                  )
                }
              >
                ⛔ Suspended User
              </Button>
            </div>
          </div>
        )}

        {/* Status Info Banner */}
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
            <strong>Institutional Authentication:</strong> Supabase OTP login will automatically classify accounts once official VIT Chennai email rules are confirmed.
          </div>
        </div>

        <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label htmlFor="auth-email-input" className="form-label">
              Institutional Email Address
            </label>
            <div className="form-control-wrap">
              <span className="form-icon-left">
                <Mail size={16} />
              </span>
              <input
                id="auth-email-input"
                type="email"
                className="form-input form-input-with-icon"
                placeholder="e.g. name@vitstudent.ac.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
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
                  Restricted strictly to students
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
                  Restricted strictly to faculty
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <strong>Zero Self-Selection:</strong> Users can never self-assign an audience. Classification is determined by server verification rules.
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};
