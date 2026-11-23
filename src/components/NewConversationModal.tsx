import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Search, X, Check, Users, MessageSquare, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useChat } from '../context/ChatContext';
import type { User } from '../types';
import { Avatar } from './Avatar';

export function NewConversationModal({ onClose }: { onClose: () => void }) {
  const { createDirect, createGroup } = useChat();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await api.searchUsers(query.trim(), 20);
        if (alive) setResults(found);
      } catch (reason) {
        if (alive) setError((reason as Error).message);
      } finally {
        if (alive) setSearching(false);
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);

  function toggleUser(person: User) {
    setSelected((current) => currentIdsHas(current, person.id)
      ? current.filter((item) => item.id !== person.id)
      : [...current, person]);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    if (selected.length === 0) {
      setError('Choose at least one person first.');
      return;
    }
    if (mode === 'group' && !groupName.trim()) {
      setError('Give your group a name.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'direct') await createDirect(selected[0].id);
      else await createGroup(groupName.trim(), selected.map((item) => item.id));
      onClose();
    } catch (reason) {
      setError((reason as Error).message || 'Could not create the conversation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card new-conversation-modal" role="dialog" aria-modal="true" aria-labelledby="new-chat-title">
        <header className="modal-header">
          <div><p className="eyebrow">START SOMETHING</p><h2 id="new-chat-title">New conversation</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>
        <div className="segmented-tabs">
          <button className={mode === 'direct' ? 'selected' : ''} onClick={() => { setMode('direct'); setSelected([]); setError(''); }}><MessageSquare size={15} /> Direct</button>
          <button className={mode === 'group' ? 'selected' : ''} onClick={() => { setMode('group'); setSelected([]); setError(''); }}><Users size={15} /> Group</button>
        </div>
        {mode === 'group' && <div className="modal-field"><label className="field-label">Group name</label><input className="text-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Design team" maxLength={100} /></div>}
        <label className="field-label">Find people</label>
        <div className="search-field"><Search size={17} /><input autoFocus placeholder="Search by name or username" value={query} onChange={(event) => { setQuery(event.target.value); setError(''); }} /><span>2+ chars</span></div>
        {selected.length > 0 && <div className="selected-people">
          {selected.map((person) => <button type="button" key={person.id} className="selected-person" onClick={() => toggleUser(person)}><Avatar name={person.displayName} src={person.avatarUrl} size="sm" />{person.displayName}<X size={13} /></button>)}
        </div>}
        <div className="user-search-results">
          {searching && <div className="list-message"><span className="button-spinner" /> Searching people…</div>}
          {!searching && query.trim().length < 2 && <div className="list-message">Search for someone by their name or username.</div>}
          {!searching && query.trim().length >= 2 && results.length === 0 && <div className="list-message">No users found. Try another search.</div>}
          {results.map((person) => {
            const isSelected = selectedIds.has(person.id);
            return <button type="button" key={person.id} className={`user-result ${isSelected ? 'is-selected' : ''}`} onClick={() => mode === 'direct' ? setSelected([person]) : toggleUser(person)}>
              <Avatar name={person.displayName} src={person.avatarUrl} />
              <span className="user-result-copy"><strong>{person.displayName}</strong><small>@{person.username}</small></span>
              <span className="selection-check">{isSelected ? <Check size={16} /> : mode === 'group' ? <span className="empty-check" /> : <ArrowRight size={16} />}</span>
            </button>;
          })}
        </div>
        {error && <p className="form-error modal-error">{error}</p>}
        <footer className="modal-footer">
          <span className="muted-label">{selected.length ? `${selected.length} selected` : 'No one selected'}</span>
          <button className="primary-button" disabled={busy || selected.length === 0} onClick={() => void submit()}>{busy ? <span className="button-spinner" /> : mode === 'direct' ? 'Start chat' : 'Create group'} <ArrowRight size={16} /></button>
        </footer>
      </section>
    </div>
  );
}

function currentIdsHas(list: User[], id: string) {
  return list.some((item) => item.id === id);
}
