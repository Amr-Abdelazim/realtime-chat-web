import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, MessageCircle, UserRound, AtSign, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login({ email: email.trim(), password });
      else await register({ email: email.trim(), username: username.trim(), password, displayName: displayName.trim() });
    } catch (reason) {
      const apiError = reason as ApiError;
      setError(apiError?.message || 'Unable to authenticate. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><MessageCircle size={22} fill="currentColor" /></span>
          <span>ابعتلي<span className="brand-period">.</span></span>
        </div>
        <div className="auth-heading">
          <p className="eyebrow">REALTIME MESSAGING</p>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Make it official.'}</h1>
          <p>{mode === 'login' ? 'Sign in to pick up where your conversations left off.' : 'Create an account and start conversations that move with you.'}</p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label className="field-label">Email address</label>
          <div className="input-wrap"><Mail size={17} /><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>

          {mode === 'register' && <>
            <label className="field-label">Display name</label>
            <div className="input-wrap"><UserRound size={17} /><input autoComplete="name" placeholder="How people see you" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={1} maxLength={50} required /></div>
            <label className="field-label">Username</label>
            <div className="input-wrap"><AtSign size={17} /><input autoComplete="username" placeholder="your_username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} minLength={3} maxLength={20} required /></div>
          </>}

          <label className="field-label">Password</label>
          <div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'register' ? 8 : undefined} maxLength={72} required /><button type="button" className="input-action" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>

          {error && <div className="form-error">{error}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? <span className="button-spinner" /> : <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={17} /></>}
          </button>
        </form>
        <p className="auth-footnote">Your refresh session is secured in an HttpOnly cookie.</p>
      </section>
      <div className="auth-side-copy">
        <div className="side-copy-line" />
        <p>Good conversations<br /><strong>move everything forward.</strong></p>
        <span>Private by design. In sync by default.</span>
      </div>
    </main>
  );
}
