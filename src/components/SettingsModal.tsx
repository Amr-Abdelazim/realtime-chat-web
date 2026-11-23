import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, RefreshCw, X } from 'lucide-react';
import { api, API_BASE, SOCKET_URL } from '../lib/api';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<{ status: string; uptime?: number; instanceId?: string } | null>(null);
  const [ready, setReady] = useState<{ status: string; checks?: { postgres: boolean; redis: boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function check() {
    setLoading(true);
    setError('');
    try {
      const [healthResult, readyResult] = await Promise.all([api.health(), api.ready()]);
      setHealth(healthResult);
      setReady(readyResult);
    } catch (reason) {
      setError((reason as Error).message || 'Could not reach the API.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void check(); }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header"><div><p className="eyebrow">CONNECTION</p><h2 id="settings-title">System status</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        <div className="status-intro"><span className="status-icon"><Activity size={20} /></span><div><strong>Backend diagnostics</strong><span>Public health and readiness endpoints</span></div><button className="icon-button" onClick={() => void check()} disabled={loading} aria-label="Refresh status"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button></div>
        <div className="status-list">
          <StatusRow label="API liveness" value={health?.status || (loading ? 'Checking…' : 'Unavailable')} good={health?.status === 'ok'} />
          <StatusRow label="API readiness" value={ready?.status || (loading ? 'Checking…' : 'Unavailable')} good={ready?.status === 'ready'} />
          <StatusRow label="PostgreSQL" value={ready?.checks ? (ready.checks.postgres ? 'Connected' : 'Unavailable') : '—'} good={Boolean(ready?.checks?.postgres)} />
          <StatusRow label="Redis" value={ready?.checks ? (ready.checks.redis ? 'Connected' : 'Unavailable') : '—'} good={Boolean(ready?.checks?.redis)} />
        </div>
        {health && <div className="diagnostic-meta"><span>Uptime</span><strong>{Math.floor(health.uptime || 0).toLocaleString()}s</strong><span>Instance</span><strong>{health.instanceId || '—'}</strong></div>}
        {error && <p className="form-error">{error}</p>}
        <div className="endpoint-block"><span>REST API</span><code>{API_BASE}</code><span>Socket.IO</span><code>{SOCKET_URL} · WebSocket</code></div>
        <p className="field-hint">Realtime presence is maintained with a heartbeat. Access tokens stay in memory; the refresh cookie is HttpOnly.</p>
      </section>
    </div>
  );
}

function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="status-row"><span>{label}</span><strong className={good ? 'status-good' : 'status-neutral'}>{good ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}{value}</strong></div>;
}
