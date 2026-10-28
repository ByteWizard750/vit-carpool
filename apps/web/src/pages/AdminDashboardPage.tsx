import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Search,
  Loader2,
  Car,
  MessageSquare,
  RefreshCw,
  User,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { useAuth } from '../features/auth/AuthContext';
import {
  VerificationRequestStatus,
  ReportResponseDto,
  AdminUserSummaryDto,
} from '@vit-carpool/contracts';

interface VerificationRequestItem {
  id: string;
  userId: string;
  requestedAudience: 'STUDENT' | 'FACULTY';
  institutionalEmail: string;
  status: VerificationRequestStatus;
  idCardDocumentPath?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    verificationStatus: string;
    audience: string | null;
  };
}

export const AdminDashboardPage: React.FC = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'verifications' | 'reports' | 'users'>('verifications');

  // ---------------------------------------------------------------------------
  // Tab 1: Verification Requests State
  // ---------------------------------------------------------------------------
  const [verifications, setVerifications] = useState<VerificationRequestItem[]>([]);
  const [verifFilter, setVerifFilter] = useState<string>('PENDING');
  const [loadingVerif, setLoadingVerif] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedVerif, setSelectedVerif] = useState<VerificationRequestItem | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // ---------------------------------------------------------------------------
  // Tab 2: Incident Reports State
  // ---------------------------------------------------------------------------
  const [reports, setReports] = useState<ReportResponseDto[]>([]);
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('ALL');
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>('ALL');
  const [loadingReports, setLoadingReports] = useState(false);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportResponseDto | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submittingResolve, setSubmittingResolve] = useState(false);

  // ---------------------------------------------------------------------------
  // Tab 3: User Management State
  // ---------------------------------------------------------------------------
  const [users, setUsers] = useState<AdminUserSummaryDto[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('ALL');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummaryDto | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [submittingSuspension, setSubmittingSuspension] = useState(false);

  // Global action message
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // Fetch Functions
  // ---------------------------------------------------------------------------
  const fetchVerifications = useCallback(async () => {
    if (!token) return;
    setLoadingVerif(true);
    try {
      const url =
        verifFilter === 'ALL'
          ? '/admin/verification-requests'
          : `/admin/verification-requests?status=${verifFilter}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVerifications(data);
      }
    } catch {
      showFeedback('error', 'Failed to load verification requests.');
    } finally {
      setLoadingVerif(false);
    }
  }, [token, verifFilter]);

  const fetchReports = useCallback(async () => {
    if (!token) return;
    setLoadingReports(true);
    try {
      const params = new URLSearchParams();
      if (reportStatusFilter !== 'ALL') params.append('status', reportStatusFilter);
      if (reportCategoryFilter !== 'ALL') params.append('category', reportCategoryFilter);
      const res = await fetch(`/admin/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch {
      showFeedback('error', 'Failed to load safety reports.');
    } finally {
      setLoadingReports(false);
    }
  }, [token, reportStatusFilter, reportCategoryFilter]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (userSearchTerm.trim()) params.append('search', userSearchTerm.trim());
      if (userStatusFilter !== 'ALL') params.append('status', userStatusFilter);
      const res = await fetch(`/admin/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      showFeedback('error', 'Failed to search users.');
    } finally {
      setLoadingUsers(false);
    }
  }, [token, userSearchTerm, userStatusFilter]);

  useEffect(() => {
    if (activeTab === 'verifications') fetchVerifications();
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'users') fetchUsers();
  }, [activeTab, fetchVerifications, fetchReports, fetchUsers]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedVerif) return;
    setSubmittingReview(true);
    try {
      const res = await fetch(`/admin/verification-requests/${selectedVerif.id}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: reviewAction,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || 'Review failed.');
      }
      showFeedback('success', `Verification request ${reviewAction.toLowerCase()} successfully.`);
      setReviewModalOpen(false);
      setReviewNotes('');
      fetchVerifications();
    } catch (err: any) {
      showFeedback('error', err.message || 'Error resolving request.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleInvestigateReport = async (reportId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/admin/reports/${reportId}/investigate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showFeedback('success', 'Report marked as under investigation.');
        fetchReports();
      }
    } catch {
      showFeedback('error', 'Failed to update report status.');
    }
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedReport) return;
    if (resolutionNotes.trim().length < 5) {
      showFeedback('error', 'Resolution notes must be at least 5 characters.');
      return;
    }
    setSubmittingResolve(true);
    try {
      const res = await fetch(`/admin/reports/${selectedReport.id}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: resolveStatus,
          resolutionNotes: resolutionNotes.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || 'Failed to resolve report.');
      }
      showFeedback('success', `Report successfully marked as ${resolveStatus.toLowerCase()}.`);
      setResolveModalOpen(false);
      setResolutionNotes('');
      fetchReports();
    } catch (err: any) {
      showFeedback('error', err.message || 'Error resolving report.');
    } finally {
      setSubmittingResolve(false);
    }
  };

  const handleSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedUser) return;
    if (suspensionReason.trim().length < 5) {
      showFeedback('error', 'Suspension reason must be at least 5 characters.');
      return;
    }
    setSubmittingSuspension(true);
    try {
      const res = await fetch(`/admin/users/${selectedUser.id}/suspend`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: suspensionReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || 'Suspension failed.');
      }
      showFeedback('success', `Account for ${selectedUser.fullName} has been suspended.`);
      setSuspendModalOpen(false);
      setSuspensionReason('');
      fetchUsers();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to suspend account.');
    } finally {
      setSubmittingSuspension(false);
    }
  };

  const handleReinstate = async (targetUser: AdminUserSummaryDto) => {
    if (!token) return;
    if (!window.confirm(`Are you sure you want to reinstate access for ${targetUser.fullName}?`)) {
      return;
    }
    try {
      const res = await fetch(`/admin/users/${targetUser.id}/reinstate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.message || 'Reinstatement failed.');
      }
      showFeedback('success', `Account for ${targetUser.fullName} has been reinstated.`);
      fetchUsers();
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to reinstate account.');
    }
  };

  return (
    <div className="container" style={{ padding: '36px 16px 80px', maxWidth: '1100px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={22} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Campus Moderation & Trust Console
            </h1>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
            Authorize institutional student/faculty verifications, resolve safety reports, and manage campus account standing.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (activeTab === 'verifications') fetchVerifications();
            if (activeTab === 'reports') fetchReports();
            if (activeTab === 'users') fetchUsers();
          }}
          leftIcon={<RefreshCw size={14} />}
        >
          Refresh Console
        </Button>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: actionFeedback.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: actionFeedback.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${actionFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          {actionFeedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* Console Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-light)',
          marginBottom: '28px',
        }}
      >
        <button
          onClick={() => setActiveTab('verifications')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'verifications' ? 'var(--color-brand-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'verifications' ? '2px solid var(--color-brand-600)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <UserCheck size={18} />
          ID Verification Queue
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'reports' ? 'var(--color-brand-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'reports' ? '2px solid var(--color-brand-600)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <ShieldAlert size={18} />
          Incident & Safety Reports
        </button>

        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            color: activeTab === 'users' ? 'var(--color-brand-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === 'users' ? '2px solid var(--color-brand-600)' : '2px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <User size={18} />
          User Management & Suspension
        </button>
      </div>

      {/* =====================================================================
          TAB 1: ID VERIFICATION QUEUE
          ===================================================================== */}
      {activeTab === 'verifications' && (
        <div>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Status Filter:
            </span>
            {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((s) => (
              <button
                key={s}
                onClick={() => setVerifFilter(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: verifFilter === s ? 'var(--color-brand-600)' : 'var(--border-light)',
                  backgroundColor: verifFilter === s ? 'var(--color-brand-50)' : '#ffffff',
                  color: verifFilter === s ? 'var(--color-brand-700)' : 'var(--text-secondary)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {loadingVerif ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={32} className="animate-spin" color="var(--color-brand-600)" />
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.9rem' }}>
                Loading verification requests...
              </p>
            </div>
          ) : verifications.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
              }}
            >
              <UserCheck size={44} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                No verification requests found
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                The verification queue is clear for the selected filter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {verifications.map((v) => (
                <div
                  key={v.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid var(--border-light)',
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {v.user?.fullName || v.institutionalEmail}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: v.requestedAudience === 'FACULTY' ? '#f3e8ff' : '#dbeafe',
                          color: v.requestedAudience === 'FACULTY' ? '#6b21a8' : '#1d4ed8',
                        }}
                      >
                        {v.requestedAudience}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor:
                            v.status === 'APPROVED'
                              ? '#dcfce7'
                              : v.status === 'REJECTED'
                              ? '#fee2e2'
                              : '#fef3c7',
                          color:
                            v.status === 'APPROVED'
                              ? '#166534'
                              : v.status === 'REJECTED'
                              ? '#991b1b'
                              : '#854d0e',
                        }}
                      >
                        {v.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Institutional Email: <strong>{v.institutionalEmail}</strong>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Submitted: {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v.createdAt))}
                      {v.reviewNotes && ` • Notes: ${v.reviewNotes}`}
                    </div>
                  </div>

                  {v.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setSelectedVerif(v);
                          setReviewAction('APPROVED');
                          setReviewModalOpen(true);
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setSelectedVerif(v);
                          setReviewAction('REJECTED');
                          setReviewModalOpen(true);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: INCIDENT & SAFETY REPORTS
          ===================================================================== */}
      {activeTab === 'reports' && (
        <div>
          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Report Status:
              </span>
              {['ALL', 'PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setReportStatusFilter(st)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: reportStatusFilter === st ? 'var(--color-brand-600)' : 'var(--border-light)',
                    backgroundColor: reportStatusFilter === st ? 'var(--color-brand-50)' : '#ffffff',
                    color: reportStatusFilter === st ? 'var(--color-brand-700)' : 'var(--text-secondary)',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Category:
              </span>
              <select
                value={reportCategoryFilter}
                onChange={(e) => setReportCategoryFilter(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: '#ffffff',
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="SAFETY_CONCERN">Safety Concern</option>
                <option value="HARASSMENT">Harassment</option>
                <option value="NO_SHOW">No Show</option>
                <option value="FRAUD">Fraud</option>
                <option value="FARE_DISPUTE">Fare Dispute</option>
                <option value="SPAM">Spam</option>
                <option value="INAPPROPRIATE_BEHAVIOR">Inappropriate Behavior</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          {loadingReports ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={32} className="animate-spin" color="var(--color-brand-600)" />
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.9rem' }}>
                Loading incident reports...
              </p>
            </div>
          ) : reports.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
              }}
            >
              <ShieldAlert size={44} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                No incident reports found
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                No safety or policy complaints match the current filter.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {reports.map((r) => (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid var(--border-light)',
                    padding: '22px 24px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor:
                              r.category === 'SAFETY_CONCERN' || r.category === 'HARASSMENT'
                                ? '#fee2e2'
                                : '#fef3c7',
                            color:
                              r.category === 'SAFETY_CONCERN' || r.category === 'HARASSMENT'
                                ? '#991b1b'
                                : '#854d0e',
                          }}
                        >
                          {r.category.replace('_', ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            backgroundColor:
                              r.status === 'RESOLVED'
                                ? '#dcfce7'
                                : r.status === 'INVESTIGATING'
                                ? '#e0f2fe'
                                : r.status === 'DISMISSED'
                                ? '#f3f4f6'
                                : '#fef3c7',
                            color:
                              r.status === 'RESOLVED'
                                ? '#166534'
                                : r.status === 'INVESTIGATING'
                                ? '#0369a1'
                                : r.status === 'DISMISSED'
                                ? '#4b5563'
                                : '#854d0e',
                          }}
                        >
                          {r.status}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Filed: {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.createdAt))}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Reported User: <strong>{r.reportedUser?.fullName || 'N/A'}</strong> ({r.reportedUser?.email})
                        {r.reportedUser?.isSuspended && (
                          <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>
                            [SUSPENDED]
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                        Reporter: <strong>{r.reporter?.fullName}</strong> ({r.reporter?.email})
                      </div>
                    </div>

                    {/* Report Resolution Controls */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {r.status === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInvestigateReport(r.id)}
                        >
                          Investigate
                        </Button>
                      )}
                      {(r.status === 'PENDING' || r.status === 'INVESTIGATING') && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => {
                              setSelectedReport(r);
                              setResolveStatus('RESOLVED');
                              setResolveModalOpen(true);
                            }}
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedReport(r);
                              setResolveStatus('DISMISSED');
                              setResolveModalOpen(true);
                            }}
                          >
                            Dismiss
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Description Box */}
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: 'var(--bg-muted, #f8fafc)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-light)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.5,
                      marginBottom: '12px',
                    }}
                  >
                    <strong>Allegation:</strong> {r.description}
                  </div>

                  {/* Context snippet if ride or message */}
                  {r.ride && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Car size={14} /> Linked Ride: {r.ride.origin} → {r.ride.destination} (Departed: {new Intl.DateTimeFormat('en-IN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.ride.departureTime))})
                    </div>
                  )}
                  {r.message && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <MessageSquare size={14} /> Message snippet: "{r.message.content}"
                    </div>
                  )}
                  {r.resolutionNotes && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: '#166534',
                      }}
                    >
                      <strong>Resolution Notes:</strong> {r.resolutionNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: USER MANAGEMENT & SUSPENSION
          ===================================================================== */}
      {activeTab === 'users' && (
        <div>
          {/* Search & Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
              <input
                type="text"
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                placeholder="Search user by name or email..."
                className="input"
                style={{ width: '100%', paddingLeft: '36px' }}
              />
              <Search
                size={18}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>

            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              className="input"
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="ALL">All Accounts</option>
              <option value="ACTIVE">Active Only</option>
              <option value="SUSPENDED">Suspended Only</option>
            </select>
          </div>

          {loadingUsers ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={32} className="animate-spin" color="var(--color-brand-600)" />
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.9rem' }}>
                Searching campus directory...
              </p>
            </div>
          ) : users.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid var(--border-light)',
              }}
            >
              <User size={44} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                No users found
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                Try adjusting your search criteria.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {users.map((u) => (
                <div
                  key={u.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid var(--border-light)',
                    padding: '18px 22px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {u.fullName}
                      </h4>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: u.role === 'ADMIN' ? '#fef3c7' : '#f1f5f9',
                          color: u.role === 'ADMIN' ? '#b45309' : '#475569',
                        }}
                      >
                        {u.role}
                      </span>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: u.isSuspended ? '#fee2e2' : '#dcfce7',
                          color: u.isSuspended ? '#991b1b' : '#166534',
                        }}
                      >
                        {u.isSuspended ? 'SUSPENDED' : 'ACTIVE'}
                      </span>
                      {u.reportsCount && u.reportsCount > 0 ? (
                        <span
                          style={{
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                          }}
                        >
                          {u.reportsCount} {u.reportsCount === 1 ? 'Report' : 'Reports'}
                        </span>
                      ) : null}
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {u.email} {u.audience ? `• ${u.audience}` : ''} • Verification: {u.verificationStatus}
                    </div>

                    {u.isSuspended && u.suspensionReason && (
                      <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: '4px' }}>
                        <strong>Reason:</strong> {u.suspensionReason}
                      </div>
                    )}
                  </div>

                  {/* Suspension & Actions */}
                  <div>
                    {u.id !== user?.id && (
                      <>
                        {u.isSuspended ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleReinstate(u)}
                          >
                            Reinstate Account
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setSelectedUser(u);
                              setSuspendModalOpen(true);
                            }}
                          >
                            Suspend Account
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL: Verification Review
          ===================================================================== */}
      {selectedVerif && (
        <Modal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title={`${reviewAction === 'APPROVED' ? 'Approve' : 'Reject'} Verification Request`}
          maxWidth="480px"
        >
          <form onSubmit={handleReviewSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              You are about to <strong>{reviewAction.toLowerCase()}</strong> the campus verification for{' '}
              <strong>{selectedVerif.user?.fullName}</strong> ({selectedVerif.institutionalEmail}) as a{' '}
              <strong>{selectedVerif.requestedAudience}</strong>.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Review Notes (Optional feedback recorded in audit log)
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="e.g. Campus ID matches registrar records..."
                rows={3}
                className="input"
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button type="button" variant="ghost" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={reviewAction === 'APPROVED' ? 'primary' : 'danger'}
                disabled={submittingReview}
              >
                {submittingReview ? <Loader2 size={16} className="animate-spin" /> : `Confirm ${reviewAction}`}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================================================
          MODAL: Resolve Report
          ===================================================================== */}
      {selectedReport && (
        <Modal
          isOpen={resolveModalOpen}
          onClose={() => setResolveModalOpen(false)}
          title={`${resolveStatus === 'RESOLVED' ? 'Resolve' : 'Dismiss'} Safety Report`}
          maxWidth="500px"
        >
          <form onSubmit={handleResolveSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
              Record administrative resolution notes for the <strong>{selectedReport.category}</strong> report filed against{' '}
              <strong>{selectedReport.reportedUser?.fullName || 'the user'}</strong>.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Resolution Notes (Required for audit, min 5 characters)
              </label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Investigated chat logs, warned the member regarding fare guidelines, resolved."
                rows={4}
                className="input"
                style={{ width: '100%', resize: 'vertical' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button type="button" variant="ghost" onClick={() => setResolveModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={resolveStatus === 'RESOLVED' ? 'primary' : 'ghost'}
                disabled={submittingResolve || resolutionNotes.trim().length < 5}
              >
                {submittingResolve ? <Loader2 size={16} className="animate-spin" /> : `Confirm ${resolveStatus}`}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* =====================================================================
          MODAL: Suspend Account
          ===================================================================== */}
      {selectedUser && (
        <Modal
          isOpen={suspendModalOpen}
          onClose={() => setSuspendModalOpen(false)}
          title={`Suspend Account: ${selectedUser.fullName}`}
          maxWidth="480px"
        >
          <form onSubmit={handleSuspendSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#fee2e2',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                fontSize: '0.85rem',
                color: '#991b1b',
              }}
            >
              <strong>Immediate Suspension:</strong> The user will be immediately locked out of ride publication, seat booking, messaging, and alert notifications. Existing active tokens will be rejected.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Reason for Suspension (Required, min 5 characters)
              </label>
              <textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="e.g. Multiple confirmed reckless driving reports, violation of student carpool charter."
                rows={3}
                className="input"
                style={{ width: '100%', resize: 'vertical' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button type="button" variant="ghost" onClick={() => setSuspendModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                disabled={submittingSuspension || suspensionReason.trim().length < 5}
              >
                {submittingSuspension ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Suspension'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
