import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  UserX,
  MoreVertical,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { PageShell } from '../components/layout/PageShell';
import { PageHeader } from '../components/common/PageHeader';
import { InboxTabs } from '../components/navigation/InboxTabs';
import { useAuth } from '../features/auth/AuthContext';
import {
  ConversationSummaryDto,
  ConversationDetailDto,
  MessageResponseDto,
} from '@vit-carpool/contracts';
import { ReportModal } from '../components/moderation/ReportModal';
import { BlockConfirmModal } from '../components/moderation/BlockConfirmModal';

export const MessagesPage: React.FC = () => {
  const { user, token } = useAuth();
  const { conversationId: paramConvId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  const bookingIdQuery = searchParams.get('bookingId');
  const navigate = useNavigate();

  // Conversations list state
  const [conversations, setConversations] = useState<ConversationSummaryDto[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Active conversation state
  const [selectedConvId, setSelectedConvId] = useState<string | null>(paramConvId || null);
  const [activeConv, setActiveConv] = useState<ConversationDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Send message state
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Moderation action modals
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll to bottom of message list (scoped exclusively to the chat message container)
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const scrollContainer = document.getElementById('chat-messages-scroll-area');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior,
      });
    }
  };

  // Fetch list of conversations
  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setLoadingList(true);
      setListError(null);

      try {
        const res = await fetch('/chat/conversations', {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(`Failed to load conversations (${res.status})`);
        }

        const data: ConversationSummaryDto[] = await res.json();
        setConversations(data);
      } catch (err: any) {
        if (!silent) setListError(err.message || 'Unable to retrieve messages.');
      } finally {
        if (!silent) setLoadingList(false);
      }
    },
    [token],
  );

  // Fetch active conversation details and messages
  const fetchActiveConversation = useCallback(
    async (id: string, silent = false) => {
      if (!token) return;
      if (!silent) setLoadingDetail(true);
      setDetailError(null);

      try {
        const res = await fetch(`/chat/conversations/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          if (res.status === 401) return;
          throw new Error(`Failed to load chat history (${res.status})`);
        }

        const data: ConversationDetailDto = await res.json();
        setActiveConv((prev) => {
          // If silent polling and messages haven't changed, retain previous state to prevent re-renders
          if (
            prev &&
            prev.id === data.id &&
            prev.messages.length === data.messages.length &&
            prev.messages[prev.messages.length - 1]?.id ===
              data.messages[data.messages.length - 1]?.id &&
            prev.messages[prev.messages.length - 1]?.readAt ===
              data.messages[data.messages.length - 1]?.readAt &&
            prev.isReadOnly === data.isReadOnly
          ) {
            return prev;
          }
          return data;
        });

        // Update unread count in conversations list
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
        );
      } catch (err: any) {
        if (!silent) setDetailError(err.message || 'Unable to load conversation details.');
      } finally {
        if (!silent) setLoadingDetail(false);
      }
    },
    [token],
  );

  // If page was loaded with ?bookingId=..., get or create conversation for that booking
  useEffect(() => {
    if (!token || !bookingIdQuery) return;

    let isMounted = true;
    const loadBookingChat = async () => {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const res = await fetch(`/chat/conversations/booking/${bookingIdQuery}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to initialize ride chat (${res.status})`);
        }

        const data: ConversationDetailDto = await res.json();
        if (isMounted) {
          setSelectedConvId(data.id);
          setActiveConv(data);
          fetchConversations(true);
        }
      } catch (err: any) {
        if (isMounted) setDetailError(err.message || 'Unable to start chat for this booking.');
      } finally {
        if (isMounted) setLoadingDetail(false);
      }
    };

    loadBookingChat();
    return () => {
      isMounted = false;
    };
  }, [bookingIdQuery, token, fetchConversations]);

  // Initial load
  useEffect(() => {
    fetchConversations();
    if (token) {
      fetch('/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => {
          const count = typeof d?.unreadCount === 'number' ? d.unreadCount : typeof d?.count === 'number' ? d.count : 0;
          setNotifUnreadCount(count);
        })
        .catch(() => {});
    }
  }, [fetchConversations, token]);

  // When route param changes or selectedConvId changes
  useEffect(() => {
    if (paramConvId && paramConvId !== selectedConvId) {
      setSelectedConvId(paramConvId);
    } else if (!paramConvId && selectedConvId !== null && !bookingIdQuery) {
      setSelectedConvId(null);
      setActiveConv(null);
    }
  }, [paramConvId, selectedConvId, bookingIdQuery]);

  useEffect(() => {
    if (selectedConvId) {
      window.scrollTo(0, 0);
    }
    if (selectedConvId && !bookingIdQuery) {
      fetchActiveConversation(selectedConvId);
    }
  }, [selectedConvId, fetchActiveConversation, bookingIdQuery]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (activeConv?.messages?.length) {
      scrollToBottom('auto');
    }
  }, [activeConv?.messages?.length]);

  // Polling for new messages every 5 seconds when conversation is open
  useEffect(() => {
    if (!token || !selectedConvId) return;

    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      fetchActiveConversation(selectedConvId, true);
      // Only refresh conversations list every 15s to reduce redundant server traffic
      if (tick % 3 === 0) {
        fetchConversations(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token, selectedConvId, fetchActiveConversation, fetchConversations]);

  // Dynamic auto-expanding textarea change handler
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${Math.max(newHeight, 42)}px`;
    }
  };

  // Send message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token || !selectedConvId || !messageText.trim() || sending) return;

    const text = messageText.trim();
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch(`/chat/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ content: text }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.message || `Failed to send message (${res.status})`);
      }

      const newMsg: MessageResponseDto = body;
      setMessageText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '42px';
      }

      // Optimistically append new message if not already present
      setActiveConv((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === newMsg.id)) return prev;
        return {
          ...prev,
          messages: [...prev.messages, newMsg],
          updatedAt: newMsg.createdAt,
        };
      });

      // Refresh list to update snippet
      fetchConversations(true);

      setTimeout(() => scrollToBottom(), 50);
    } catch (err: any) {
      setSendError(err.message || 'Unable to send message. Please retry.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const formatDepartureDate = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <PageShell width="wide" className={selectedConvId ? 'chat-page-shell-active' : ''}>
      <div className={`chat-page-header-container ${selectedConvId ? 'is-active-conv' : ''}`}>
        <PageHeader
          title="Ride Messages"
          description="Private, ride-specific communication between passengers and verified hosts."
          tabs={
            <InboxTabs
              counts={{
                messages: conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
                notifications: notifUnreadCount,
              }}
            />
          }
        />
      </div>

      {/* Main Chat Interface Container */}
      <div
        className={`chat-layout-container ${selectedConvId ? 'has-selected-conversation' : ''}`}
        id="chat-main-container"
      >
        {/* LEFT COLUMN: CONVERSATION LIST */}
        <div
          className="chat-conversations-list-pane"
          id="chat-conversations-list-pane"
        >
          {/* List Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#ffffff',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              Conversations ({conversations.length})
            </div>
            <button
              type="button"
              onClick={() => fetchConversations()}
              disabled={loadingList}
              title="Refresh conversation list"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              id="btn-refresh-conversations"
            >
              <RefreshCw size={14} className={loadingList ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* List Content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingList && conversations.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <span style={{ fontSize: '0.85rem' }}>Loading conversations...</span>
              </div>
            ) : listError ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <AlertCircle size={28} style={{ color: '#dc2626', margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.85rem', color: '#991b1b', marginBottom: '12px' }}>
                  {listError}
                </div>
                <Button size="sm" variant="outline" onClick={() => fetchConversations()}>
                  Retry
                </Button>
              </div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <MessageSquare size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px' }}>
                  No Conversations Yet
                </div>
                <div style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                  When you request a ride or receive passenger requests, your private chats will appear here.
                </div>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = c.id === selectedConvId;
                const isDriver = c.otherParticipant.role === 'DRIVER';

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedConvId(c.id);
                      navigate(`/messages/${c.id}`);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 18px',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      border: 'none',
                      borderBottom: '1px solid var(--border-light)',
                      borderLeft: isSelected ? '4px solid #2563eb' : '4px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                    id={`conversation-item-${c.id}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {c.otherParticipant.avatarUrl ? (
                          <img
                            src={c.otherParticipant.avatarUrl}
                            alt={c.otherParticipant.fullName}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-light)' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: isDriver ? '#dcfce7' : '#f3e8ff',
                              color: isDriver ? '#166534' : '#6b21a8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              flexShrink: 0,
                            }}
                          >
                            {c.otherParticipant.fullName.charAt(0)}
                          </div>
                        )}
                        <span
                          style={{
                            fontWeight: isSelected ? 700 : 600,
                            fontSize: '0.9rem',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {c.otherParticipant.fullName}
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: isDriver ? '#dcfce7' : '#f3e8ff',
                              color: isDriver ? '#166534' : '#6b21a8',
                            }}
                          >
                            {isDriver ? 'DRIVER' : 'PASSENGER'}
                          </span>
                        </span>
                      </div>

                      {c.unreadCount > 0 && (
                        <span
                          style={{
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            borderRadius: '10px',
                            padding: '2px 7px',
                            minWidth: '18px',
                            textAlign: 'center',
                          }}
                          id={`unread-badge-${c.id}`}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: '0.775rem',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.ride.origin} &rarr; {c.ride.destination}
                    </div>

                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: isSelected ? 'var(--color-brand-700)' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.lastMessage ? c.lastMessage.content : 'No messages yet. Say hello!'}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE CONVERSATION CHAT VIEW */}
        <div
          className="chat-active-view-pane"
          id="chat-active-view-pane"
        >
          {selectedConvId && activeConv ? (
            <>
              {/* Conversation Top Header */}
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-light, #e2e8f0)',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                }}
                className="chat-thread-header"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConvId(null);
                      navigate('/messages');
                    }}
                    className="chat-mobile-back-btn"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary, #475569)',
                      minWidth: '36px',
                      minHeight: '36px',
                      borderRadius: '8px',
                      flexShrink: 0,
                    }}
                    id="btn-chat-mobile-back"
                    aria-label="Back to conversations list"
                  >
                    <ArrowLeft size={20} />
                  </button>

                  {activeConv.otherParticipant.avatarUrl ? (
                    <img
                      src={activeConv.otherParticipant.avatarUrl}
                      alt={activeConv.otherParticipant.fullName}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '1px solid var(--border-light, #e2e8f0)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: activeConv.otherParticipant.role === 'DRIVER' ? '#dcfce7' : '#f3e8ff',
                        color: activeConv.otherParticipant.role === 'DRIVER' ? '#166534' : '#6b21a8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        flexShrink: 0,
                      }}
                    >
                      {activeConv.otherParticipant.fullName.charAt(0)}
                    </div>
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: '0.925rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={activeConv.otherParticipant.fullName}
                    >
                      {activeConv.otherParticipant.fullName.replace(/\s*\((Student Driver|Passenger)\)/i, '')}
                    </div>

                    <div
                      style={{
                        fontSize: '0.725rem',
                        color: 'var(--text-muted, #64748b)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '2px',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor:
                            activeConv.otherParticipant.role === 'DRIVER' ? '#dcfce7' : '#f3e8ff',
                          color:
                            activeConv.otherParticipant.role === 'DRIVER' ? '#166534' : '#6b21a8',
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        {activeConv.otherParticipant.role}
                      </span>
                      {Boolean(activeConv.ride?.origin && activeConv.ride?.destination) && (
                        <>
                          <span>&bull;</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {activeConv.ride.origin} &rarr; {activeConv.ride.destination}
                          </span>
                        </>
                      )}
                      {Boolean(activeConv.ride?.departureTime) && (
                        <>
                          <span className="desktop-only-text">&bull;</span>
                          <span className="desktop-only-text" style={{ flexShrink: 0 }}>
                            {formatDepartureDate(activeConv.ride.departureTime)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Moderation & Navigation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, position: 'relative' }}>
                  <Link
                    to={
                      activeConv.otherParticipant.role === 'DRIVER'
                        ? '/bookings?tab=passenger'
                        : `/bookings?tab=driver&rideId=${activeConv.rideId}`
                    }
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-brand-600, #2563eb)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-subtle, #f8fafc)',
                      border: '1px solid var(--border-light, #e2e8f0)',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                    id="link-return-to-booking"
                  >
                    <span className="desktop-only-text">View Booking Details</span>
                    <span className="mobile-only-text">Booking</span>
                    <ChevronRight size={13} />
                  </Link>

                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen((prev) => !prev)}
                      style={{
                        background: menuOpen ? '#f1f5f9' : 'none',
                        border: '1px solid var(--border-light, #e2e8f0)',
                        borderRadius: '6px',
                        padding: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary, #475569)',
                        minWidth: '32px',
                        minHeight: '32px',
                      }}
                      title="More actions"
                      aria-label="More actions"
                      id="btn-chat-more-actions"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          marginTop: '6px',
                          backgroundColor: '#ffffff',
                          borderRadius: '10px',
                          border: '1px solid var(--border-light, #e2e8f0)',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                          padding: '6px',
                          zIndex: 100,
                          minWidth: '160px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setReportModalOpen(true);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: '#b91c1c',
                            background: 'none',
                            border: 'none',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <ShieldAlert size={14} />
                          <span>Report Safety Issue</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            setBlockModalOpen(true);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: '#4b5563',
                            background: 'none',
                            border: 'none',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <UserX size={14} />
                          <span>Block User</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Error Banner */}
              {detailError && (
                <div
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#fee2e2',
                    borderBottom: '1px solid #fecaca',
                    color: '#991b1b',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  id="chat-detail-error"
                >
                  <AlertCircle size={16} />
                  <span>{detailError}</span>
                </div>
              )}

              {/* Scrollable Messages Stream */}
              <div
                style={{
                  flex: '1 1 0%',
                  minHeight: 0,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  backgroundColor: '#f8fafc',
                }}
                id="chat-messages-scroll-area"
              >
                {loadingDetail && activeConv.messages.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--color-brand-600)' }} />
                    <div style={{ fontSize: '0.85rem' }}>Loading conversation history...</div>
                  </div>
                ) : activeConv.messages.length === 0 ? (
                  <div
                    style={{
                      padding: '36px 20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      border: '1px dashed var(--border-light, #e2e8f0)',
                      margin: 'auto 8px',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                    }}
                    id="chat-empty-thread-notice"
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 10px',
                      }}
                    >
                      <MessageSquare size={22} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Start the Conversation
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', maxWidth: '280px', margin: '0 auto' }}>
                      Confirm pickup landmarks, luggage space, or departure timing with your peer commuter.
                    </div>
                  </div>
                ) : (
                  activeConv.messages.map((m) => {
                    const isMine = m.senderId === user?.id || m.isMine;

                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isMine ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                          alignSelf: isMine ? 'flex-end' : 'flex-start',
                        }}
                        id={`chat-message-${m.id}`}
                      >
                        <div
                          style={{
                            padding: '9px 13px',
                            borderRadius: isMine
                              ? '16px 16px 4px 16px'
                              : '16px 16px 16px 4px',
                            backgroundColor: isMine ? 'var(--brand-blue, #2340b8)' : '#ffffff',
                            color: isMine ? '#ffffff' : 'var(--text-primary, #0f172a)',
                            fontSize: '0.875rem',
                            lineHeight: '1.45',
                            wordBreak: 'break-word',
                            boxShadow: isMine
                              ? '0 1px 3px rgba(35, 64, 184, 0.18)'
                              : '0 1px 2px rgba(0, 0, 0, 0.05)',
                            border: isMine ? 'none' : '1px solid var(--border-light, #e2e8f0)',
                          }}
                        >
                          {m.content}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '0.675rem',
                            color: 'var(--text-muted, #94a3b8)',
                            marginTop: '2px',
                            paddingRight: isMine ? '4px' : '0',
                            paddingLeft: !isMine ? '4px' : '0',
                          }}
                        >
                          <span>{formatMessageTime(m.createdAt)}</span>
                          {isMine &&
                            (m.readAt ? (
                              <span title="Read" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <CheckCheck size={13} style={{ color: 'var(--brand-blue, #2340b8)' }} />
                              </span>
                            ) : (
                              <span title="Sent" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <Check size={13} style={{ color: 'var(--text-muted, #94a3b8)' }} />
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer or Read-Only Notice */}
              {activeConv.isReadOnly ? (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#f8fafc',
                    borderTop: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: 'var(--text-muted)',
                    fontSize: '0.825rem',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                  id="chat-readonly-footer"
                >
                  <ShieldAlert size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                  <span>
                    {activeConv.readOnlyReason ||
                      'This ride has completed. Conversation is archived in read-only mode.'}
                  </span>
                </div>
              ) : (
                <div
                  className="chat-composer-section"
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border-light, #e2e8f0)',
                    backgroundColor: '#ffffff',
                    flexShrink: 0,
                  }}
                >
                  {sendError && (
                    <div
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        color: '#991b1b',
                        fontSize: '0.78rem',
                        marginBottom: '8px',
                      }}
                    >
                      {sendError}
                    </div>
                  )}

                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: '8px',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <textarea
                        ref={textareaRef}
                        value={messageText}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message... (Press Enter to send)"
                        disabled={sending}
                        maxLength={1000}
                        rows={1}
                        style={{
                          width: '100%',
                          resize: 'none',
                          minHeight: '42px',
                          maxHeight: '120px',
                          height: '42px',
                          lineHeight: '1.4',
                          padding: '10px 14px',
                          borderRadius: '16px',
                          border: '1.5px solid var(--border-medium, #cbd5e1)',
                          fontSize: '0.875rem',
                          outline: 'none',
                          fontFamily: 'inherit',
                          backgroundColor: '#f8fafc',
                          boxSizing: 'border-box',
                          transition: 'border-color 0.15s ease, background-color 0.15s ease',
                        }}
                        id="input-chat-message"
                      />
                      {messageText.length > 800 && (
                        <div
                          style={{
                            fontSize: '0.65rem',
                            color: messageText.length > 950 ? '#dc2626' : 'var(--text-muted)',
                            textAlign: 'right',
                            marginTop: '2px',
                            paddingRight: '6px',
                          }}
                        >
                          {messageText.length}/1000
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className="chat-send-btn"
                      style={{
                        backgroundColor: !messageText.trim() || sending ? '#e2e8f0' : '#2563eb',
                        color: !messageText.trim() || sending ? '#94a3b8' : '#ffffff',
                        border: 'none',
                        cursor: !messageText.trim() || sending ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                      }}
                      id="btn-send-message"
                      aria-label="Send message"
                    >
                      {sending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      <span className="chat-send-btn-label">Send</span>
                    </button>
                  </form>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <MessageSquare size={52} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
                Select a Ride Conversation
              </h2>
              <p style={{ fontSize: '0.875rem', maxWidth: '360px', margin: 0 }}>
                Choose a conversation from the left to read messages or discuss trip details with your peer commuter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Safety Moderation Modals */}
      {activeConv && (
        <>
          <ReportModal
            isOpen={reportModalOpen}
            onClose={() => setReportModalOpen(false)}
            targetName={activeConv.otherParticipant.fullName}
            reportedUserId={activeConv.otherParticipant.id}
            rideId={activeConv.rideId}
            bookingId={activeConv.bookingId}
          />

          <BlockConfirmModal
            isOpen={blockModalOpen}
            onClose={() => setBlockModalOpen(false)}
            targetUserId={activeConv.otherParticipant.id}
            targetUserName={activeConv.otherParticipant.fullName}
            onBlocked={() => {
              fetchConversations();
              if (selectedConvId) {
                fetchActiveConversation(selectedConvId);
              }
            }}
          />
        </>
      )}
    </PageShell>
  );
};
