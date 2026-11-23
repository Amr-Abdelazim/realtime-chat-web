import type { Conversation, LocalMessage, Message, User } from '../types';

export function getInitials(label?: string | null) {
  if (!label) return '??';
  const parts = label.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)).toUpperCase();
}

export function formatTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatListTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatTime(value);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function formatLastSeen(value?: string | null) {
  if (!value) return 'Offline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Offline';
  return `Last seen ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)}`;
}

export function sortMessages(messages: LocalMessage[]) {
  return [...messages].sort((a, b) => {
    if (a.seq === 0 && b.seq !== 0) return 1;
    if (b.seq === 0 && a.seq !== 0) return -1;
    if (a.seq !== b.seq) return a.seq - b.seq;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function mergeMessages(existing: LocalMessage[], incoming: Message[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  const clientIds = new Map(existing.filter((message) => message.clientMessageId).map((message) => [message.clientMessageId as string, message.id]));

  for (const message of incoming) {
    const optimisticId = message.clientMessageId ? clientIds.get(message.clientMessageId) : undefined;
    if (optimisticId && optimisticId !== message.id) byId.delete(optimisticId);
    const previous = byId.get(message.id);
    byId.set(message.id, { ...previous, ...message, localStatus: 'sent' });
  }

  return sortMessages([...byId.values()]);
}

export function upsertConversation(items: Conversation[], conversation: Conversation) {
  const next = items.filter((item) => item.id !== conversation.id);
  next.push(conversation);
  return next.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

export function conversationTitle(conversation: Conversation, currentUserId?: string) {
  if (conversation.type === 'GROUP') return conversation.name || 'Untitled group';
  const peer = conversation.members.find((member) => member.userId !== currentUserId) || conversation.members[0];
  return peer?.displayName || 'Direct message';
}

export function conversationAvatar(conversation: Conversation, currentUserId?: string) {
  if (conversation.type === 'GROUP') return null;
  const peer = conversation.members.find((member) => member.userId !== currentUserId) || conversation.members[0];
  return peer?.avatarUrl || null;
}

export function previewMessage(message: Message | null, currentUserId?: string) {
  if (!message) return 'Start the conversation';
  if (message.type === 'SYSTEM') return message.content || 'Group update';
  if (message.deletedAt) return 'Message deleted';
  const prefix = message.senderId === currentUserId ? 'You: ' : '';
  return `${prefix}${message.content || ''}`;
}

export function getMemberName(conversation: Conversation | undefined, userId: string, fallback = 'Someone') {
  return conversation?.members.find((member) => member.userId === userId)?.displayName || fallback;
}

export function isApiValidationError(error: unknown): error is { code: string; details: unknown; message: string } {
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

export function userFromMember(member: Conversation['members'][number]): User {
  return {
    id: member.userId,
    username: member.displayName,
    displayName: member.displayName,
    avatarUrl: member.avatarUrl,
    createdAt: '',
  };
}
