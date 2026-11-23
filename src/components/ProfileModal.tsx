import { useState, type FormEvent } from 'react';
import { X, Save, UserRound, Image } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './Avatar';

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, updateProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateProfile({ displayName: displayName.trim(), avatarUrl: avatarUrl.trim() || null });
      onClose();
    } catch (reason) {
      setError((reason as Error).message || 'Could not update your profile.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="modal-header"><div><p className="eyebrow">YOUR ACCOUNT</p><h2 id="profile-title">Edit profile</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <div className="profile-preview"><Avatar name={displayName} src={avatarUrl || null} size="xl" /><div><strong>{displayName || 'Your name'}</strong><span>@{user?.username}</span></div></div>
        <form className="modal-form" onSubmit={submit}>
          <label className="field-label">Display name</label>
          <div className="input-wrap modal-input"><UserRound size={16} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={1} maxLength={50} required /></div>
          <label className="field-label">Avatar URL <span className="optional-label">(optional)</span></label>
          <div className="input-wrap modal-input"><Image size={16} /><input type="url" placeholder="https://…" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} maxLength={500} /></div>
          <p className="field-hint">Use a secure HTTPS image URL. Leave empty to remove your avatar.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full-button" disabled={busy} type="submit">{busy ? <span className="button-spinner" /> : <><Save size={16} /> Save changes</>}</button>
        </form>
        <div className="profile-account-row"><div><strong>{user?.email}</strong><span>Signed in account</span></div><button className="text-button danger-text" onClick={() => void logout()}>Sign out</button></div>
      </section>
    </div>
  );
}
