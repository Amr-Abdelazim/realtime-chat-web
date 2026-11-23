import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUp, Check, CheckCheck, ChevronDown, CircleHelp,
  LogOut, MessageCircle, MoreHorizontal, MoreVertical, Pencil, Plus,
  Search, Send, Settings, Wifi, WifiOff, X, Reply, Trash2,
  UserPlus, UserRound, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { api } from '../lib/api';
import {
  conversationAvatar,
  conversationTitle,
  formatListTime,
  formatTime,
  getMemberName,
  previewMessage,
} from '../lib/utils';
import type { Conversation, LocalMessage, User } from '../types';
import { Avatar } from './Avatar';
import { NewConversationModal } from './NewConversationModal';
import { ProfileModal } from './ProfileModal';
import { SettingsModal } from './SettingsModal';

export function ChatLayout() {
  const { activeConversationId } = useChat();
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [mobileSidebar, setMobileSidebar] = useState(true);

  useEffect(() => {
    const listener = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setNotice(custom.detail || 'Something needs your attention.');
      window.setTimeout(() => setNotice(''), 3800);
    };
    window.addEventListener('chat:notice', listener);
    return () => window.removeEventListener('chat:notice', listener);
  }, []);

  useEffect(() => {
    if (activeConversationId) setMobileSidebar(false);
  }, [activeConversationId]);

  return (
    <main className="app-shell">
      <div className={`app-frame ${mobileSidebar ? 'mobile-sidebar-open' : 'mobile-chat-open'}`}>
        <Sidebar onNewConversation={() => setNewConversationOpen(true)} onProfile={() => setProfileOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <section className="main-stage">
          {activeConversationId ? <ConversationView onBack={() => setMobileSidebar(true)} /> : <WelcomePanel onNewConversation={() => setNewConversationOpen(true)} />}
          <div className="stage-footnote"><span>ابعتلي.</span><span>Realtime messaging, in sync.</span></div>
        </section>
      </div>
      {newConversationOpen && <NewConversationModal onClose={() => setNewConversationOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {notice && <div className="toast-notice"><CircleHelp size={16} />{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}
    </main>
  );
}

function Sidebar({ onNewConversation, onProfile, onSettings }: { onNewConversation: () => void; onProfile: () => void; onSettings: () => void }) {
  const { user, logout } = useAuth();
  const { conversations, activeConversationId, openConversation, socketConnected, presence, hasMoreConversations, loadMoreConversations, loadingConversations } = useChat();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      const title = conversationTitle(conversation, user?.id).toLowerCase();
      return title.includes(needle) || conversation.members.some((member) => member.displayName.toLowerCase().includes(needle));
    });
  }, [conversations, search, user?.id]);

  function handleMenu(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand-lockup"><span className="brand-mark"><MessageCircle size={19} fill="currentColor" /></span><span>ابعتلي<span className="brand-period">.</span></span></div>
        <span className={`connection-indicator ${socketConnected ? 'connected' : ''}`} title={socketConnected ? 'Connected' : 'Reconnecting'}>{socketConnected ? <Wifi size={14} /> : <WifiOff size={14} />}</span>
      </header>
      <div className="sidebar-label-row"><span>MESSAGES</span><button className="new-chat-button" onClick={onNewConversation} title="New conversation"><Plus size={17} /></button></div>
      <div className="sidebar-search"><Search size={16} /><input ref={searchInput} placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
      <div className="conversation-list">
        {filtered.length === 0 && <div className="sidebar-empty">{search ? 'No matching conversations.' : 'Nothing here yet. Start a conversation.'}</div>}
        {filtered.map((conversation) => {
          const title = conversationTitle(conversation, user?.id);
          const peer = conversation.members.find((member) => member.userId !== user?.id) || conversation.members[0];
          const peerOnline = peer ? presence[peer.userId]?.online ?? conversation.peerPresence?.online ?? false : false;
          const active = conversation.id === activeConversationId;
          return <button key={conversation.id} className={`conversation-item ${active ? 'active' : ''}`} onClick={() => void openConversation(conversation.id)}>
            <Avatar name={title} src={conversationAvatar(conversation, user?.id)} group={conversation.type === 'GROUP'} online={conversation.type === 'DIRECT' ? peerOnline : undefined} />
            <span className="conversation-item-copy">
              <span className="conversation-item-top"><strong>{title}</strong><time>{formatListTime(conversation.lastMessage?.createdAt)}</time></span>
              <span className="conversation-item-bottom"><span>{previewMessage(conversation.lastMessage, user?.id)}</span>{conversation.unreadCount > 0 && <i className="unread-count">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</i>}</span>
            </span>
          </button>;
        })}
        {hasMoreConversations && <button className="load-more-conversations" disabled={loadingConversations} onClick={() => void loadMoreConversations()}>{loadingConversations ? 'Loading…' : 'Load more conversations'}</button>}
      </div>
      <footer className="sidebar-footer">
        <button className="profile-button" onClick={onProfile}>
          <Avatar name={user?.displayName} src={user?.avatarUrl} size="md" />
          <span className="profile-button-copy"><strong>{user?.displayName}</strong><small>@{user?.username}</small></span>
          <MoreHorizontal size={18} />
        </button>
        <div className="sidebar-footer-actions">
          <button onClick={onSettings}><Settings size={15} /> Settings & status</button>
          <div className="account-menu-wrap">
            <button className="account-menu-trigger" onClick={() => setMenuOpen((open) => !open)} aria-label="Account menu"><ChevronDown size={15} /></button>
            {menuOpen && <div className="account-menu"><button onClick={() => handleMenu(onProfile)}><UserRound size={15} /> Edit profile</button><button onClick={() => handleMenu(onSettings)}><Settings size={15} /> System status</button><button className="danger-menu" onClick={() => handleMenu(() => void logout())}><LogOut size={15} /> Sign out</button></div>}
          </div>
        </div>
      </footer>
    </aside>
  );
}

