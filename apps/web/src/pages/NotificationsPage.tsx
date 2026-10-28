import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Check,
  Trash2,
  Car,
  Ticket,
  CheckCircle2,
  AlertCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { InboxTabs } from '../components/navigation/InboxTabs';
import { useAuth } from '../features/auth/AuthContext';
import { NotificationResponseDto } from '@vit-carpool/contracts';

export const NotificationsPage: React.FC = () => {
  const { token } = useAuth();

  const [notifications, setNotifications] = useState<NotificationResponseDto[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(
    async (isSilent = false) => {
      if (!token) return;
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await fetch('/notifications?limit=50', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load notifications (status ${res.status})`);
        }

        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
      } catch (err: any) {
        console.error('Error fetching notifications:', err);
        setError(err.message || 'Failed to load notifications.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token) return;

    setActionLoadingId(id);
    try {
      const res = await fetch(`/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token || unreadCount === 0) return;

    setActionLoadingId('all');
    try {
      const res = await fetch('/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token) return;

    setActionLoadingId(id);
    try {
      const res = await fetch(`/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const deleted = notifications.find((n) => n.id === id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (deleted && !deleted.isRead) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatTimestamp = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return isoDate;
    }
  };

  const getTypeMeta = (type: string) => {
    switch (type) {
      case 'RIDE_MATCH':
        return {
          icon: <Car size={18} color="#059669" />,
          bg: '#ecfdf5',
          border: '#a7f3d0',
          badgeText: 'Ride Match',
          badgeColor: '#065f46',
        };
      case 'BOOKING_REQUESTED':
        return {
          icon: <Ticket size={18} color="#d97706" />,
          bg: '#fffbeb',
          border: '#fde68a',
          badgeText: 'Booking Request',
          badgeColor: '#92400e',
        };
      case 'BOOKING_APPROVED':
        return {
          icon: <CheckCircle2 size={18} color="#16a34a" />,
          bg: '#f0fdf4',
          border: '#bbf7d0',
          badgeText: 'Approved',
          badgeColor: '#166534',
        };
      case 'BOOKING_REJECTED':
        return {
          icon: <AlertCircle size={18} color="#dc2626" />,
          bg: '#fef2f2',
          border: '#fecaca',
          badgeText: 'Declined',
          badgeColor: '#991b1b',
        };
      case 'BOOKING_CANCELLED':
        return {
          icon: <XCircle size={18} color="#475569" />,
          bg: '#f8fafc',
          border: '#e2e8f0',
          badgeText: 'Booking Cancelled',
          badgeColor: '#334155',
        };
      case 'RIDE_CANCELLED':
        return {
          icon: <AlertTriangle size={18} color="#e11d48" />,
          bg: '#fff1f2',
          border: '#fecdd3',
          badgeText: 'Ride Cancelled',
          badgeColor: '#9f1239',
        };
      default:
        return {
          icon: <Bell size={18} color="#4f46e5" />,
          bg: '#eef2ff',
          border: '#c7d2fe',
          badgeText: 'Notification',
          badgeColor: '#3730a3',
        };
    }
  };

  const filteredNotifications =
    filter === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <PageShell width="content">
      <PageHeader
        title="Notifications"
        description="Real-time updates on your ride alerts, booking requests, and commutes."
        tabs={<InboxTabs counts={{ notifications: unreadCount }} />}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchNotifications(true)}
              disabled={loading || refreshing}
              title="Refresh notifications"
            >
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            </Button>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={actionLoadingId === 'all'}
                leftIcon={<CheckCheck size={16} />}
                id="mark-all-read-btn"
              >
                {actionLoadingId === 'all' ? 'Marking...' : 'Mark all as read'}
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid var(--border-medium)',
          paddingBottom: '8px',
        }}
      >
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: filter === 'ALL' ? '#eff6ff' : 'transparent',
            color: filter === 'ALL' ? '#1d4ed8' : 'var(--text-secondary)',
            fontWeight: filter === 'ALL' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          id="filter-all-btn"
        >
          All Notifications ({notifications.length})
        </button>

        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: filter === 'UNREAD' ? '#eff6ff' : 'transparent',
            color: filter === 'UNREAD' ? '#1d4ed8' : 'var(--text-secondary)',
            fontWeight: filter === 'UNREAD' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          id="filter-unread-btn"
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            color: '#991b1b',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => fetchNotifications()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 20px',
            color: 'var(--text-secondary)',
            gap: '12px',
          }}
        >
          <Loader2 size={32} className="spin" color="#3b82f6" />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading notifications...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredNotifications.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 24px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px dashed var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <Bell size={26} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
            {filter === 'UNREAD' ? 'No Unread Notifications' : 'No Notifications Yet'}
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '420px' }}>
            {filter === 'UNREAD'
              ? 'You are all caught up! Switch to "All" to view past notifications.'
              : 'You will receive notifications here when a driver approves your booking, a ride alert matches a newly published ride, or your commute updates.'}
          </p>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
            <Link to="/rides">
              <Button variant="primary" size="sm" leftIcon={<Car size={15} />}>
                Find a Ride
              </Button>
            </Link>
            <Link to="/ride-alerts">
              <Button variant="outline" size="sm" leftIcon={<Sparkles size={15} />}>
                Create Ride Alert
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Notification List */}
      {!loading && filteredNotifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredNotifications.map((notif) => {
            const meta = getTypeMeta(notif.type);
            const isActionLoading = actionLoadingId === notif.id;

            return (
              <div
                key={notif.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '18px 20px',
                  backgroundColor: notif.isRead ? '#ffffff' : '#f8fafc',
                  border: notif.isRead
                    ? '1px solid var(--border-medium)'
                    : '1.5px solid #93c5fd',
                  borderRadius: '14px',
                  boxShadow: notif.isRead ? 'none' : '0 2px 6px rgba(59, 130, 246, 0.08)',
                  transition: 'all 0.15s ease',
                }}
                className="notification-item"
              >
                {/* Unread Accent Dot */}
                {!notif.isRead && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '8px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#3b82f6',
                    }}
                  />
                )}

                {/* Type Icon */}
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    backgroundColor: meta.bg,
                    border: `1px solid ${meta.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {meta.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: meta.bg,
                          color: meta.badgeColor,
                        }}
                      >
                        {meta.badgeText}
                      </span>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '0.95rem',
                          fontWeight: notif.isRead ? 600 : 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {notif.title}
                      </h4>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Clock size={12} />
                      <span>{formatTimestamp(notif.createdAt)}</span>
                    </div>
                  </div>

                  <p
                    style={{
                      margin: '6px 0 12px',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      lineHeight: '1.45',
                    }}
                  >
                    {notif.message}
                  </p>

                  {/* Actions Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      paddingTop: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {notif.rideId && (
                        <Link
                          to={`/rides`}
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#2563eb',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>View Rides</span>
                          <ArrowRight size={13} />
                        </Link>
                      )}

                      {notif.bookingId && (
                        <Link
                          to={`/bookings`}
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#2563eb',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>View Bookings</span>
                          <ArrowRight size={13} />
                        </Link>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {!notif.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          disabled={isActionLoading}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-medium)',
                            backgroundColor: '#ffffff',
                            color: 'var(--text-secondary)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Mark as read"
                        >
                          <Check size={13} color="#16a34a" />
                          <span>Mark Read</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(notif.id, e)}
                        disabled={isActionLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease',
                        }}
                        title="Delete notification"
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
};
