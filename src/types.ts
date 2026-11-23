export type User = {
  id: string;
  email?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ConversationType = 'DIRECT' | 'GROUP';

export type ConversationMember = {
  userId: string;
  role: MemberRole;
  displayName: string;
  avatarUrl: string | null;
};

export type ReplyTo = {
  id: string;
  senderId: string | null;
  preview: string | null;
} | null;

export type Message = {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string | null;
  type: 'TEXT' | 'SYSTEM';
  content: string | null;
  clientMessageId: string | null;
  replyTo: ReplyTo;
  createdAt: string;
  deletedAt: string | null;
};

export type LocalMessage = Message & {
  localStatus?: 'pending' | 'sending' | 'sent' | 'failed';
  localError?: string;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  name: string | null;
  members: ConversationMember[];
  lastSeq: number;
  memberCount: number;
  lastMessage: Message | null;
  unreadCount: number;
  myLastReadSeq: number;
  receipts: { deliveredUpTo: number; readUpTo: number };
  peerPresence: { online: boolean; lastSeenAt: string | null } | null;
};

export type ConversationPage = {
  items: Conversation[];
  nextCursor: string | null;
};

export type MessagePage = {
  items: Message[];
  hasMore: boolean;
};

export type Presence = {
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

export type SocketAck<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
