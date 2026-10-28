import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  Car,
  Shield,
  HelpCircle,
  ShieldAlert,
  LogOut,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

interface AccountMenuProps {
  onOpenVerification?: () => void;
}

export const AccountMenu: React.FC<AccountMenuProps> = ({ onOpenVerification }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!user) return null;

  const handleSignOut = () => {
    setIsOpen(false);
    logout();
    navigate('/');
  };

  const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Account';
  const initials = user.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  const audienceLabel = user.audience === 'FACULTY' ? 'Faculty Circle' : 'Student Circle';

  return (
    <div className="account-menu-container" ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Account menu"
        id="account-menu-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px 4px 6px',
          backgroundColor: isOpen ? 'var(--canvas-subtle, #f1f3f7)' : 'transparent',
          border: '1px solid var(--border-subtle, #e5e7eb)',
          borderRadius: 'var(--radius-full, 9999px)',
          cursor: 'pointer',
          transition: 'all var(--transition-fast)',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: 'var(--brand-subtle, #eef3ff)',
            color: 'var(--brand-blue, #2340b8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          {initials}
        </div>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            maxWidth: '100px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {firstName}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {isOpen && (
        <div
          className="account-menu-dropdown"
          role="menu"
          aria-label="User account actions"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: '240px',
            backgroundColor: 'var(--surface, #ffffff)',
            borderRadius: 'var(--radius-lg, 12px)',
            border: '1px solid var(--border-subtle, #e5e7eb)',
            boxShadow: 'var(--shadow-lg, 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1))',
            padding: '6px',
            zIndex: 1000,
          }}
        >
          {/* User summary header */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
              marginBottom: '4px',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.2,
              }}
            >
              {user.fullName}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.email}
            </div>
            <div
              style={{
                marginTop: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: 'var(--brand-subtle, #eef3ff)',
                color: 'var(--brand-blue, #2340b8)',
              }}
            >
              <CheckCircle2 size={11} /> {audienceLabel}
            </div>

            {user.verificationStatus === 'PENDING' && onOpenVerification && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenVerification();
                }}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
                id="menu-btn-submit-verification"
              >
                Complete ID Verification →
              </button>
            )}
          </div>

          {/* Menu Links */}
          <Link
            to="/profile"
            className="account-menu-item"
            onClick={() => setIsOpen(false)}
            role="menuitem"
            id="account-menu-profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background var(--transition-fast)',
            }}
          >
            <User size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>Profile</span>
          </Link>

          <Link
            to="/vehicles"
            className="account-menu-item"
            onClick={() => setIsOpen(false)}
            role="menuitem"
            id="account-menu-vehicles"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background var(--transition-fast)',
            }}
          >
            <Car size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>Vehicles</span>
          </Link>

          <Link
            to="/safety"
            className="account-menu-item"
            onClick={() => setIsOpen(false)}
            role="menuitem"
            id="account-menu-safety"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background var(--transition-fast)',
            }}
          >
            <Shield size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>Safety & Circles</span>
          </Link>

          <Link
            to="/how-it-works"
            className="account-menu-item"
            onClick={() => setIsOpen(false)}
            role="menuitem"
            id="account-menu-how-it-works"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-primary)',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              transition: 'background var(--transition-fast)',
            }}
          >
            <HelpCircle size={15} style={{ color: 'var(--text-secondary)' }} />
            <span>How It Works</span>
          </Link>

          {user.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="account-menu-item"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              id="account-menu-admin"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                color: 'var(--danger-text, #b42318)',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'background var(--transition-fast)',
              }}
            >
              <ShieldAlert size={15} style={{ color: 'var(--danger-text, #b42318)' }} />
              <span>Admin Moderation</span>
            </Link>
          )}

          <div
            style={{
              borderTop: '1px solid var(--border-subtle, #e5e7eb)',
              margin: '4px 0',
            }}
          />

          <button
            type="button"
            className="account-menu-item"
            onClick={handleSignOut}
            role="menuitem"
            id="account-menu-signout"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background var(--transition-fast)',
            }}
          >
            <LogOut size={15} style={{ color: 'var(--text-muted)' }} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
};
