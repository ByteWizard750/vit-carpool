import React, { useState } from 'react';
import { UserX, AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAuth } from '../../features/auth/AuthContext';

interface BlockConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUserId: string;
  targetUserName: string;
  onBlocked?: () => void;
}

export const BlockConfirmModal: React.FC<BlockConfirmModalProps> = ({
  isOpen,
  onClose,
  targetUserId,
  targetUserName,
  onBlocked,
}) => {
  const { token } = useAuth();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || loading) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/moderation/blocks/${targetUserId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to block user.');
      }

      if (onBlocked) {
        onBlocked();
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while blocking user.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Block ${targetUserName}`}
      maxWidth="480px"
    >
      <form onSubmit={handleBlock} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: '#fffbeb',
            borderRadius: '8px',
            border: '1px solid #fde68a',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}
        >
          <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: 1.5 }}>
            <strong>Mutual Invisibility Policy:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              <li>Neither of you will see each other's published rides.</li>
              <li>Neither of you can book seats with each other.</li>
              <li>Messaging between you will be locked.</li>
              <li>Alerts will not match rides involving either party.</li>
            </ul>
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
            }}
          >
            {errorMsg}
          </div>
        )}

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
            Optional Reason (Private note for your reference)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Inappropriate conduct, repeated cancellations..."
            className="input"
            style={{ width: '100%' }}
            maxLength={255}
            disabled={loading}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Blocking...
              </>
            ) : (
              <>
                <UserX size={16} /> Block User
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