function WelcomePanel({ onNewConversation }: { onNewConversation: () => void }) {
  const { conversations } = useChat();
  return <div className="welcome-panel">
    <div className="welcome-graphic"><span className="welcome-orbit orbit-one" /><span className="welcome-orbit orbit-two" /><span className="welcome-bubble"><MessageCircle size={37} fill="currentColor" /></span><span className="welcome-dot dot-one" /><span className="welcome-dot dot-two" /></div>
    <p className="eyebrow">YOUR SPACE, YOUR PEOPLE</p>
    <h1>Make room for<br /><span>good conversations.</span></h1>
    <p className="welcome-description">Pick a conversation from the sidebar or start a new one. Your messages, presence, and read receipts stay in sync.</p>
    <button className="primary-button" onClick={onNewConversation}><Plus size={17} /> New conversation</button>
    <div className="welcome-meta"><span><i /> {conversations.length} active {conversations.length === 1 ? 'conversation' : 'conversations'}</span><span>End-to-end connection to your API</span></div>
  </div>;
}

function ConversationView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const {
    activeConversation, activeConversationId, messages, hasMoreMessages,
    loadingMessages, loadingOlder, socketConnected, presence, typingUsers,
    loadOlderMessages, sendMessage, retryMessage, deleteMessage,
    markRead, setTyping,
  } = useChat();
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latestSeq = messages.reduce((max, item) => Math.max(max, item.seq), 0);

  useEffect(() => {
    if (activeConversationId && latestSeq > 0) void markRead(activeConversationId, latestSeq).catch(() => undefined);
  }, [activeConversationId, latestSeq, markRead]);

  useEffect(() => {
    setReplyTo(null);
    setDetailsOpen(false);
  }, [activeConversationId]);

  if (!activeConversation || !activeConversationId) {
    return <div className="conversation-loading"><span className="button-spinner" /> Opening conversation…</div>;
  }

  const title = conversationTitle(activeConversation, user?.id);
  const peer = activeConversation.members.find((member) => member.userId !== user?.id) || activeConversation.members[0];
  const peerPresence = peer ? presence[peer.userId] : undefined;
  const online = peerPresence?.online ?? activeConversation.peerPresence?.online ?? false;
  const lastSeenAt = peerPresence?.lastSeenAt ?? activeConversation.peerPresence?.lastSeenAt;
  const typingNames = typingUsers.map((id) => getMemberName(activeConversation, id)).filter(Boolean);

  async function handleSend(content: string) {
    try {
      await sendMessage(content, replyTo?.id || null);
      setReplyTo(null);
    } catch (error) {
      window.dispatchEvent(new CustomEvent('chat:notice', { detail: (error as Error).message || 'Message could not be sent.' }));
    }
  }

  return (
    <div className="conversation-layout">
      <div className="conversation-main">
        <header className="chat-header">
          <button className="mobile-back icon-button" onClick={onBack} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
          <Avatar name={title} src={conversationAvatar(activeConversation, user?.id)} group={activeConversation.type === 'GROUP'} online={activeConversation.type === 'DIRECT' ? online : undefined} />
          <div className="chat-header-copy"><strong>{title}</strong><span>{activeConversation.type === 'GROUP' ? `${activeConversation.memberCount} members` : online ? 'Online now' : peerPresence?.lastSeenAt || activeConversation.peerPresence?.lastSeenAt ? `Last seen ${formatTime(lastSeenAt)}` : 'Offline'}</span></div>
          <span className={`chat-live-status ${socketConnected ? 'live' : ''}`}>{socketConnected ? 'Live' : 'Reconnecting'}</span>
          <button className="icon-button header-action" onClick={() => setDetailsOpen((open) => !open)} aria-label="Conversation details">{detailsOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
          <button className="icon-button header-action" aria-label="More options" onClick={() => setDetailsOpen(true)}><MoreVertical size={18} /></button>
        </header>
        <MessagesPane
          conversation={activeConversation}
          messages={messages}
          currentUserId={user?.id || ''}
          loading={loadingMessages}
          typingNames={typingNames}
          hasMore={hasMoreMessages}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlderMessages}
          onReply={setReplyTo}
          onDelete={deleteMessage}
          onRetry={retryMessage}
        />
        <Composer
          key={activeConversationId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={handleSend}
          onTyping={(typing) => setTyping(activeConversationId, typing)}
          disabled={!socketConnected}
        />
      </div>
      {detailsOpen && <ConversationDetails conversation={activeConversation} onClose={() => setDetailsOpen(false)} />}
    </div>
  );
}

