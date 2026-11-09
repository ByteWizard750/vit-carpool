import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  MapPin,
  Navigation,
  UserCheck,
  UserX,
  ExternalLink,
  IndianRupee,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { InboxTabs } from '../components/navigation/InboxTabs';
import { useAuth } from '../features/auth/AuthContext';
import { NotificationResponseDto } from '@vit-carpool/contracts';

type FilterType = 'ALL' | 'BOOKINGS' | 'RIDES';

export const NotificationsPage: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationResponseDto[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [chatUnreadCount, setChatUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const pendingReadsRef = useRef<Set<string>>(new Set());

  // Fetch unread count for Chat so InboxTabs shows live count for both tabs
  const fetchChatUnread = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/chat/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.unreadCount === 'number') {
          setChatUnreadCount(data.unreadCount);
        }
      }
    } catch {
      // Non-critical, ignore
    }
  }, [token]);

  const fetchNotifications = useCallback(
    async (isSilent = false) => {
      if (!token) return;
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await fetch('/api/notifications?limit=50', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load notifications (status ${res.status})`);
        }

        const data = await res.json();
        const list: NotificationResponseDto[] = data.notifications || [];
        setNotifications(list);

        const calculatedUnread =
          typeof data.unreadCount === 'number'
            ? data.unreadCount
            : typeof data.pagination?.unreadCount === 'number'
            ? data.pagination.unreadCount
            : list.filter((n) => !n.isRead).length;

        setUnreadCount(calculatedUnread);
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
    fetchChatUnread();
  }, [fetchNotifications, fetchChatUnread]);

  // Periodic polling every 15s and on window focus
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetchNotifications(true);
      fetchChatUnread();
    }, 15000);

    const handleFocus = () => {
      fetchNotifications(true);
      fetchChatUnread();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [token, fetchNotifications, fetchChatUnread]);

  const handleMarkAsRead = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!token) return;
      if (pendingReadsRef.current.has(id)) return;

      pendingReadsRef.current.add(id);

      // Optimistic UI update: immediately mark read and decrement unread badge
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const res = await fetch(`/api/notifications/${id}/read`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          pendingReadsRef.current.delete(id);
          fetchNotifications(true);
        }
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
        pendingReadsRef.current.delete(id);
        fetchNotifications(true);
      }
    },
    [token, fetchNotifications],
  );

  const handleOpenNotification = useCallback(
    (notif: NotificationResponseDto, targetHref?: string) => {
      if (!notif.isRead) {
        handleMarkAsRead(notif.id);
      }
      if (targetHref) {
        navigate(targetHref);
      }
    },
    [handleMarkAsRead, navigate],
  );

  const handleMarkAllAsRead = async () => {
    if (!token || unreadCount === 0) return;

    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    setActionLoadingId('all');

    try {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        fetchNotifications(true);
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
      fetchNotifications(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token) return;

    // Optimistic removal
    const target = notifications.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (target && !target.isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        fetchNotifications(true);
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
      fetchNotifications(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatRelativeTime = (isoDate: string): { relative: string; full: string } => {
    try {
      const date = new Date(isoDate);
      const now = Date.now();
      const diffMs = now - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      const full = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);

      if (diffSec < 45) return { relative: 'Just now', full };
      if (diffMin < 60) return { relative: `${diffMin}m ago`, full };
      if (diffHour < 24) return { relative: `${diffHour}h ago`, full };
      if (diffDay === 1) return { relative: 'Yesterday', full };
      if (diffDay < 7) return { relative: `${diffDay}d ago`, full };

      return {
        relative: new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: 'numeric',
          month: 'short',
        }).format(date),
        full,
      };
    } catch {
      return { relative: isoDate, full: isoDate };
    }
  };

  const getTypeMeta = (notif: NotificationResponseDto) => {
    const isBoardingConfirmed = notif.title?.toLowerCase().includes('boarding');

    switch (notif.type) {
      case 'BOOKING_REQUESTED':
        return {
          icon: <UserCheck size={18} color="#d97706" />,
          bg: '#fffbeb',
          border: '#fde68a',
          badgeText: 'Booking Request',
          badgeColor: '#92400e',
          primaryActionText: 'Review in Dashboard',
          primaryActionHref: '/dashboard',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      case 'BOOKING_APPROVED':
        if (isBoardingConfirmed) {
          return {
            icon: <CheckCircle2 size={18} color="#16a34a" />,
            bg: '#f0fdf4',
            border: '#bbf7d0',
            badgeText: 'Boarded',
            badgeColor: '#166534',
            primaryActionText: 'Track Ride',
            primaryActionHref: notif.rideId ? `/rides/${notif.rideId}/track` : '/bookings',
            primaryActionIcon: <Navigation size={13} />,
          };
        }
        return {
          icon: <CheckCircle2 size={18} color="#16a34a" />,
          bg: '#f0fdf4',
          border: '#bbf7d0',
          badgeText: 'Booking Approved',
          badgeColor: '#166534',
          primaryActionText: 'View Booking & OTP',
          primaryActionHref: '/bookings',
          primaryActionIcon: <Ticket size={13} />,
          secondaryActionText: notif.rideId ? 'Live Tracking' : undefined,
          secondaryActionHref: notif.rideId ? `/rides/${notif.rideId}/track` : undefined,
        };
      case 'BOOKING_REJECTED':
        return {
          icon: <XCircle size={18} color="#dc2626" />,
          bg: '#fef2f2',
          border: '#fecaca',
          badgeText: 'Booking Declined',
          badgeColor: '#991b1b',
          primaryActionText: 'Find Alternative Rides',
          primaryActionHref: '/rides',
          primaryActionIcon: <Car size={13} />,
        };
      case 'BOOKING_CANCELLED':
        return {
          icon: <UserX size={18} color="#475569" />,
          bg: '#f8fafc',
          border: '#e2e8f0',
          badgeText: 'Booking Cancelled',
          badgeColor: '#334155',
          primaryActionText: 'Manage Ride',
          primaryActionHref: '/dashboard',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      case 'DRIVER_APPROACHING':
        return {
          icon: <Car size={18} color="#4f46e5" />,
          bg: '#eef2ff',
          border: '#c7d2fe',
          badgeText: 'Driver Approaching',
          badgeColor: '#3730a3',
          primaryActionText: 'Open Live Tracking',
          primaryActionHref: notif.rideId ? `/rides/${notif.rideId}/track` : '/dashboard',
          primaryActionIcon: <Navigation size={13} />,
        };
      case 'DRIVER_ARRIVED':
        return {
          icon: <MapPin size={18} color="#7c3aed" />,
          bg: '#f5f3ff',
          border: '#ddd6fe',
          badgeText: 'Driver At Pickup',
          badgeColor: '#5b21b6',
          primaryActionText: 'Show Boarding Pass',
          primaryActionHref: '/bookings',
          primaryActionIcon: <Ticket size={13} />,
          secondaryActionText: notif.rideId ? 'Open Map' : undefined,
          secondaryActionHref: notif.rideId ? `/rides/${notif.rideId}/track` : undefined,
        };
      case 'RIDE_STARTED':
        return {
          icon: <Navigation size={18} color="#2563eb" />,
          bg: '#eff6ff',
          border: '#bfdbfe',
          badgeText: 'Ride En Route',
          badgeColor: '#1d4ed8',
          primaryActionText: 'Open Live Tracking',
          primaryActionHref: notif.rideId ? `/rides/${notif.rideId}/track` : '/dashboard',
          primaryActionIcon: <Navigation size={13} />,
        };
      case 'RIDE_COMPLETED':
        return {
          icon: <Check size={18} color="#059669" />,
          bg: '#ecfdf5',
          border: '#a7f3d0',
          badgeText: 'Trip Completed',
          badgeColor: '#065f46',
          primaryActionText: 'View Trip Summary',
          primaryActionHref: '/bookings',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      case 'RIDE_CANCELLED':
        return {
          icon: <AlertTriangle size={18} color="#e11d48" />,
          bg: '#fff1f2',
          border: '#fecdd3',
          badgeText: 'Ride Cancelled',
          badgeColor: '#9f1239',
          primaryActionText: 'Find Another Ride',
          primaryActionHref: '/rides',
          primaryActionIcon: <Car size={13} />,
        };
      case 'RIDE_MATCH':
        return {
          icon: <Sparkles size={18} color="#0d9488" />,
          bg: '#f0fdfa',
          border: '#99f6e4',
          badgeText: 'Ride Match',
          badgeColor: '#115e59',
          primaryActionText: 'View Available Ride',
          primaryActionHref: '/rides',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      case 'CAB_FARE_UPDATED':
        return {
          icon: <IndianRupee size={18} color="#d97706" />,
          bg: '#fffbeb',
          border: '#fde68a',
          badgeText: 'Cab Fare Updated',
          badgeColor: '#92400e',
          primaryActionText: 'Review & Acknowledge',
          primaryActionHref: '/bookings?tab=passenger',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      case 'CAB_BOOKING_DEADLINE':
        return {
          icon: <Clock size={18} color="#0284c7" />,
          bg: '#f0f9ff',
          border: '#bae6fd',
          badgeText: 'Booking Cutoff',
          badgeColor: '#0369a1',
          primaryActionText: 'View Cab Share',
          primaryActionHref: notif.rideId ? `/rides` : '/rides',
          primaryActionIcon: <ArrowRight size={13} />,
        };
      default:
        return {
          icon: <Bell size={18} color="#2563eb" />,
          bg: '#eff6ff',
          border: '#bfdbfe',
          badgeText: 'Update',
          badgeColor: '#1d4ed8',
          primaryActionText: 'View Details',
          primaryActionHref: notif.rideId ? `/rides` : '/dashboard',
          primaryActionIcon: <ArrowRight size={13} />,
        };
    }
  };

  const filteredNotifications = useMemo(() => {
    switch (filter) {
      case 'BOOKINGS':
        return notifications.filter((n) =>
          [
            'BOOKING_REQUESTED',
            'BOOKING_APPROVED',
            'BOOKING_REJECTED',
            'BOOKING_CANCELLED',
            'CAB_FARE_UPDATED',
          ].includes(n.type),
        );
      case 'RIDES':
        return notifications.filter((n) =>
          [
            'RIDE_MATCH',
            'RIDE_STARTED',
            'DRIVER_APPROACHING',
            'DRIVER_ARRIVED',
            'RIDE_COMPLETED',
            'RIDE_CANCELLED',
            'CAB_BOOKING_DEADLINE',
          ].includes(n.type),
        );
      case 'ALL':
      default:
        return notifications;
    }
  }, [notifications, filter]);

  return (
    <PageShell width="content">
      <PageHeader
        title="Updates"
        description="Real-time notifications for ride requests, driver approvals, boarding passes, and live tracking."
        tabs={<InboxTabs counts={{ messages: chatUnreadCount, notifications: unreadCount }} />}
        action={
          unreadCount > 0 ? (
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
          ) : undefined
        }
      />

      {/* Filter Chips Bar & Refresh Action */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '2px',
            maxWidth: '100%',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          className="scrollbar-none"
        >
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              border: '1px solid',
              borderColor: filter === 'ALL' ? 'var(--brand-blue, #2340b8)' : 'var(--border-subtle, #e5e7eb)',
              backgroundColor: filter === 'ALL' ? 'var(--brand-blue, #2340b8)' : '#ffffff',
              color: filter === 'ALL' ? '#ffffff' : 'var(--text-secondary, #475569)',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            id="filter-all-btn"
          >
            <span>All Updates</span>
            <span
              style={{
                fontSize: '0.75rem',
                padding: '1px 6px',
                borderRadius: '9999px',
                backgroundColor: filter === 'ALL' ? 'rgba(255, 255, 255, 0.25)' : '#f1f5f9',
                color: filter === 'ALL' ? '#ffffff' : 'var(--text-muted, #64748b)',
              }}
            >
              {notifications.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('BOOKINGS')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              border: '1px solid',
              borderColor: filter === 'BOOKINGS' ? 'var(--brand-blue, #2340b8)' : 'var(--border-subtle, #e5e7eb)',
              backgroundColor: filter === 'BOOKINGS' ? 'var(--brand-blue, #2340b8)' : '#ffffff',
              color: filter === 'BOOKINGS' ? '#ffffff' : 'var(--text-secondary, #475569)',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            id="filter-bookings-btn"
          >
            Requests & Bookings
          </button>

          <button
            type="button"
            onClick={() => setFilter('RIDES')}
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              border: '1px solid',
              borderColor: filter === 'RIDES' ? 'var(--brand-blue, #2340b8)' : 'var(--border-subtle, #e5e7eb)',
              backgroundColor: filter === 'RIDES' ? 'var(--brand-blue, #2340b8)' : '#ffffff',
              color: filter === 'RIDES' ? '#ffffff' : 'var(--text-secondary, #475569)',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            id="filter-rides-btn"
          >
            Rides & Tracking
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNotifications(true)}
            disabled={loading || refreshing}
            title="Refresh updates"
            style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}
            aria-label="Refresh updates"
            id="refresh-notifications-btn"
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
          </Button>
        </div>
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

      {/* Loading Skeleton */}
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
          <Loader2 size={32} className="spin" color="var(--brand-blue, #2340b8)" />
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>Checking for updates...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredNotifications.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '56px 24px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px dashed var(--border-medium, #cbd5e1)',
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
              color: 'var(--text-secondary, #64748b)',
            }}
          >
            <Bell size={26} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {filter === 'BOOKINGS'
              ? 'No Booking Updates'
              : filter === 'RIDES'
              ? 'No Ride Tracking Updates'
              : 'No Updates Yet'}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: '0.875rem',
              color: 'var(--text-secondary)',
              maxWidth: '440px',
              lineHeight: 1.5,
            }}
          >
            When a passenger requests to join your ride, or when your driver approves or updates your trip, alerts will appear right here.
          </p>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/rides">
              <Button variant="primary" size="sm" leftIcon={<Car size={15} />}>
                Find Rides
              </Button>
            </Link>
            <Link to="/offer-ride">
              <Button variant="outline" size="sm" leftIcon={<Sparkles size={15} />}>
                Offer a Ride
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Notifications List */}
      {!loading && filteredNotifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredNotifications.map((notif) => {
            const meta = getTypeMeta(notif);
            const timeMeta = formatRelativeTime(notif.createdAt);
            const isActionLoading = actionLoadingId === notif.id;

            return (
              <div
                key={notif.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest('button') || target.closest('a')) {
                    return;
                  }
                  if (meta.primaryActionHref) {
                    handleOpenNotification(notif, meta.primaryActionHref);
                  } else if (!notif.isRead) {
                    handleMarkAsRead(notif.id);
                  }
                }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '16px 18px',
                  backgroundColor: notif.isRead ? '#ffffff' : '#f8fbff',
                  border: notif.isRead
                    ? '1px solid var(--border-subtle, #e2e8f0)'
                    : '1px solid #bfdbfe',
                  borderLeft: notif.isRead
                    ? '1px solid var(--border-subtle, #e2e8f0)'
                    : '4px solid var(--brand-blue, #2340b8)',
                  borderRadius: '14px',
                  boxShadow: notif.isRead
                    ? '0 1px 2px rgba(0, 0, 0, 0.03)'
                    : '0 2px 8px -2px rgba(35, 64, 184, 0.08)',
                  cursor: meta.primaryActionHref ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                className="notification-item"
                id={`notification-card-${notif.id}`}
              >
                {/* Visual Icon */}
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: meta.bg,
                    border: `1px solid ${meta.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {meta.icon}
                </div>

                {/* Content Area */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Category Pill, NEW badge, and Timestamp */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: meta.bg,
                          color: meta.badgeColor,
                          border: `1px solid ${meta.border}`,
                        }}
                      >
                        {meta.badgeText}
                      </span>

                      {!notif.isRead && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '9999px',
                            backgroundColor: 'var(--brand-blue, #2340b8)',
                            color: '#ffffff',
                            letterSpacing: '0.02em',
                          }}
                        >
                          NEW
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted, #64748b)',
                      }}
                      title={timeMeta.full}
                    >
                      <Clock size={12} />
                      <span>{timeMeta.relative}</span>
                    </div>
                  </div>

                  {/* Notification Title */}
                  <h4
                    style={{
                      margin: '0 0 4px',
                      fontSize: '0.9375rem',
                      fontWeight: notif.isRead ? 600 : 700,
                      color: 'var(--text-primary)',
                      lineHeight: 1.3,
                    }}
                  >
                    {notif.title}
                  </h4>

                  {/* Notification Message */}
                  <p
                    style={{
                      margin: '0 0 12px',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary, #475569)',
                      lineHeight: 1.45,
                    }}
                  >
                    {notif.message}
                  </p>

                  {/* Contextual Action Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    {/* Primary & Secondary Nav Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {meta.primaryActionHref && (
                        <Link
                          to={meta.primaryActionHref}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'var(--brand-subtle, #eef3ff)',
                            color: 'var(--brand-blue, #2340b8)',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            transition: 'all 0.15s ease',
                          }}
                          className="hover-brand-blue"
                          onClick={() => {
                            if (!notif.isRead) {
                              handleMarkAsRead(notif.id);
                            }
                          }}
                          id={`notif-action-btn-${notif.id}`}
                        >
                          <span>{meta.primaryActionText}</span>
                          {meta.primaryActionIcon}
                        </Link>
                      )}

                      {meta.secondaryActionHref && (
                        <Link
                          to={meta.secondaryActionHref}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            borderRadius: '8px',
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary, #475569)',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            textDecoration: 'none',
                          }}
                          onClick={() => {
                            if (!notif.isRead) {
                              handleMarkAsRead(notif.id);
                            }
                          }}
                          id={`notif-action-btn-${notif.id}`}
                        >
                          <span>{meta.secondaryActionText}</span>
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </div>

                    {/* Quick Tools: Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNotification(notif.id, e);
                        }}
                        disabled={isActionLoading}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '5px 7px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: 'transparent',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease, background-color 0.15s ease',
                        }}
                        title="Delete notification"
                        id={`delete-notif-btn-${notif.id}`}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = '#ef4444';
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#fef2f2';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }}
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
