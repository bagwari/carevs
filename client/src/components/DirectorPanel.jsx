import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function DirectorPanel() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastIncidentId, setLastIncidentId] = useState(null);

  if (!user) return null;

  const run = async (fn) => {
    setBusy(true);
    try {
      const { incident } = await fn();
      if (incident) setLastIncidentId(incident.id);
    } finally {
      setBusy(false);
    }
  };

  const switchRole = async (role) => {
    setBusy(true);
    try {
      await login(role);
      navigate(lastIncidentId ? `/incidents/${lastIncidentId}` : '/console');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="director-toggle" onClick={() => setOpen((o) => !o)} title="Demo director">
        🎬
      </button>
      {open && (
        <div className="director-panel">
          <div className="group">
            <h4>1 · Trigger event</h4>
            <button className="btn danger" disabled={busy} onClick={() => run(() => api.triggerFall('confirmed'))}>
              Trigger fall
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => run(() => api.triggerFall('reset'))}>
              Trigger fall → false alarm
            </button>
          </div>

          <div className="group">
            <h4>2 · Zone crossing</h4>
            <button className="btn danger" disabled={busy} onClick={() => run(() => api.triggerZoneCrossing(false))}>
              Unsupervised exit
            </button>
            <button className="btn" disabled={busy} onClick={() => run(() => api.triggerZoneCrossing(true))}>
              Supervised (companion present)
            </button>
          </div>

          <div className="group">
            <h4>3 · Loneliness</h4>
            <button className="btn warn" disabled={busy} onClick={() => run(() => api.triggerIsolation())}>
              Social isolation flag
            </button>
          </div>

          <div className="group">
            <h4>4 · Same incident, different seat</h4>
            <button className="btn" disabled={busy || user.role === 'admin'} onClick={() => switchRole('admin')}>
              ⚙️ View as Admin
            </button>
            <button className="btn" disabled={busy || user.role === 'caregiver'} onClick={() => switchRole('caregiver')}>
              💚 View as Caregiver
            </button>
            <button className="btn" disabled={busy || user.role === 'family'} onClick={() => switchRole('family')}>
              👪 View as Family
            </button>
            {lastIncidentId && (
              <button className="btn ghost" disabled={busy} onClick={() => navigate(`/incidents/${lastIncidentId}`)}>
                Go to latest incident →
              </button>
            )}
          </div>

          <div className="group" style={{ marginBottom: 0 }}>
            <h4>Reset</h4>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.resetDemo();
                  setLastIncidentId(null);
                  navigate('/console');
                } finally {
                  setBusy(false);
                }
              }}
            >
              ↺ Reset to baseline
            </button>
          </div>
        </div>
      )}
    </>
  );
}
