import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Search,
  Loader2,
  Car,
  Calendar,
  RefreshCw,
  Users,
  UserCheck,
  Activity,
  BarChart3,
  HeartPulse,
  Settings,
  UserPlus,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../features/auth/AuthContext';
import {
  ReportResponseDto,
  AdminUserSummaryDto,
  AdminRideSummaryDto,
  AdminBookingSummaryDto,
  AdminOverviewStatsDto,
  AdminAnalyticsDto,
  AdminSystemHealthDto,
  AdminUserItemDto,
  AdminInvitationItemDto,
} from '@vit-carpool/contracts';

type AdminTab =
  | 'overview'
  | 'users'
  | 'rides'
  | 'bookings'
  | 'safety'
  | 'verifications'
  | 'audit'
  | 'analytics'
  | 'health'
  | 'team'
  | 'settings';

export const AdminDashboardPage: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Permission checks based on user role
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdminOrSuper = user?.role === 'ADMIN' || isSuperAdmin;

  // Global feedback notification
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  // ---------------------------------------------------------------------------
  // Tab 1: Overview State
  // ---------------------------------------------------------------------------
  const [overviewStats, setOverviewStats] = useState<
    (AdminOverviewStatsDto & { recentActivity: any[]; recentRegistrations: any[] }) | null
  >(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  const fetchOverview = useCallback(async () => {
    if (!token) return;
    setLoadingOverview(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOverviewStats(data);
      }
    } catch {
      showFeedback('error', 'Failed to load operational overview metrics.');
    } finally {
      setLoadingOverview(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Tab 2: Users Management State
  // ---------------------------------------------------------------------------
  const [users, setUsers] = useState<AdminUserSummaryDto[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('ALL');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummaryDto | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [submittingSuspension, setSubmittingSuspension] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [moderationNoteText, setModerationNoteText] = useState('');

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (userSearchTerm.trim()) params.append('search', userSearchTerm.trim());
      if (userStatusFilter !== 'ALL') params.append('status', userStatusFilter);
      if (userRoleFilter !== 'ALL') params.append('role', userRoleFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch users list.');
    } finally {
      setLoadingUsers(false);
    }
  }, [token, userSearchTerm, userStatusFilter, userRoleFilter]);

  const handleSuspendUser = async () => {
    if (!selectedUser || !suspensionReason.trim() || !token) return;
    setSubmittingSuspension(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: suspensionReason.trim() }),
      });
      if (res.ok) {
        showFeedback('success', `User account ${selectedUser.email} has been suspended.`);
        setSuspendModalOpen(false);
        setSuspensionReason('');
        fetchUsers();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to suspend user.');
      }
    } catch {
      showFeedback('error', 'Network error during account suspension.');
    } finally {
      setSubmittingSuspension(false);
    }
  };

  const handleReinstateUser = async (targetUser: AdminUserSummaryDto) => {
    if (!token) return;
    if (!window.confirm(`Are you sure you want to reinstate account ${targetUser.email}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/reinstate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showFeedback('success', `User account ${targetUser.email} successfully reinstated.`);
        fetchUsers();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to reinstate user.');
      }
    } catch {
      showFeedback('error', 'Network error during reinstatement.');
    }
  };

  const handleAddModerationNote = async () => {
    if (!selectedUser || !moderationNoteText.trim() || !token) return;
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: selectedUser.id,
          content: moderationNoteText.trim(),
        }),
      });
      if (res.ok) {
        showFeedback('success', 'Internal moderation note saved.');
        setNoteModalOpen(false);
        setModerationNoteText('');
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to save note.');
      }
    } catch {
      showFeedback('error', 'Network error saving moderation note.');
    }
  };

  // ---------------------------------------------------------------------------
  // Tab 3: Rides Oversight State
  // ---------------------------------------------------------------------------
  const [rides, setRides] = useState<AdminRideSummaryDto[]>([]);
  const [rideStatusFilter, setRideStatusFilter] = useState('ALL');
  const [rideSearchTerm, setRideSearchTerm] = useState('');
  const [loadingRides, setLoadingRides] = useState(false);
  const [cancelRideModalOpen, setCancelRideModalOpen] = useState(false);
  const [selectedRide, setSelectedRide] = useState<AdminRideSummaryDto | null>(null);
  const [cancelRideReason, setCancelRideReason] = useState('');
  const [submittingCancelRide, setSubmittingCancelRide] = useState(false);

  const fetchRides = useCallback(async () => {
    if (!token) return;
    setLoadingRides(true);
    try {
      const params = new URLSearchParams();
      if (rideSearchTerm.trim()) params.append('search', rideSearchTerm.trim());
      if (rideStatusFilter !== 'ALL') params.append('status', rideStatusFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/admin/rides?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRides(data.rides || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch rides.');
    } finally {
      setLoadingRides(false);
    }
  }, [token, rideSearchTerm, rideStatusFilter]);

  const handleCancelRide = async () => {
    if (!selectedRide || !cancelRideReason.trim() || !token) return;
    setSubmittingCancelRide(true);
    try {
      const res = await fetch(`/api/admin/rides/${selectedRide.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: cancelRideReason.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        showFeedback(
          'success',
          `Ride cancelled. ${data.cancelledBookingsCount || 0} active booking(s) cancelled and notified.`,
        );
        setCancelRideModalOpen(false);
        setCancelRideReason('');
        fetchRides();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to cancel ride.');
      }
    } catch {
      showFeedback('error', 'Network error during ride cancellation.');
    } finally {
      setSubmittingCancelRide(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Tab 4: Bookings Oversight State
  // ---------------------------------------------------------------------------
  const [bookings, setBookings] = useState<AdminBookingSummaryDto[]>([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [bookingSearchTerm, setBookingSearchTerm] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!token) return;
    setLoadingBookings(true);
    try {
      const params = new URLSearchParams();
      if (bookingSearchTerm.trim()) params.append('search', bookingSearchTerm.trim());
      if (bookingStatusFilter !== 'ALL') params.append('status', bookingStatusFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/admin/bookings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch platform bookings.');
    } finally {
      setLoadingBookings(false);
    }
  }, [token, bookingSearchTerm, bookingStatusFilter]);

  // ---------------------------------------------------------------------------
  // Tab 5: Trust & Safety (Reports) State
  // ---------------------------------------------------------------------------
  const [reports, setReports] = useState<ReportResponseDto[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState('ALL');
  const [reportCategoryFilter, setReportCategoryFilter] = useState('ALL');
  const [loadingReports, setLoadingReports] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportResponseDto | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  const fetchReports = useCallback(async () => {
    if (!token) return;
    setLoadingReports(true);
    try {
      const params = new URLSearchParams();
      if (reportStatusFilter !== 'ALL') params.append('status', reportStatusFilter);
      if (reportCategoryFilter !== 'ALL') params.append('category', reportCategoryFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/admin/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch incident reports queue.');
    } finally {
      setLoadingReports(false);
    }
  }, [token, reportStatusFilter, reportCategoryFilter]);

  const handleInvestigateReport = async (reportId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/investigate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showFeedback('success', 'Report marked as UNDER INVESTIGATION.');
        fetchReports();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to update report status.');
      }
    } catch {
      showFeedback('error', 'Network error.');
    }
  };

  const handleResolveReport = async () => {
    if (!selectedReport || !resolutionNotes.trim() || !token) return;
    setSubmittingResolve(true);
    try {
      const res = await fetch(`/api/admin/reports/${selectedReport.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: resolveStatus,
          resolutionNotes: resolutionNotes.trim(),
        }),
      });
      if (res.ok) {
        showFeedback(
          'success',
          `Report marked as ${resolveStatus}. Audit record recorded.`,
        );
        setResolveModalOpen(false);
        setResolutionNotes('');
        fetchReports();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to resolve report.');
      }
    } catch {
      showFeedback('error', 'Network error resolving report.');
    } finally {
      setSubmittingResolve(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Tab 6: Audit Logs State
  // ---------------------------------------------------------------------------
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [loadingAudit, setLoadingAudit] = useState(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!token) return;
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      if (auditActionFilter.trim()) params.append('search', auditActionFilter.trim());
      params.append('limit', '50');

      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch audit log trail.');
    } finally {
      setLoadingAudit(false);
    }
  }, [token, auditActionFilter]);

  // ---------------------------------------------------------------------------
  // Tab 7: Analytics State
  // ---------------------------------------------------------------------------
  const [analytics, setAnalytics] = useState<AdminAnalyticsDto | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      showFeedback('error', 'Failed to load operational analytics.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Tab 8: System Health State
  // ---------------------------------------------------------------------------
  const [health, setHealth] = useState<AdminSystemHealthDto | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  const fetchHealth = useCallback(async () => {
    if (!token) return;
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/admin/health', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      showFeedback('error', 'Failed to fetch system diagnostics.');
    } finally {
      setLoadingHealth(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Tab 9: Team & Admin Invitations (SUPER_ADMIN)
  // ---------------------------------------------------------------------------
  const [administrators, setAdministrators] = useState<AdminUserItemDto[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<AdminInvitationItemDto[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'>('MODERATOR');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    if (!token || !isSuperAdmin) return;
    setLoadingTeam(true);
    try {
      const res = await fetch('/api/admin/administrators', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdministrators(data.administrators || []);
        setPendingInvitations(data.pendingInvitations || []);
      }
    } catch {
      showFeedback('error', 'Failed to fetch administrator team.');
    } finally {
      setLoadingTeam(false);
    }
  }, [token, isSuperAdmin]);

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !token) return;
    setSubmittingInvite(true);
    try {
      const res = await fetch('/api/admin/administrators/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      if (res.ok) {
        const data = await res.json();
        const link = `${window.location.origin}/admin/login?invite=${data.inviteToken}`;
        setGeneratedInviteLink(link);
        showFeedback('success', `Single-use invitation generated for ${data.email}.`);
        fetchTeam();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to create invitation.');
      }
    } catch {
      showFeedback('error', 'Network error.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleRevokeAdmin = async (adminItem: AdminUserItemDto) => {
    if (!token) return;
    const reason = window.prompt(
      `Revoke administrator privileges for ${adminItem.email}? Enter explicit justification (min 5 characters):`,
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) alert('A justification of at least 5 characters is required.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/administrators/${adminItem.id}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (res.ok) {
        showFeedback('success', `Administrator privileges revoked for ${adminItem.email}.`);
        fetchTeam();
      } else {
        const err = await res.json();
        showFeedback('error', err.message || 'Failed to revoke administrator.');
      }
    } catch {
      showFeedback('error', 'Network error.');
    }
  };

  // Trigger data fetch on tab switch
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    else if (activeTab === 'users' || activeTab === 'verifications') fetchUsers();
    else if (activeTab === 'rides') fetchRides();
    else if (activeTab === 'bookings') fetchBookings();
    else if (activeTab === 'safety') fetchReports();
    else if (activeTab === 'audit') fetchAuditLogs();
    else if (activeTab === 'analytics') fetchAnalytics();
    else if (activeTab === 'health') fetchHealth();
    else if (activeTab === 'team' && isSuperAdmin) fetchTeam();
  }, [
    activeTab,
    fetchOverview,
    fetchUsers,
    fetchRides,
    fetchBookings,
    fetchReports,
    fetchAuditLogs,
    fetchAnalytics,
    fetchHealth,
    fetchTeam,
    isSuperAdmin,
  ]);

  return (
    <div className="admin-layout-wrapper">
      {/* ── Sidebar Navigation ──────────────────────────────────────────────── */}
      <aside className="admin-sidebar">
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff', margin: 0 }}>
                Campus Moderation &amp; Trust Console
              </h1>
              <div
                style={{
                  fontSize: '0.7rem',
                  color:
                    user?.role === 'SUPER_ADMIN'
                      ? '#fbbf24'
                      : user?.role === 'ADMIN'
                        ? '#60a5fa'
                        : '#34d399',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                {user?.role} • Operations Centre
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
          <div
            className="admin-nav-category-header"
            style={{
              fontSize: '0.675rem',
              fontWeight: 700,
              color: '#64748b',
              padding: '6px 12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Operations
          </div>
          {[
            { id: 'overview', label: 'Overview', icon: <Activity size={18} /> },
            { id: 'verifications', label: 'ID Verification Queue', icon: <UserCheck size={18} /> },
            { id: 'safety', label: 'Incident & Safety Reports', icon: <ShieldAlert size={18} /> },
            { id: 'users', label: 'User Management & Suspension', icon: <Users size={18} /> },
            { id: 'rides', label: 'Rides Oversight', icon: <Car size={18} /> },
            { id: 'bookings', label: 'Bookings Oversight', icon: <Calendar size={18} /> },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as AdminTab)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === item.id ? '#2563eb' : 'transparent',
                color: activeTab === item.id ? '#ffffff' : '#94a3b8',
                fontWeight: activeTab === item.id ? 600 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: '2px',
                transition: 'all 0.15s ease',
              }}
              id={`tab-admin-${item.id}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

          {isAdminOrSuper && (
            <>
              <div
                className="admin-nav-category-header"
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 700,
                  color: '#64748b',
                  padding: '14px 12px 6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Governance &amp; Audit
              </div>
              {[
                { id: 'audit', label: 'Activity Logs', icon: <FileText size={18} /> },
                { id: 'analytics', label: 'Operational Analytics', icon: <BarChart3 size={18} /> },
                { id: 'health', label: 'System Health', icon: <HeartPulse size={18} /> },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTab === item.id ? '#2563eb' : 'transparent',
                    color: activeTab === item.id ? '#ffffff' : '#94a3b8',
                    fontWeight: activeTab === item.id ? 600 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: '2px',
                  }}
                  id={`tab-admin-${item.id}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </>
          )}

          {isSuperAdmin && (
            <>
              <div
                className="admin-nav-category-header"
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 700,
                  color: '#64748b',
                  padding: '14px 12px 6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Administration
              </div>
              {[
                { id: 'team', label: 'Administrator Team', icon: <UserPlus size={18} /> },
                { id: 'settings', label: 'Security & Policies', icon: <Settings size={18} /> },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as AdminTab)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: activeTab === item.id ? '#2563eb' : 'transparent',
                    color: activeTab === item.id ? '#ffffff' : '#94a3b8',
                    fontWeight: activeTab === item.id ? 600 : 500,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    marginBottom: '2px',
                  }}
                  id={`tab-admin-${item.id}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </>
          )}
        </nav>

        {/* User Footer Profile */}
        <div style={{ padding: '16px 14px', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#f8fafc',
              }}
            >
              {user?.fullName?.charAt(0) || 'A'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.fullName}
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.email}
              </div>
            </div>
            <button
              onClick={() => logout()}
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '4px',
              }}
              title="Sign Out"
            >
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Dashboard Workspace ────────────────────────────────────────── */}
      <main className="admin-workspace">
        {/* Action feedback alert banner */}
        {actionFeedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              backgroundColor:
                actionFeedback.type === 'success'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${
                actionFeedback.type === 'success' ? '#22c55e' : '#ef4444'
              }`,
              color: actionFeedback.type === 'success' ? '#86efac' : '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Operational Overview
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Database-backed platform metrics, recent registrations, and activity logs.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOverview}
                disabled={loadingOverview}
                leftIcon={<RefreshCw size={14} className={loadingOverview ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {loadingOverview && !overviewStats ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <span>Aggregating operational metrics...</span>
              </div>
            ) : overviewStats ? (
              <div>
                {/* Metric Cards Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px',
                    marginBottom: '28px',
                  }}
                >
                  {[
                    {
                      label: 'Total Registered Users',
                      value: overviewStats.totalUsers,
                      sub: `${overviewStats.studentUsers} Students • ${overviewStats.facultyUsers} Faculty`,
                      icon: <Users size={20} color="#60a5fa" />,
                    },
                    {
                      label: 'Published Rides',
                      value: overviewStats.totalRides,
                      sub: `${overviewStats.activeRides} Active • ${overviewStats.completedRides} Completed`,
                      icon: <Car size={20} color="#34d399" />,
                    },
                    {
                      label: 'Bookings Requested',
                      value: overviewStats.totalBookings,
                      sub: `${overviewStats.confirmedBookings} Confirmed`,
                      icon: <Calendar size={20} color="#a78bfa" />,
                    },
                    {
                      label: 'Open Safety Reports',
                      value: overviewStats.openReports,
                      sub: `${overviewStats.suspendedUsers} Suspended Accounts`,
                      icon: <ShieldAlert size={20} color="#f87171" />,
                    },
                  ].map((card, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '18px 20px',
                        backgroundColor: '#1e293b',
                        borderRadius: '12px',
                        border: '1px solid #334155',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>
                          {card.label}
                        </span>
                        {card.icon}
                      </div>
                      <div
                        style={{
                          fontSize: '1.75rem',
                          fontWeight: 700,
                          color: '#ffffff',
                          marginBottom: '4px',
                        }}
                      >
                        {card.value}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{card.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Split Panel: Recent Registrations & Recent Activity */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                    gap: '20px',
                  }}
                >
                  {/* Recent Registrations */}
                  <div
                    style={{
                      padding: '20px',
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      border: '1px solid #334155',
                    }}
                  >
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '14px' }}>
                      Recent Community Registrations
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {overviewStats.recentRegistrations.map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            backgroundColor: '#0f172a',
                            borderRadius: '8px',
                            border: '1px solid #334155',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                              {u.fullName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                u.audience === 'FACULTY' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                              color: u.audience === 'FACULTY' ? '#c084fc' : '#93c5fd',
                            }}
                          >
                            {u.audience || 'STUDENT'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Audit Activity */}
                  <div
                    style={{
                      padding: '20px',
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      border: '1px solid #334155',
                    }}
                  >
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '14px' }}>
                      Recent Administrative Actions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {overviewStats.recentActivity.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            backgroundColor: '#0f172a',
                            borderRadius: '8px',
                            border: '1px solid #334155',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
                              {a.action}
                            </div>
                            <div style={{ fontSize: '0.725rem', color: '#64748b' }}>
                              Target: {a.targetType} • {new Date(a.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.675rem',
                              fontWeight: 700,
                              color: '#94a3b8',
                            }}
                          >
                            {a.actorRole || 'SYSTEM'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── TAB 2: USERS DIRECTORY ────────────────────────────────────────── */}
        {(activeTab === 'users' || activeTab === 'verifications') && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  {activeTab === 'verifications'
                    ? 'ID Verification Queue & User Management'
                    : 'User Directory & Moderation'}
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Search users, review verification statuses, inspect reports history, and manage suspensions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchUsers}
                disabled={loadingUsers}
                leftIcon={<RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {/* Filter Controls */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                <input
                  type="text"
                  placeholder="Search user by name or email..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <Search
                  size={16}
                  style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }}
                />
              </div>

              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="VERIFIED">Verified</option>
                <option value="PENDING">Pending</option>
                <option value="SUSPENDED">Suspended</option>
              </select>

              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Roles</option>
                <option value="USER">User</option>
                <option value="MODERATOR">Moderator</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>

            {/* Users Table */}
            <div className="admin-table-container">
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>USER</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>COHORT</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ROLE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>REPORTS</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>JOINED</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading users...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No users matching criteria.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.875rem' }}>
                            {u.fullName}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                u.audience === 'FACULTY' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                              color: u.audience === 'FACULTY' ? '#c084fc' : '#93c5fd',
                            }}
                          >
                            {u.audience || 'STUDENT'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: u.isSuspended
                                ? 'rgba(239, 68, 68, 0.2)'
                                : u.verificationStatus === 'VERIFIED'
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : 'rgba(234, 179, 8, 0.2)',
                              color: u.isSuspended
                                ? '#f87171'
                                : u.verificationStatus === 'VERIFIED'
                                  ? '#4ade80'
                                  : '#facc15',
                            }}
                          >
                            {u.isSuspended ? 'SUSPENDED' : u.verificationStatus}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {u.role}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {u.reportsCount || 0}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(u);
                                setNoteModalOpen(true);
                              }}
                            >
                              Note
                            </Button>
                            {u.isSuspended ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReinstateUser(u)}
                              >
                                Reinstate
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(u);
                                  setSuspendModalOpen(true);
                                }}
                              >
                                Suspend
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: RIDES OVERSIGHT ─────────────────────────────────────────── */}
        {activeTab === 'rides' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Platform Rides Oversight
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Monitor published commutes, driver vehicles, passenger bookings, and intervene when required.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRides}
                disabled={loadingRides}
                leftIcon={<RefreshCw size={14} className={loadingRides ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search by origin, destination, or driver..."
                  value={rideSearchTerm}
                  onChange={(e) => setRideSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <Search
                  size={16}
                  style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }}
                />
              </div>

              <select
                value={rideStatusFilter}
                onChange={(e) => setRideStatusFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Ride Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Rides Table */}
            <div className="admin-table-container">
              <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ROUTE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>DEPARTURE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>DRIVER</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>VEHICLE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>SEATS</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>STATUS</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRides ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading rides...
                      </td>
                    </tr>
                  ) : rides.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No platform rides found.
                      </td>
                    </tr>
                  ) : (
                    rides.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.85rem' }}>
                            {r.origin} &rarr; {r.destination}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {r.bookingsCount} booking(s) • {r.reportsCount} report(s)
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {new Date(r.departureTime).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.825rem' }}>
                            {r.driver.fullName}
                          </div>
                          <div style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{r.driver.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {r.vehicle ? `${r.vehicle.make} ${r.vehicle.model} (${r.vehicle.registrationNumber})` : 'Cab Share (External)'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {r.availableSeats} / {r.totalSeats}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                r.status === 'SCHEDULED'
                                  ? 'rgba(59, 130, 246, 0.2)'
                                  : r.status === 'COMPLETED'
                                    ? 'rgba(34, 197, 94, 0.2)'
                                    : 'rgba(239, 68, 68, 0.2)',
                              color:
                                r.status === 'SCHEDULED'
                                  ? '#93c5fd'
                                  : r.status === 'COMPLETED'
                                    ? '#86efac'
                                    : '#fca5a5',
                            }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {r.status === 'SCHEDULED' && (
                            <Button
                              variant="danger"
                              size="sm"
                              id={`btn-cancel-ride-${r.id}`}
                              onClick={() => {
                                setSelectedRide(r);
                                setCancelRideModalOpen(true);
                              }}
                            >
                              Cancel Ride
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: BOOKINGS OVERSIGHT ──────────────────────────────────────── */}
        {activeTab === 'bookings' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Bookings Oversight
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Cross-cohort passenger bookings, requested seats, and boarding verification states.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBookings}
                disabled={loadingBookings}
                leftIcon={<RefreshCw size={14} className={loadingBookings ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search by passenger or driver name..."
                  value={bookingSearchTerm}
                  onChange={(e) => setBookingSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <Search
                  size={16}
                  style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }}
                />
              </div>

              <select
                value={bookingStatusFilter}
                onChange={(e) => setBookingStatusFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Booking Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            {/* Bookings Table */}
            <div className="admin-table-container">
              <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>PASSENGER</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>DRIVER</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ROUTE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>SEATS</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>BOOKING</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>BOARDING</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBookings ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading bookings...
                      </td>
                    </tr>
                  ) : bookings.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No bookings matching criteria.
                      </td>
                    </tr>
                  ) : (
                    bookings.map((b) => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.85rem' }}>
                            {b.passenger.fullName}
                          </div>
                          <div style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{b.passenger.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.85rem' }}>
                            {b.driver.fullName}
                          </div>
                          <div style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{b.driver.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '0.825rem', color: '#cbd5e1' }}>
                            {b.ride.origin} &rarr; {b.ride.destination}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.825rem', color: '#cbd5e1' }}>
                          {b.requestedSeats} seat(s)
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                b.status === 'CONFIRMED'
                                  ? 'rgba(34, 197, 94, 0.2)'
                                  : b.status === 'PENDING'
                                    ? 'rgba(234, 179, 8, 0.2)'
                                    : 'rgba(239, 68, 68, 0.2)',
                              color:
                                b.status === 'CONFIRMED'
                                  ? '#4ade80'
                                  : b.status === 'PENDING'
                                    ? '#facc15'
                                    : '#f87171',
                            }}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {b.boardingStatus}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: TRUST & SAFETY (REPORTS) ───────────────────────────────── */}
        {activeTab === 'safety' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Trust &amp; Safety Incident Triage
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Investigate, review evidence, assign moderators, and resolve filed safety reports.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchReports}
                disabled={loadingReports}
                leftIcon={<RefreshCw size={14} className={loadingReports ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#94a3b8' }}>
                <span>Report Status:</span>
                <select
                  value={reportStatusFilter}
                  onChange={(e) => setReportStatusFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    backgroundColor: '#1e293b',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="INVESTIGATING">Investigating</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </label>

              <select
                value={reportCategoryFilter}
                onChange={(e) => setReportCategoryFilter(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="SAFETY_CONCERN">Safety Concern</option>
                <option value="HARASSMENT">Harassment</option>
                <option value="NO_SHOW">No Show</option>
                <option value="FRAUD">Fraud</option>
                <option value="FARE_DISPUTE">Fare Dispute</option>
                <option value="INAPPROPRIATE_BEHAVIOR">Inappropriate Behavior</option>
                <option value="SPAM">Spam</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Reports List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {loadingReports ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading incident reports queue...
                </div>
              ) : reports.length === 0 ? (
                <div
                  style={{
                    padding: '40px',
                    textAlign: 'center',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                  }}
                >
                  No open incident reports. Platform Trust &amp; Safety queue is clear.
                </div>
              ) : (
                reports.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '18px 20px',
                      backgroundColor: '#1e293b',
                      borderRadius: '12px',
                      border: '1px solid #334155',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              r.category === 'SAFETY_CONCERN' || r.category === 'HARASSMENT'
                                ? 'rgba(239, 68, 68, 0.2)'
                                : 'rgba(234, 179, 8, 0.2)',
                            color:
                              r.category === 'SAFETY_CONCERN' || r.category === 'HARASSMENT'
                                ? '#f87171'
                                : '#facc15',
                          }}
                        >
                          {r.category.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              r.status === 'PENDING'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : r.status === 'INVESTIGATING'
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(34, 197, 94, 0.15)',
                            color:
                              r.status === 'PENDING'
                                ? '#fca5a5'
                                : r.status === 'INVESTIGATING'
                                  ? '#93c5fd'
                                  : '#86efac',
                          }}
                        >
                          {r.status}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.9rem', color: '#e2e8f0', marginBottom: '12px', lineHeight: '1.5' }}>
                      {r.description}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: '#94a3b8',
                        paddingTop: '10px',
                        borderTop: '1px solid #334155',
                      }}
                    >
                      <div>
                        Reporter: <strong style={{ color: '#ffffff' }}>{r.reporter?.fullName}</strong> ({r.reporter?.email})
                        {r.reportedUser && (
                          <span style={{ marginLeft: '12px' }}>
                            Reported:{' '}
                            <strong style={{ color: '#f87171' }}>{r.reportedUser.fullName}</strong>
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        {r.status === 'PENDING' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleInvestigateReport(r.id)}
                          >
                            Investigate
                          </Button>
                        )}
                        {(r.status === 'PENDING' || r.status === 'INVESTIGATING') && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedReport(r);
                              setResolveModalOpen(true);
                            }}
                          >
                            Resolve / Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── TAB 6: AUDIT TRAIL ─────────────────────────────────────────────── */}
        {activeTab === 'audit' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Durable Activity &amp; Audit Logs
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Append-only immutable record of administrative actions, suspensions, and privilege changes.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Filter by action or details..."
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#f8fafc',
                    fontSize: '0.85rem',
                    width: '240px',
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAuditLogs}
                  disabled={loadingAudit}
                  leftIcon={<RefreshCw size={14} className={loadingAudit ? 'animate-spin' : ''} />}
                >
                  Filter / Refresh
                </Button>
              </div>
            </div>

            <div className="admin-table-container">
              <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>TIMESTAMP</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ACTION</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ACTOR</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>TARGET</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>CHANGES</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAudit ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading audit logs...
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No audit records recorded.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((l) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(l.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              fontSize: '0.725rem',
                              fontWeight: 700,
                              color: '#60a5fa',
                              fontFamily: 'monospace',
                            }}
                          >
                            {l.action}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          {l.actorRole || 'SYSTEM'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                          {l.targetType}:{l.targetId?.slice(0, 8)}...
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: 'monospace',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {JSON.stringify(l.changes)}
                          </pre>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 7: OPERATIONAL ANALYTICS ─────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Operational Analytics
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Cohort distribution, booking conversion rate, and 30-day publishing trends.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAnalytics}
                disabled={loadingAnalytics}
                leftIcon={<RefreshCw size={14} className={loadingAnalytics ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {analytics ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div
                  style={{
                    padding: '24px',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                  }}
                >
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
                    Campus Cohort Breakdown
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
                    Enforced boundary between student and faculty carpooling pools.
                  </p>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ flex: 1, padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Student Pool</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa' }}>
                        {analytics.cohortDistribution.students}
                      </div>
                    </div>
                    <div style={{ flex: 1, padding: '16px', backgroundColor: '#0f172a', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Faculty Pool</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c084fc' }}>
                        {analytics.cohortDistribution.faculty}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: '24px',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                  }}
                >
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
                    Booking Conversion Rate
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '16px' }}>
                    Percentage of seat reservation requests approved and confirmed by drivers.
                  </p>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: 700,
                      color: '#4ade80',
                      marginBottom: '8px',
                    }}
                  >
                    {analytics.bookingConversionRate}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Based on confirmed versus total requested bookings across both cohorts.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── TAB 8: SYSTEM HEALTH ─────────────────────────────────────────── */}
        {activeTab === 'health' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Platform System Health
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Live diagnostics across database, email transport, storage, and WebSockets.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchHealth}
                disabled={loadingHealth}
                leftIcon={<RefreshCw size={14} className={loadingHealth ? 'animate-spin' : ''} />}
              >
                Refresh
              </Button>
            </div>

            {health ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    padding: '18px 20px',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>OVERALL PLATFORM STATUS</div>
                    <div
                      style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        color: health.overallStatus === 'HEALTHY' ? '#4ade80' : '#facc15',
                      }}
                    >
                      {health.overallStatus}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>System Uptime</div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                      {Math.floor(health.uptimeSeconds / 60)} minutes
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {Object.entries(health.components).map(([key, comp]) => (
                    <div
                      key={key}
                      style={{
                        padding: '16px 18px',
                        backgroundColor: '#1e293b',
                        borderRadius: '12px',
                        border: '1px solid #334155',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong style={{ textTransform: 'capitalize', color: '#ffffff' }}>
                          {key.replace(/([A-Z])/g, ' $1')}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              comp.status === 'HEALTHY'
                                ? 'rgba(34, 197, 94, 0.2)'
                                : 'rgba(234, 179, 8, 0.2)',
                            color: comp.status === 'HEALTHY' ? '#4ade80' : '#facc15',
                          }}
                        >
                          {comp.status}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '6px' }}>
                        {comp.message}
                      </div>
                      {comp.latencyMs !== undefined && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Latency: {comp.latencyMs}ms
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ── TAB 9: ADMINISTRATOR TEAM (SUPER_ADMIN ONLY) ────────────────── */}
        {activeTab === 'team' && isSuperAdmin && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                  Administrator Team &amp; Invitations
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                  Provision single-use invitations, review active staff roles, and manage revocations.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setInviteModalOpen(true);
                    setGeneratedInviteLink(null);
                  }}
                  leftIcon={<UserPlus size={14} />}
                  id="btn-invite-admin"
                >
                  Invite Administrator
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchTeam}
                  disabled={loadingTeam}
                  leftIcon={<RefreshCw size={14} className={loadingTeam ? 'animate-spin' : ''} />}
                >
                  Refresh
                </Button>
              </div>
            </div>

            {/* Administrators Table */}
            <div className="admin-table-container" style={{ marginBottom: '28px' }}>
              <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>STAFF MEMBER</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ROLE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>LAST ACTIVE</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>CREATED</th>
                    <th style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {administrators.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.85rem' }}>
                          {a.fullName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.email}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              a.role === 'SUPER_ADMIN'
                                ? 'rgba(251, 191, 36, 0.2)'
                                : a.role === 'ADMIN'
                                  ? 'rgba(59, 130, 246, 0.2)'
                                  : 'rgba(52, 211, 153, 0.2)',
                            color:
                              a.role === 'SUPER_ADMIN'
                                ? '#fbbf24'
                                : a.role === 'ADMIN'
                                  ? '#60a5fa'
                                  : '#34d399',
                          }}
                        >
                          {a.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                        {a.lastActiveAt ? new Date(a.lastActiveAt).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {a.id !== user?.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRevokeAdmin(a)}
                          >
                            Revoke Access
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pending Invitations Table */}
            {pendingInvitations.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '12px' }}>
                  Pending Single-Use Invitations ({pendingInvitations.length})
                </h3>
                <div className="admin-table-container">
                  <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', backgroundColor: '#0f172a' }}>
                        <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>INVITED EMAIL</th>
                        <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>ASSIGNED ROLE</th>
                        <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>EXPIRES IN</th>
                        <th style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>INVITED BY</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvitations.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #334155' }}>
                          <td style={{ padding: '10px 16px', fontSize: '0.85rem', color: '#ffffff' }}>
                            {inv.email}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                            {inv.role}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#facc15' }}>
                            {new Date(inv.expiresAt).toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            {inv.inviter?.fullName}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 10: SETTINGS & POLICIES ───────────────────────────────────── */}
        {activeTab === 'settings' && isSuperAdmin && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff' }}>
                Platform Security Policies &amp; Settings
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Enforced authentication parameters and Trust &amp; Safety configurations.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                maxWidth: '680px',
              }}
            >
              {[
                {
                  title: 'Two-Factor Authentication (MFA)',
                  status: 'Enforced',
                  desc: 'Mandatory 6-digit cryptographic challenge required for all administrative accounts.',
                },
                {
                  title: 'Administrative Session Expiry',
                  status: 'Active (7 Days)',
                  desc: 'Tokens expire after 7 days and can be immediately revoked by demoting or suspending an administrator.',
                },
                {
                  title: 'Single-Use Invitations',
                  status: 'Active (48h TTL)',
                  desc: 'All admin invitations expire in 48 hours and cannot be accepted more than once.',
                },
                {
                  title: 'Audit Logging Invariance',
                  status: 'Append-Only',
                  desc: 'Audit logs cannot be updated or deleted via application APIs.',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '18px 20px',
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.9rem' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                      {item.desc}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(34, 197, 94, 0.2)',
                      color: '#4ade80',
                    }}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Suspend User Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={suspendModalOpen}
        onClose={() => setSuspendModalOpen(false)}
        title="Suspend User Account"
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
            Suspending <strong>{selectedUser?.fullName}</strong> ({selectedUser?.email}) will immediately
            lock their ability to publish rides, book seats, or send messages.
          </p>

          <label
            htmlFor="suspension-reason"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}
          >
            Mandatory Suspension Justification (min 5 chars)
          </label>
          <textarea
            id="suspension-reason"
            rows={3}
            value={suspensionReason}
            onChange={(e) => setSuspensionReason(e.target.value)}
            placeholder="e.g. Repeated safety complaints and non-compliance with Trust Charter."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              outline: 'none',
              marginBottom: '16px',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="outline" size="md" onClick={() => setSuspendModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              id="confirm-suspend-btn"
              onClick={handleSuspendUser}
              disabled={submittingSuspension || suspensionReason.trim().length < 5}
              leftIcon={submittingSuspension ? <Loader2 size={16} className="animate-spin" /> : undefined}
            >
              Confirm Suspension
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Cancel Ride Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={cancelRideModalOpen}
        onClose={() => setCancelRideModalOpen(false)}
        title="Administratively Cancel Ride"
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
            Cancelling this ride from <strong>{selectedRide?.origin}</strong> to{' '}
            <strong>{selectedRide?.destination}</strong> will cancel all active bookings and notify the driver
            and all booked passengers.
          </p>

          <label
            htmlFor="cancel-ride-reason"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}
          >
            Mandatory Cancellation Reason (min 5 chars)
          </label>
          <textarea
            id="cancel-ride-reason"
            rows={3}
            value={cancelRideReason}
            onChange={(e) => setCancelRideReason(e.target.value)}
            placeholder="e.g. Unregistered vehicle reported or driver unavailable."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              outline: 'none',
              marginBottom: '16px',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="outline" size="md" onClick={() => setCancelRideModalOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              size="md"
              id="confirm-cancel-ride-btn"
              onClick={handleCancelRide}
              disabled={submittingCancelRide || cancelRideReason.trim().length < 5}
              leftIcon={submittingCancelRide ? <Loader2 size={16} className="animate-spin" /> : undefined}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Resolve Report Modal ────────────────────────────────────────────── */}
      <Modal
        isOpen={resolveModalOpen}
        onClose={() => setResolveModalOpen(false)}
        title="Finalize Incident Report"
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
            Provide conclusive investigation notes before resolving or dismissing this report.
          </p>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <Button
              variant={resolveStatus === 'RESOLVED' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setResolveStatus('RESOLVED')}
            >
              Action Taken (RESOLVED)
            </Button>
            <Button
              variant={resolveStatus === 'DISMISSED' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setResolveStatus('DISMISSED')}
            >
              Invalid / Non-actionable (DISMISSED)
            </Button>
          </div>

          <label
            htmlFor="resolution-notes"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}
          >
            Resolution Notes (min 5 chars)
          </label>
          <textarea
            id="resolution-notes"
            rows={3}
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="e.g. Spoke to both participants. Formal warning issued to reported user."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              outline: 'none',
              marginBottom: '16px',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="outline" size="md" onClick={() => setResolveModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleResolveReport}
              disabled={submittingResolve || resolutionNotes.trim().length < 5}
              leftIcon={submittingResolve ? <Loader2 size={16} className="animate-spin" /> : undefined}
            >
              Submit Resolution
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Invite Administrator Modal (SUPER_ADMIN) ───────────────────────── */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Platform Administrator"
      >
        <form onSubmit={handleInviteAdmin} style={{ padding: '8px 0' }}>
          {generatedInviteLink ? (
            <div>
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid #22c55e',
                  borderRadius: '8px',
                  color: '#15803d',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                Single-use invitation link created! Copy and securely share it with the administrator:
              </div>
              <input
                type="text"
                readOnly
                value={generatedInviteLink}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  marginBottom: '16px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="primary" size="md" onClick={() => setInviteModalOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="invite-admin-email"
                  style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}
                >
                  Administrator Institutional Email
                </label>
                <input
                  id="invite-admin-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="prof.ramanathan@vit.ac.in"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="invite-admin-role"
                  style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}
                >
                  Assigned Administrative Role
                </label>
                <select
                  id="invite-admin-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                >
                  <option value="MODERATOR">MODERATOR (Review verifications, reports, warnings)</option>
                  <option value="ADMIN">ADMIN (Full operations, suspensions, ride restrictions)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Full governance, invitations, team management)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="outline" size="md" onClick={() => setInviteModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={submittingInvite || !inviteEmail.trim()}
                  leftIcon={submittingInvite ? <Loader2 size={16} className="animate-spin" /> : undefined}
                >
                  Generate Invitation
                </Button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* ── Internal Moderation Note Modal ──────────────────────────────────── */}
      <Modal
        isOpen={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        title="Add Internal Moderation Note"
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
            Internal notes are only visible to authorized administrators and moderators. They are never exposed
            to students or faculty.
          </p>

          <textarea
            rows={4}
            value={moderationNoteText}
            onChange={(e) => setModerationNoteText(e.target.value)}
            placeholder="Document phone contact, warning context, or campus safety review notes..."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              outline: 'none',
              marginBottom: '16px',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button variant="outline" size="md" onClick={() => setNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleAddModerationNote}
              disabled={moderationNoteText.trim().length < 3}
            >
              Save Note
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
