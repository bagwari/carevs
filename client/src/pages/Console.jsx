import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PipelineStrip from '../components/PipelineStrip';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { describeIncident, isActiveAlert } from '../lib/describeIncident';
import { getSocket } from '../lib/socket';

export default function Console() {
  const { user, socketTick } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .listIncidents()
      .then(({ incidents }) => mounted && setIncidents(incidents))
      .finally(() => mounted && setLoading(false));
    if (user.role === 'admin') {
      api.getDeviceStatus().then(({ devices, piiMasking, rawVideoRetention }) => {
        if (mounted) setDeviceStatus({ devices, piiMasking, rawVideoRetention });
      });
    }
    return () => {
      mounted = false;
    };
  }, [user.role]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const upsert = (incident) => {
      setIncidents((prev) => {
        const exists = prev.some((i) => i.id === incident.id);
        if (exists) return prev.map((i) => (i.id === incident.id ? incident : i));
        return [incident, ...prev];
      });
    };
    const onReset = () => setIncidents([]);

    socket.on('incident:new', upsert);
    socket.on('incident:update', upsert);
    socket.on('incident:alert', upsert);
    socket.on('demo:reset', onReset);
    return () => {
      socket.off('incident:new', upsert);
      socket.off('incident:update', upsert);
      socket.off('incident:alert', upsert);
      socket.off('demo:reset', onReset);
    };
  }, [socketTick]);

  const activeAlerts = incidents.filter(isActiveAlert);
  const isBaseline = activeAlerts.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Caregiver Console</h1>
        <p>
          {user.role === 'caregiver' && 'Kamala Rao — Rao Residence · live status'}
          {user.role === 'admin' && 'System configuration & detector health'}
          {user.role === 'family' && 'Masked summary — high level status only'}
        </p>
      </div>

      <PipelineStrip activeKey={isBaseline ? 'observe' : activeAlerts[0]?.status === 'confirmed' ? 'alert' : 'understand'} />

      <div style={{ height: 18 }} />

      {isBaseline ? (
        <div className="baseline-banner">
          <div className="baseline-banner__dot" />
          <div>
            <h2>All quiet — normal activity</h2>
            <p>No active incidents. Edge inference is running on {user.role === 'admin' ? '3 devices' : 'the home CCTV feed'}.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {activeAlerts.map((incident) => {
            const d = describeIncident(incident);
            const suspected = incident.status === 'candidate' || incident.status === 'suspected';
            const isolation = incident.type === 'isolation';
            return (
              <div
                key={incident.id}
                className={`alert-banner ${isolation ? 'isolation' : suspected ? 'suspected' : ''}`}
                onClick={() => navigate(`/incidents/${incident.id}`)}
              >
                <div className="alert-banner__icon">{isolation ? '☖' : suspected ? '…' : '!'}</div>
                <div style={{ flex: 1 }}>
                  <h3>{d.title}</h3>
                  <p>{d.subtitle}</p>
                </div>
                <span className={`status-pill ${incident.status}`}>{incident.status}</span>
              </div>
            );
          })}
        </div>
      )}

      {user.role === 'admin' && deviceStatus && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="section-title">Device health</div>
          <div className="grid cols-3">
            {deviceStatus.devices.map((d) => (
              <div key={d.id} className="card" style={{ boxShadow: 'none' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.id}</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{d.room}</div>
                <span className={`status-pill ${d.status === 'online' ? 'acknowledged' : 'confirmed'}`}>{d.status}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
            PII masking: <strong>{deviceStatus.piiMasking}</strong> · Raw video: {deviceStatus.rawVideoRetention}
          </p>
        </div>
      )}

      <div className="card">
        <div className="section-title">Recent incidents</div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && incidents.length === 0 && (
          <div className="empty-state">No incidents yet. Use the director panel to trigger the demo.</div>
        )}
        {incidents.map((incident) => {
          const d = describeIncident(incident);
          return (
            <div key={incident.id} className="incident-row" onClick={() => navigate(`/incidents/${incident.id}`)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{d.location}</div>
              </div>
              <span className={`status-pill ${incident.status}`}>{incident.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
