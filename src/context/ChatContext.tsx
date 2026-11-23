import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { api, SOCKET_URL } from '../lib/api';
import { mergeMessages, sortMessages, upsertConversation } from '../lib/utils';
import type { Conversation, LocalMessage, Message, Presence, SocketAck } from '../types';

type ChatContextValue = {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: LocalMessage[];
  hasMoreMessages: boolean;
  hasMoreConversations: boolean;
  socketConnected: boolean;
  presence: Record<string, Presence>;
  typingUsers: string[];
  loadingMessages: boolean;
  loadingOlder: boolean;
  loadingConversations: boolean;
  openConversation: (id: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  loadMoreConversations: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  createDirect: (userId: string) => Promise<Conversation>;
  createGroup: (name: string, memberIds: string[]) => Promise<Conversation>;
  sendMessage: (content: string, replyToId?: string | null) => Promise<void>;
  retryMessage: (message: LocalMessage) => Promise<void>;
  deleteMessage: (message: LocalMessage) => Promise<void>;
  markRead: (conversationId: string, upToSeq: number) => Promise<void>;
  setTyping: (conversationId: string, active: boolean) => void;
  updateConversation: (conversation: Conversation) => void;
  renameGroup: (conversationId: string, name: string) => Promise<void>;
  addMembers: (conversationId: string, userIds: string[]) => Promise<void>;
  removeMember: (conversationId: string, userId: string) => Promise<void>;
  leaveGroup: (conversationId: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

function uuid() {
  const cryptoApi = typeof window !== 'undefined' ? window.crypto : undefined;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi) cryptoApi.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ackError(ack: SocketAck<unknown>) {
  if (ack.ok) return null;
  const error = new Error(ack.error.message) as Error & { code?: string };
  error.code = ack.error.code;
  return error;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, accessToken, refresh } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, LocalMessage[]>>({});
  const [messageHasMore, setMessageHasMore] = useState<Record<string, boolean>>({});
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef(messagesByConversation);
  const conversationsRef = useRef(conversations);
  const activeIdRef = useRef(activeConversationId);
  const typingStateRef = useRef<Record<string, boolean>>({});
  const typingTimers = useRef<Record<string, number>>({});
  const typingThrottle = useRef<Record<string, number>>({});
  const gapLocks = useRef<Set<string>>(new Set());
  const rateLimitUntil = useRef(0);
  const conversationRequest = useRef(0);

  useEffect(() => { messagesRef.current = messagesByConversation; }, [messagesByConversation]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeIdRef.current = activeConversationId; }, [activeConversationId]);

  const setMessages = useCallback((conversationId: string, update: (current: LocalMessage[]) => LocalMessage[]) => {
    setMessagesByConversation((current) => {
      const next = update(current[conversationId] || []);
      return { ...current, [conversationId]: next };
    });
  }, []);

  const updateConversation = useCallback((conversation: Conversation) => {
    setConversations((current) => upsertConversation(current, conversation));
  }, []);

  const refreshPresence = useCallback(async (items: Conversation[]) => {
    const ids = [...new Set(items.flatMap((conversation) => conversation.members.map((member) => member.userId)).filter((id) => id !== user?.id))];
    if (ids.length === 0) return;
    const all: Presence[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      try {
        const result = await api.getPresence(ids.slice(index, index + 50));
        all.push(...result.items);
      } catch {
        // Presence is supplementary; a temporary failure should not block chat.
      }
    }
    setPresence((current) => ({ ...current, ...Object.fromEntries(all.map((item) => [item.userId, item])) }));
  }, [user?.id]);

  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const first = await api.getConversations(50);
      const all = [...first.items];
      let cursor = first.nextCursor;
      // Fetch the complete active conversation list so reconnect sync is not partial.
      while (cursor) {
        const next = await api.getConversations(50, cursor);
        all.push(...next.items);
        cursor = next.nextCursor;
      }
      const activeIds = new Set(all.map((conversation) => conversation.id));
      setConversations(all);
      setActiveConversationId((current) => current && !activeIds.has(current) ? null : current);
      setMessagesByConversation((current) => Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id))));
      setConversationCursor(null);
      setHasMoreConversations(false);
      void refreshPresence(all);
    } finally {
      setLoadingConversations(false);
    }
  }, [refreshPresence]);

  const loadMoreConversations = useCallback(async () => {
    if (!hasMoreConversations || !conversationCursor || loadingConversations) return;
    setLoadingConversations(true);
    try {
      const page = await api.getConversations(50, conversationCursor);
      setConversations((current) => {
        const combined = [...current];
        for (const conversation of page.items) {
          const index = combined.findIndex((item) => item.id === conversation.id);
          if (index >= 0) combined[index] = conversation;
          else combined.push(conversation);
        }
        return combined;
      });
      setConversationCursor(page.nextCursor);
      setHasMoreConversations(Boolean(page.nextCursor));
      void refreshPresence(page.items);
    } finally {
      setLoadingConversations(false);
    }
  }, [conversationCursor, hasMoreConversations, loadingConversations, refreshPresence]);

  const loadConversationMessages = useCallback(async (conversationId: string, requestId: number) => {
    const page = await api.getMessages(conversationId, { limit: 50 });
    if (requestId !== conversationRequest.current) return;
    const ascending = [...page.items].sort((a, b) => a.seq - b.seq);
    setMessages(conversationId, () => ascending.map((message) => ({ ...message, localStatus: 'sent' })));
    setMessageHasMore((current) => ({ ...current, [conversationId]: page.hasMore }));
    const latest = ascending.at(-1);
    if (latest && latest.seq > 0) {
      void emitDelivery(conversationId, latest.seq);
    }
  }, [setMessages]);

  const openConversation = useCallback(async (conversationId: string) => {
    const requestId = ++conversationRequest.current;
    setActiveConversationId(conversationId);
    setLoadingMessages(true);
    try {
      const [conversation] = await Promise.all([api.getConversation(conversationId), loadConversationMessages(conversationId, requestId)]);
      if (requestId !== conversationRequest.current) return;
      updateConversation(conversation);
    } finally {
      if (requestId === conversationRequest.current) setLoadingMessages(false);
    }
  }, [loadConversationMessages, updateConversation]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationId || loadingOlder) return;
    const current = messagesRef.current[activeConversationId] || [];
    const oldest = current.find((message) => message.seq > 0)?.seq;
    if (!oldest || !messageHasMore[activeConversationId]) return;
    setLoadingOlder(true);
    try {
      const page = await api.getMessages(activeConversationId, { limit: 50, beforeSeq: oldest });
      setMessages(activeConversationId, (items) => mergeMessages(items, page.items));
      setMessageHasMore((state) => ({ ...state, [activeConversationId]: page.hasMore }));
    } finally {
      setLoadingOlder(false);
    }
  }, [activeConversationId, loadingOlder, messageHasMore, setMessages]);

  async function emitDelivery(conversationId: string, upToSeq: number) {
    const socket = socketRef.current;
    if (!socket?.connected || upToSeq <= 0) return;
    try {
      await socket.timeout(4000).emitWithAck('message:delivered', { conversationId, upToSeq });
    } catch {
      // Reconnect sync will re-send delivery watermarks when the conversation is opened again.
    }
  }

  const markRead = useCallback(async (conversationId: string, upToSeq: number) => {
    if (upToSeq <= 0) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      try {
        const ack = await socket.timeout(4000).emitWithAck('conversation:read', { conversationId, upToSeq }) as SocketAck<{ unreadCount: number }>;
        const error = ackError(ack);
        if (!error && ack.ok) {
          setConversations((current) => current.map((item) => item.id === conversationId
            ? { ...item, myLastReadSeq: Math.max(item.myLastReadSeq, upToSeq), unreadCount: ack.data.unreadCount }
            : item));
          return;
        }
      } catch {
        // REST fallback below.
      }
    }
    await api.markReadRest(conversationId, upToSeq);
    setConversations((current) => current.map((item) => item.id === conversationId
      ? { ...item, myLastReadSeq: Math.max(item.myLastReadSeq, upToSeq), unreadCount: 0 }
      : item));
  }, []);

  const syncLoadedHistory = useCallback(async () => {
    const loadedIds = Object.keys(messagesRef.current);
    await Promise.all(loadedIds.map(async (conversationId) => {
      try {
        const fresh = await api.getConversation(conversationId);
        updateConversation(fresh);
        let cursor = (messagesRef.current[conversationId] || []).reduce((max, message) => Math.max(max, message.seq), 0);
        while (cursor < fresh.lastSeq) {
          const page = await api.getMessages(conversationId, { afterSeq: cursor, limit: 100 });
          if (page.items.length === 0) break;
          setMessages(conversationId, (items) => mergeMessages(items, page.items));
          cursor = Math.max(cursor, ...page.items.map((item) => item.seq));
          if (page.items.length < 100) break;
        }
        if (cursor > 0) {
          void emitDelivery(conversationId, cursor);
          if (activeIdRef.current === conversationId) void markRead(conversationId, cursor).catch(() => undefined);
        }
      } catch {
        // A conversation can have been removed while disconnected; its event/list sync wins.
      }
    }));
  }, [markRead, setMessages, updateConversation]);

  const createDirect = useCallback(async (userId: string) => {
    const conversation = await api.createDirect(userId);
    updateConversation(conversation);
    await openConversation(conversation.id);
    return conversation;
  }, [openConversation, updateConversation]);

  const createGroup = useCallback(async (name: string, memberIds: string[]) => {
    const conversation = await api.createGroup(name, memberIds);
    updateConversation(conversation);
    await openConversation(conversation.id);
    return conversation;
  }, [openConversation, updateConversation]);

  const applyIncomingMessage = useCallback(async (message: Message) => {
    const conversationId = message.conversationId;
    const alreadyLoaded = Object.prototype.hasOwnProperty.call(messagesRef.current, conversationId);
    const currentMessages = messagesRef.current[conversationId] || [];
    const latestLocalSeq = currentMessages.reduce((max, item) => Math.max(max, item.seq), 0);

    if (alreadyLoaded && latestLocalSeq > 0 && message.seq > latestLocalSeq + 1 && !gapLocks.current.has(conversationId)) {
      gapLocks.current.add(conversationId);
      try {
        let cursor = latestLocalSeq;
        while (cursor < message.seq - 1) {
          const gap = await api.getMessages(conversationId, { afterSeq: cursor, limit: 100 });
          if (gap.items.length === 0) break;
          setMessages(conversationId, (items) => mergeMessages(items, gap.items));
          cursor = Math.max(cursor, ...gap.items.map((item) => item.seq));
          if (gap.items.length < 100) break;
        }
      } catch {
        // Keep the live message; a future reconnect performs a complete gap sync.
      } finally {
        gapLocks.current.delete(conversationId);
      }
    }

    if (alreadyLoaded) {
      setMessages(conversationId, (items) => mergeMessages(items, [message]));
    }

    setConversations((current) => current.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      const isActive = activeIdRef.current === conversationId;
      const isOwn = message.senderId === user?.id;
      const isNewMessage = message.seq > conversation.lastSeq;
      return {
        ...conversation,
        lastSeq: Math.max(conversation.lastSeq, message.seq),
        lastMessage: message.seq >= conversation.lastSeq ? message : conversation.lastMessage,
        unreadCount: isActive || isOwn || !isNewMessage ? conversation.unreadCount : conversation.unreadCount + 1,
      };
    }));

    if (activeIdRef.current === conversationId && message.senderId !== user?.id) {
      void emitDelivery(conversationId, message.seq);
      void markRead(conversationId, message.seq).catch(() => undefined);
    }
  }, [markRead, setMessages, user?.id]);

  const sendMessageWithId = useCallback(async (conversationId: string, content: string, replyToId: string | null, clientMessageId: string, optimisticId?: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error('You are not connected. Reconnecting…');

    const currentUser = user;
    const optimistic: LocalMessage = {
      id: optimisticId || `local:${clientMessageId}`,
      conversationId,
      seq: 0,
      senderId: currentUser?.id || null,
      type: 'TEXT',
      content,
      clientMessageId,
      replyTo: replyToId ? { id: replyToId, senderId: null, preview: 'Replying to a message' } : null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      localStatus: 'sending',
    };

    setMessages(conversationId, (items) => {
      const exists = items.some((item) => item.clientMessageId === clientMessageId);
      return exists
        ? sortMessages(items.map((item) => item.clientMessageId === clientMessageId ? { ...item, localStatus: 'sending', localError: undefined } : item))
        : sortMessages([...items, optimistic]);
    });

    let lastFailure: unknown;
    const retryable = new Set(['RATE_LIMITED', 'INTERNAL']);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const ack = await socket.timeout(5000).emitWithAck('message:send', {
          conversationId,
          clientMessageId,
          content,
          ...(replyToId ? { replyToId } : {}),
        }) as SocketAck<{ message: Message; duplicate: boolean }>;
        const error = ackError(ack);
        if (error) {
          lastFailure = error;
          if (!retryable.has(error.code || '')) throw error;
        } else if (ack.ok) {
          setMessages(conversationId, (items) => mergeMessages(items, [ack.data.message]));
          setConversations((items) => items.map((item) => item.id === conversationId
            ? { ...item, lastSeq: Math.max(item.lastSeq, ack.data.message.seq), lastMessage: ack.data.message }
            : item));
          return;
        }
      } catch (error) {
        lastFailure = error;
        const code = (error as { code?: string }).code;
        const canRetry = !code || retryable.has(code);
        if (!canRetry || attempt === 4) break;
      }
      if (attempt < 4) {
        const backoff = 500 * (2 ** attempt);
        const serverDelay = Math.max(0, rateLimitUntil.current - Date.now());
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(backoff, serverDelay)));
      }
    }

    const messageText = lastFailure instanceof Error ? lastFailure.message : 'Message could not be sent';
    setMessages(conversationId, (items) => items.map((item) => item.clientMessageId === clientMessageId
      ? { ...item, localStatus: 'failed', localError: messageText }
      : item));
    throw lastFailure instanceof Error ? lastFailure : new Error(messageText);
  }, [setMessages, user]);

  const sendMessage = useCallback(async (content: string, replyToId?: string | null) => {
    if (!activeConversationId || !content.trim()) return;
    const clientMessageId = uuid();
    await sendMessageWithId(activeConversationId, content.trim(), replyToId || null, clientMessageId);
  }, [activeConversationId, sendMessageWithId]);

  const retryMessage = useCallback(async (message: LocalMessage) => {
    if (!message.clientMessageId || !message.content) return;
    await sendMessageWithId(message.conversationId, message.content, message.replyTo?.id || null, message.clientMessageId, message.id);
  }, [sendMessageWithId]);

  const deleteMessage = useCallback(async (message: LocalMessage) => {
    if (message.id.startsWith('local:') || message.localStatus === 'pending' || message.localStatus === 'failed') {
      setMessages(message.conversationId, (items) => items.filter((item) => item.id !== message.id));
      return;
    }
    const socket = socketRef.current;
    let deleted = false;
    if (socket?.connected) {
      try {
        const ack = await socket.timeout(5000).emitWithAck('message:delete', { messageId: message.id }) as SocketAck<{ messageId: string; seq: number }>;
        if (ack.ok) deleted = true;
        else if (ack.error.code !== 'INTERNAL') throw Object.assign(new Error(ack.error.message), { code: ack.error.code });
      } catch {
        // Try the REST equivalent if the socket acknowledgement is unavailable.
      }
    }
    if (!deleted) await api.deleteMessageRest(message.id);
    const deletedAt = new Date().toISOString();
    setMessages(message.conversationId, (items) => items.map((item) => item.id === message.id
      ? { ...item, content: null, deletedAt }
      : item));
  }, [setMessages]);

  const setTyping = useCallback((conversationId: string, active: boolean) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    const key = `${conversationId}:${user?.id || ''}`;
    const now = Date.now();
    if (active) {
      if (typingStateRef.current[key] && now - (typingThrottle.current[key] || 0) < 1200) return;
      typingStateRef.current[key] = true;
      typingThrottle.current[key] = now;
      socket.emit('typing:start', { conversationId });
    } else if (typingStateRef.current[key]) {
      typingStateRef.current[key] = false;
      socket.emit('typing:stop', { conversationId });
    }
  }, [user?.id]);

  const renameGroup = useCallback(async (conversationId: string, name: string) => {
    updateConversation(await api.renameGroup(conversationId, name));
  }, [updateConversation]);

  const addMembers = useCallback(async (conversationId: string, userIds: string[]) => {
    updateConversation(await api.addMembers(conversationId, userIds));
    const fresh = await api.getConversation(conversationId);
    updateConversation(fresh);
    void refreshPresence([fresh]);
  }, [refreshPresence, updateConversation]);

  const removeMember = useCallback(async (conversationId: string, userId: string) => {
    await api.removeMember(conversationId, userId);
    updateConversation(await api.getConversation(conversationId));
  }, [updateConversation]);

  const leaveGroup = useCallback(async (conversationId: string) => {
    await api.leaveGroup(conversationId);
    setConversations((items) => items.filter((item) => item.id !== conversationId));
    setActiveConversationId((current) => current === conversationId ? null : current);
    setMessagesByConversation((current) => {
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  // Socket lifecycle. The access token is only held in memory and passed in the
  // Socket.IO handshake; the refresh cookie remains HttpOnly and browser-managed.
  useEffect(() => {
    if (!accessToken || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setConversations([]);
      setActiveConversationId(null);
      setMessagesByConversation({});
      setPresence({});
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: accessToken },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onReady = () => {
      setSocketConnected(true);
      void refreshConversations().then(() => syncLoadedHistory()).catch(() => undefined);
    };
    const onConnectError = (error: Error) => {
      const message = error.message || '';
      if (message === 'TOKEN_EXPIRED' || message === 'UNAUTHENTICATED') {
        refresh().then((token) => {
          socket.auth = { token };
          socket.connect();
        }).catch(() => undefined);
      }
    };
    const onNewMessage = (payload: { message: Message }) => {
      if (payload?.message) void applyIncomingMessage(payload.message);
    };
    const onDeleted = (payload: { conversationId: string; messageId: string; seq: number }) => {
      setMessages(payload.conversationId, (items) => items.map((item) => item.id === payload.messageId
        ? { ...item, content: null, deletedAt: new Date().toISOString() }
        : item));
      setConversations((items) => items.map((item) => item.id === payload.conversationId && item.lastMessage?.id === payload.messageId
        ? { ...item, lastMessage: { ...item.lastMessage, content: null, deletedAt: new Date().toISOString() } }
        : item));
    };
    const onStatus = (payload: { conversationId: string; userId: string; kind: 'delivered' | 'read'; upToSeq: number }) => {
      setConversations((items) => items.map((item) => {
        if (item.id !== payload.conversationId || item.type !== 'DIRECT' || payload.userId === user?.id) return item;
        return {
          ...item,
          receipts: {
            deliveredUpTo: payload.kind === 'delivered' ? Math.max(item.receipts.deliveredUpTo, payload.upToSeq) : item.receipts.deliveredUpTo,
            readUpTo: payload.kind === 'read' ? Math.max(item.receipts.readUpTo, payload.upToSeq) : item.receipts.readUpTo,
          },
        };
      }));
      const target = conversationsRef.current.find((item) => item.id === payload.conversationId);
      if (target?.type === 'GROUP') void api.getConversation(payload.conversationId).then(updateConversation).catch(() => undefined);
    };
    const onConversationCreated = (payload: { conversation: Conversation }) => {
      if (payload?.conversation) updateConversation(payload.conversation);
    };
    const onConversationUpdated = (payload: { conversation: Conversation }) => {
      if (payload?.conversation) updateConversation(payload.conversation);
    };
    const onConversationRemoved = (payload: { conversationId: string }) => {
      setConversations((items) => items.filter((item) => item.id !== payload.conversationId));
      setActiveConversationId((current) => current === payload.conversationId ? null : current);
      setMessagesByConversation((current) => {
        const next = { ...current };
        delete next[payload.conversationId];
        return next;
      });
    };
    const onTyping = (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (!payload || payload.userId === user.id) return;
      const key = `${payload.conversationId}:${payload.userId}`;
      if (typingTimers.current[key]) window.clearTimeout(typingTimers.current[key]);
      setTypingByConversation((current) => {
        const existing = current[payload.conversationId] || [];
        const next = payload.isTyping
          ? [...new Set([...existing, payload.userId])]
          : existing.filter((id) => id !== payload.userId);
        return { ...current, [payload.conversationId]: next };
      });
      if (payload.isTyping) {
        typingTimers.current[key] = window.setTimeout(() => {
          setTypingByConversation((current) => ({
            ...current,
            [payload.conversationId]: (current[payload.conversationId] || []).filter((id) => id !== payload.userId),
          }));
        }, 4500);
      }
    };
    const onPresence = (item: Presence) => {
      if (item?.userId) setPresence((current) => ({ ...current, [item.userId]: item }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('ready', onReady);
    socket.on('connect_error', onConnectError);
    socket.on('message:new', onNewMessage);
    socket.on('message:deleted', onDeleted);
    socket.on('message:status', onStatus);
    socket.on('conversation:created', onConversationCreated);
    socket.on('conversation:updated', onConversationUpdated);
    socket.on('conversation:removed', onConversationRemoved);
    socket.on('typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('rate_limited', (payload: { event: string; retryAfterMs: number }) => {
      rateLimitUntil.current = Math.max(rateLimitUntil.current, Date.now() + (payload.retryAfterMs || 0));
      window.dispatchEvent(new CustomEvent('chat:notice', { detail: `Slow down a little. ${payload.event} is temporarily rate-limited.` }));
    });

    socket.connect();
    const heartbeat = window.setInterval(() => {
      if (socket.connected) socket.emit('presence:ping');
    }, 25_000);

    return () => {
      window.clearInterval(heartbeat);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [accessToken, user, refresh, refreshConversations, syncLoadedHistory, updateConversation, applyIncomingMessage, setMessages]);

  useEffect(() => () => {
    Object.values(typingTimers.current).forEach((timer) => window.clearTimeout(timer));
  }, []);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const messages = activeConversationId ? messagesByConversation[activeConversationId] || [] : [];
  const typingUsers = activeConversationId ? typingByConversation[activeConversationId] || [] : [];
  const hasMoreMessages = activeConversationId ? Boolean(messageHasMore[activeConversationId]) : false;

  const value = useMemo<ChatContextValue>(() => ({
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    hasMoreMessages,
    hasMoreConversations,
    socketConnected,
    presence,
    typingUsers,
    loadingMessages,
    loadingOlder,
    loadingConversations,
    openConversation,
    loadOlderMessages,
    loadMoreConversations,
    refreshConversations,
    createDirect,
    createGroup,
    sendMessage,
    retryMessage,
    deleteMessage,
    markRead,
    setTyping,
    updateConversation,
    renameGroup,
    addMembers,
    removeMember,
    leaveGroup,
  }), [
    conversations, activeConversationId, activeConversation, messages, hasMoreMessages,
    hasMoreConversations, socketConnected, presence, typingUsers, loadingMessages,
    loadingOlder, loadingConversations, openConversation, loadOlderMessages,
    loadMoreConversations, refreshConversations, createDirect, createGroup, sendMessage,
    retryMessage, deleteMessage, markRead, setTyping, updateConversation, renameGroup,
    addMembers, removeMember, leaveGroup,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
}
