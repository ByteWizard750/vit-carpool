import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Clock,
  Check,
  CheckCheck,
  ShieldAlert,
  ChevronRight,
  RefreshCw,
  UserX,
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll to bottom of message list
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
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
        setActiveConv(data);

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
  }, [fetchConversations]);

  // When route param changes or selectedConvId changes
  useEffect(() => {
    if (paramConvId && paramConvId !== selectedConvId) {
      setSelectedConvId(paramConvId);
    }
  }, [paramConvId, selectedConvId]);

  useEffect(() => {
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

  // Polling for new messages every 4 seconds when conversation is open
  useEffect(() => {
    if (!token || !selectedConvId) return;

    const interval = setInterval(() => {
      fetchActiveConversation(selectedConvId, true);
      fetchConversations(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [token, selectedConvId, fetchActiveConversation, fetchConversations]);

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

      // Optimistically append new message
      setActiveConv((prev) =>
        prev
          ? {
              ...prev,
              messages: [...prev.messages, newMsg],
              updatedAt: newMsg.createdAt,
            }
          : prev,
      );

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
    <PageShell width="wide">
      <PageHeader
        title="Ride Messages"
        description="Private, ride-specific communication between passengers and verified hosts."
        tabs={<InboxTabs counts={{ messages: conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0) }} />}
      />

      {/* Main Chat Interface Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedConvId ? 'minmax(280px, 340px) 1fr' : '1fr',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          overflow: 'hidden',
          flex: 1,
          minHeight: '480px',
          height: 'calc(100vh - 165px)',
        }}
        id="chat-main-container"
      >
        {/* LEFT COLUMN: CONVERSATION LIST */}
        <div
          style={{
            borderRight: '1px solid var(--border-light)',
            display: selectedConvId && window.innerWidth < 768 ? 'none' : 'flex',
            flexDirection: 'column',
            backgroundColor: '#f8fafc',
            height: '100%',
          }}
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            backgroundColor: '#ffffff',
          }}
          id="chat-active-view-pane"
        >
          {selectedConvId && activeConv ? (
            <>
              {/* Conversation Top Header */}
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-light)',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Mobile Back Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConvId(null);
                      navigate('/messages');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                      cursor: 'pointer',
                      display: window.innerWidth < 768 ? 'flex' : 'none',
                      alignItems: 'center',
                      color: 'var(--text-secondary)',
                    }}
                    id="btn-chat-mobile-back"
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {activeConv.otherParticipant.fullName}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            activeConv.otherParticipant.role === 'DRIVER' ? '#dcfce7' : '#f3e8ff',
                          color:
                            activeConv.otherParticipant.role === 'DRIVER' ? '#166534' : '#6b21a8',
                        }}
                      >
                        {activeConv.otherParticipant.role}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '0.775rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '2px',
                      }}
                    >
                      <span>
                        {activeConv.ride.origin} &rarr; {activeConv.ride.destination}
                      </span>
                      <span>&bull;</span>
                      <Clock size={12} />
                      <span>{formatDepartureDate(activeConv.ride.departureTime)}</span>
                    </div>
                  </div>
                </div>

                {/* Moderation & Navigation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setReportModalOpen(true)}
                    style={{
                      fontSize: '0.75rem',
                      color: '#b91c1c',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      padding: '5px 9px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Report safety or conduct violation"
                  >
                    <ShieldAlert size={13} />
                    <span>Report</span>
                  </button>

                  <button
                    onClick={() => setBlockModalOpen(true)}
                    style={{
                      fontSize: '0.75rem',
                      color: '#4b5563',
                      background: '#f3f4f6',
                      border: '1px solid var(--border-light)',
                      borderRadius: '6px',
                      padding: '5px 9px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Block this member"
                  >
                    <UserX size={13} />
                    <span>Block</span>
                  </button>

                  <Link
                    to={
                      activeConv.otherParticipant.role === 'DRIVER'
                        ? '/bookings?tab=passenger'
                        : `/bookings?tab=driver&rideId=${activeConv.rideId}`
                    }
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-brand-600)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--bg-subtle)',
                    }}
                    id="link-return-to-booking"
                  >
                    <span>View Booking Details</span>
                    <ChevronRight size={13} />
                  </Link>
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

              {/* Read-Only Status Banner */}
              {activeConv.isReadOnly && (
                <div
                  style={{
                    padding: '10px 16px',
                    backgroundColor: '#fffbeb',
                    borderBottom: '1px solid #fef3c7',
                    color: '#92400e',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  id="chat-readonly-banner"
                >
                  <ShieldAlert size={16} />
                  <span>
                    {activeConv.readOnlyReason ||
                      'Messaging is closed for this ride. History is preserved in read-only mode.'}
                  </span>
                </div>
              )}

              {/* Scrollable Messages Stream */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  backgroundColor: '#f8fafc',
                }}
                id="chat-messages-scroll-area"
              >
                {loadingDetail && activeConv.messages.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    <div>Loading chat history...</div>
                  </div>
                ) : activeConv.messages.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      backgroundColor: '#ffffff',
                      borderRadius: '12px',
                      border: '1px dashed var(--border-light)',
                      margin: 'auto 0',
                    }}
                  >
                    <MessageSquare size={32} style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      Start the Conversation
                    </div>
                    <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                      Confirm pickup landmarks, luggage details, or scheduled departure adjustments.
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
                          maxWidth: '75%',
                          alignSelf: isMine ? 'flex-end' : 'flex-start',
                        }}
                        id={`chat-message-${m.id}`}
                      >
                        {!isMine && (
                          <span
                            style={{
                              fontSize: '0.725rem',
                              fontWeight: 600,
                              color: 'var(--text-muted)',
                              marginBottom: '2px',
                              marginLeft: '4px',
                            }}
                          >
                            {m.senderName}
                          </span>
                        )}

                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: isMine
                              ? '14px 14px 2px 14px'
                              : '14px 14px 14px 2px',
                            backgroundColor: isMine ? '#2563eb' : '#ffffff',
                            color: isMine ? '#ffffff' : 'var(--text-primary)',
                            fontSize: '0.875rem',
                            lineHeight: '1.45',
                            wordBreak: 'break-word',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            border: isMine ? 'none' : '1px solid var(--border-light)',
                          }}
                        >
                          {m.content}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.675rem',
                            color: 'var(--text-muted)',
                            marginTop: '2px',
                            paddingRight: isMine ? '4px' : '0',
                            paddingLeft: !isMine ? '4px' : '0',
                          }}
                        >
                          <span>{formatMessageTime(m.createdAt)}</span>
                          {isMine &&
                            (m.readAt ? (
                              <span title="Read" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <CheckCheck size={13} style={{ color: '#2563eb' }} />
                              </span>
                            ) : (
                              <span title="Sent" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                <Check size={13} style={{ color: 'var(--text-muted)' }} />
                              </span>
                            ))}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border-light)',
                  backgroundColor: '#ffffff',
                }}
              >
                {sendError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#fee2e2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      color: '#991b1b',
                      fontSize: '0.8rem',
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
                    gap: '10px',
                  }}
                >
                  <div style={{ flex: 1, position: 'relative' }}>
                    <textarea
                      ref={textareaRef}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        activeConv.isReadOnly
                          ? 'Messaging is closed for this ride'
                          : 'Type a message... (Press Enter to send)'
                      }
                      disabled={activeConv.isReadOnly || sending}
                      maxLength={1000}
                      rows={1}
                      style={{
                        width: '100%',
                        resize: 'none',
                        minHeight: '44px',
                        maxHeight: '120px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.875rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                        backgroundColor: activeConv.isReadOnly ? '#f1f5f9' : '#ffffff',
                      }}
                      id="input-chat-message"
                    />
                    <div
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--text-muted)',
                        textAlign: 'right',
                        marginTop: '2px',
                      }}
                    >
                      {messageText.length}/1000
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={activeConv.isReadOnly || !messageText.trim() || sending}
                    leftIcon={sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    id="btn-send-message"
                  >
                    Send
                  </Button>
                </form>
              </div>
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