function MessagesPane({
  conversation, messages, currentUserId, loading, typingNames, hasMore, loadingOlder,
  onLoadOlder, onReply, onDelete, onRetry,
}: {
  conversation: Conversation;
  messages: LocalMessage[];
  currentUserId: string;
  loading: boolean;
  typingNames: string[];
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => Promise<void>;
  onReply: (message: LocalMessage) => void;
  onDelete: (message: LocalMessage) => Promise<void>;
  onRetry: (message: LocalMessage) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<{ height: number; top: number } | null>(null);
  const wasNearBottom = useRef(true);
  const previousLength = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (previousHeight.current) {
      const previous = previousHeight.current;
      element.scrollTop = element.scrollHeight - previous.height + previous.top;
      previousHeight.current = null;
    } else if (messages.length > previousLength.current && wasNearBottom.current) {
      element.scrollTop = element.scrollHeight;
    } else if (previousLength.current === 0) {
      element.scrollTop = element.scrollHeight;
    }
    previousLength.current = messages.length;
  }, [messages.length, loading]);

  function loadOlder() {
    const element = scrollRef.current;
    if (element) previousHeight.current = { height: element.scrollHeight, top: element.scrollTop };
    void onLoadOlder();
  }

  return (
    <div className="messages-scroll" ref={scrollRef} onScroll={(event) => {
      const element = event.currentTarget;
      wasNearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    }}>
      <div className="messages-inner">
        <div className="conversation-start-card">
          <Avatar name={conversationTitle(conversation, currentUserId)} src={conversationAvatar(conversation, currentUserId)} group={conversation.type === 'GROUP'} size="xl" />
          <strong>{conversationTitle(conversation, currentUserId)}</strong>
          <span>{conversation.type === 'GROUP' ? `A shared space with ${conversation.memberCount} members` : 'This is the beginning of your conversation.'}</span>
        </div>
        {hasMore && <button className="load-older-button" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? <span className="button-spinner" /> : <ArrowUp size={14} />} Load earlier messages</button>}
        {loading && messages.length === 0 && <div className="messages-loading"><span className="button-spinner" /> Loading messages…</div>}
        {!loading && messages.length === 0 && <div className="empty-messages">No messages yet. Send the first one below.</div>}
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const own = message.senderId === currentUserId;
          const showAuthor = conversation.type === 'GROUP' && !own && message.type !== 'SYSTEM' && message.senderId !== previous?.senderId;
          const status = message.localStatus === 'pending' || message.localStatus === 'sending' ? 'sending'
            : message.localStatus === 'failed' ? 'failed'
              : conversation.receipts.readUpTo >= message.seq && message.seq > 0 ? 'read'
                : conversation.receipts.deliveredUpTo >= message.seq && message.seq > 0 ? 'delivered' : 'sent';
          if (message.type === 'SYSTEM') return <div className="system-message" key={message.id}><span>{message.content}</span><time>{formatTime(message.createdAt)}</time></div>;
          return <div key={message.id} className={`message-row ${own ? 'own-message' : ''} ${message.localStatus === 'failed' ? 'message-failed' : ''}`}>
            {!own && conversation.type === 'GROUP' && <Avatar name={getMemberName(conversation, message.senderId || '')} src={conversation.members.find((member) => member.userId === message.senderId)?.avatarUrl} size="sm" />}
            <div className="message-content-column">
              {showAuthor && <span className="message-author">{getMemberName(conversation, message.senderId || '')}</span>}
              {message.replyTo && <div className="reply-context"><span className="reply-context-line" /><span><strong>Reply</strong>{message.replyTo.preview || 'Original message unavailable'}</span></div>}
              <div className={`message-bubble ${own ? 'bubble-own' : 'bubble-other'} ${message.deletedAt ? 'bubble-deleted' : ''}`}>
                {message.deletedAt ? <span className="deleted-copy">This message was deleted</span> : <span>{message.content}</span>}
                {!message.deletedAt && <div className="message-hover-actions">
                  <button title="Reply" onClick={() => onReply(message)}><Reply size={14} /></button>
                  {own && <button title="Delete message" onClick={() => { if (window.confirm('Delete this message for everyone?')) void onDelete(message); }}><Trash2 size={14} /></button>}
                </div>}
              </div>
              <div className={`message-meta ${own ? 'meta-own' : ''}`}>
                <time>{formatTime(message.createdAt)}</time>
                {own && <span className={`message-status status-${status}`} title={status === 'read' ? 'Read' : status === 'delivered' ? 'Delivered' : status === 'failed' ? 'Not sent' : status === 'sending' ? 'Sending' : 'Sent'}>
                  {status === 'failed' ? <button onClick={() => void onRetry(message)}>Retry</button> : status === 'read' ? <CheckCheck size={14} /> : status === 'delivered' ? <CheckCheck size={14} /> : <Check size={14} />}
                </span>}
              </div>
              {message.localStatus === 'failed' && <span className="message-error-text">{message.localError || 'Could not send'}</span>}
            </div>
          </div>;
        })}
        {typingNames.length > 0 && <div className="typing-indicator"><span className="typing-dots"><i /><i /><i /></span><span>{typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.length} people are typing`}</span></div>}
      </div>
    </div>
  );
}

function Composer({
  replyTo, onCancelReply, onSend, onTyping, disabled,
}: {
  replyTo: LocalMessage | null;
  onCancelReply: () => void;
  onSend: (content: string) => Promise<void>;
  onTyping: (typing: boolean) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      onTyping(false);
    };
  }, [onTyping]);

  async function submit() {
    const content = value.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    setValue('');
    onTyping(false);
    try {
      await onSend(content);
    } catch {
      setValue(content);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function onChange(nextValue: string) {
    setValue(nextValue);
    if (nextValue.trim()) {
      onTyping(true);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => onTyping(false), 1800);
    } else {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      onTyping(false);
    }
  }

  return (
    <div className="composer-wrap">
      {replyTo && <div className="replying-to"><span><Reply size={15} /><strong>Replying to {replyTo.senderId ? 'message' : 'your message'}</strong><small>{replyTo.content || 'Message deleted'}</small></span><button onClick={onCancelReply} aria-label="Cancel reply"><X size={16} /></button></div>}
      <div className="composer-box">
        <textarea ref={textareaRef} rows={1} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={disabled ? 'Reconnecting to the server…' : 'Write a message…'} disabled={disabled || sending} />
        <div className="composer-actions"><span className="composer-hint">Enter to send <i /> Shift + Enter for a new line</span><button className="send-button" onClick={() => void submit()} disabled={!value.trim() || sending || disabled} aria-label="Send message">{sending ? <span className="button-spinner" /> : <Send size={17} />}</button></div>
      </div>
    </div>
  );
}

function ConversationDetails({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const { user } = useAuth();
  const { presence, renameGroup, addMembers, removeMember, leaveGroup } = useChat();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.name || '');
  const [adding, setAdding] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  const me = conversation.members.find((member) => member.userId === user?.id);
  const canManage = me?.role === 'OWNER' || me?.role === 'ADMIN';
  const peer = conversation.members.find((member) => member.userId !== user?.id);

  useEffect(() => setName(conversation.name || ''), [conversation.name]);
  useEffect(() => {
    if (!adding || memberQuery.trim().length < 2) { setMemberResults([]); return; }
    let alive = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await api.searchUsers(memberQuery.trim(), 20);
        if (alive) setMemberResults(results.filter((item) => !conversation.members.some((member) => member.userId === item.id)));
      } catch (reason) { if (alive) setError((reason as Error).message); }
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [adding, memberQuery, conversation.members]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await renameGroup(conversation.id, name.trim()); setRenaming(false); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function addSelected() {
    if (!selectedIds.length) return;
    setBusy(true); setError('');
    try { await addMembers(conversation.id, selectedIds); setSelectedIds([]); setMemberQuery(''); setAdding(false); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  async function showProfile(userId: string) {
    try { setProfileUser(await api.getUser(userId)); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function confirmLeave() {
    if (!window.confirm('Leave this group? You will no longer receive its messages.')) return;
    setBusy(true);
    try { await leaveGroup(conversation.id); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  const directPresence = peer ? presence[peer.userId] : undefined;

  return (
    <aside className="details-panel">
      <header className="details-header"><strong>Details</strong><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></header>
      <div className="details-hero">
        <Avatar name={conversationTitle(conversation, user?.id)} src={conversationAvatar(conversation, user?.id)} group={conversation.type === 'GROUP'} size="xl" online={conversation.type === 'DIRECT' ? directPresence?.online ?? conversation.peerPresence?.online : undefined} />
        {renaming ? <form onSubmit={saveName} className="rename-form"><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus /><button className="mini-primary" disabled={busy}><Check size={14} /></button><button type="button" className="mini-quiet" onClick={() => setRenaming(false)}><X size={14} /></button></form> : <><h3>{conversationTitle(conversation, user?.id)}</h3>{conversation.type === 'GROUP' && <span>{conversation.memberCount} members</span>}{conversation.type === 'DIRECT' && <span>{directPresence?.online ?? conversation.peerPresence?.online ? 'Online now' : 'Direct conversation'}</span>}</>}
        {conversation.type === 'GROUP' && canManage && !renaming && <button className="text-button edit-name-button" onClick={() => setRenaming(true)}><Pencil size={13} /> Rename group</button>}
      </div>
      {conversation.type === 'DIRECT' && peer && <div className="details-section">
        <h4>PERSON</h4>
        <button className="member-row profile-member-row" onClick={() => void showProfile(peer.userId)}><Avatar name={peer.displayName} src={peer.avatarUrl} size="md" online={directPresence?.online ?? conversation.peerPresence?.online ?? false} /><span><strong>{peer.displayName}</strong><small>{directPresence?.online ?? conversation.peerPresence?.online ? 'Online' : 'Offline'}</small></span><ArrowRight size={15} /></button>
      </div>}
      {conversation.type === 'GROUP' && <div className="details-section">
        <div className="section-heading-row"><h4>MEMBERS · {conversation.memberCount}</h4>{canManage && <button className="small-icon-action" onClick={() => setAdding((value) => !value)}><UserPlus size={15} /> Add</button>}</div>
        {adding && <div className="add-members-box"><div className="search-field small-search"><Search size={15} /><input placeholder="Find people to add" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} /></div>
          {selectedIds.length > 0 && <div className="selected-count">{selectedIds.length} selected</div>}
          {memberResults.map((person) => <button className={`member-search-result ${selectedIds.includes(person.id) ? 'selected' : ''}`} key={person.id} onClick={() => setSelectedIds((ids) => ids.includes(person.id) ? ids.filter((id) => id !== person.id) : [...ids, person.id])}><Avatar name={person.displayName} src={person.avatarUrl} size="sm" /><span>{person.displayName}</span>{selectedIds.includes(person.id) && <Check size={14} />}</button>)}
          {memberQuery.length >= 2 && memberResults.length === 0 && <p className="inline-hint">No available users found.</p>}
          <button className="primary-button full-button compact-primary" disabled={busy || selectedIds.length === 0} onClick={() => void addSelected()}>{busy ? 'Adding…' : `Add ${selectedIds.length || ''} member${selectedIds.length === 1 ? '' : 's'}`}</button>
        </div>}
        <div className="member-list">{conversation.members.map((member) => {
          const online = presence[member.userId]?.online || false;
          const canRemove = canManage && member.userId !== user?.id && (me?.role === 'OWNER' || (member.role === 'MEMBER' && me?.role === 'ADMIN'));
          return <div className="member-row" key={member.userId}>
            <button className="member-main" onClick={() => void showProfile(member.userId)}><Avatar name={member.displayName} src={member.avatarUrl} size="sm" online={online} /><span><strong>{member.displayName}{member.userId === user?.id ? ' (you)' : ''}</strong><small>{member.role.toLowerCase()}</small></span></button>
            {member.role === 'OWNER' ? <span className="role-chip">Owner</span> : canRemove && <button className="remove-member-button" title={`Remove ${member.displayName}`} onClick={() => { if (window.confirm(`Remove ${member.displayName} from this group?`)) void removeMember(conversation.id, member.userId).catch((reason) => setError((reason as Error).message)); }}><X size={14} /></button>}
          </div>;
        })}</div>
      </div>}
      {error && <p className="details-error">{error}</p>}
      {conversation.type === 'GROUP' && <div className="details-bottom"><button className="leave-group-button" onClick={() => void confirmLeave()} disabled={busy}><LogOut size={15} /> Leave group</button></div>}
      {profileUser && <div className="profile-popover"><button className="icon-button profile-popover-close" onClick={() => setProfileUser(null)}><X size={15} /></button><Avatar name={profileUser.displayName} src={profileUser.avatarUrl} size="xl" /><strong>{profileUser.displayName}</strong><span>@{profileUser.username}</span><small>Member since {profileUser.createdAt ? new Date(profileUser.createdAt).toLocaleDateString() : '—'}</small></div>}
    </aside>
  );
}
