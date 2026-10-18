import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PipelineStrip from '../components/PipelineStrip';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

const KIND_COLOR = { safe: '#12b76a', common: '#2f6fed', restricted: '#f04438' };

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function Zones() {
  const { socketTick } = useAuth();
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [events, setEvents] = useState([]);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    api.getZones().then(({ zones }) => setZones(zones));
    api.listIncidents().then(({ incidents }) => setEvents(incidents.filter((i) => i.type === 'wandering')));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = (incident) => {
      if (incident.type !== 'wandering') return;
      setEvents((prev) => [incident, ...prev.filter((e) => e.id !== incident.id)]);
      setFlash(incident.id);
      setTimeout(() => setFlash(null), 2400);
    };
    socket.on('incident:new', onNew);
    return () => socket.off('incident:new', onNew);
  }, [socketTick]);

  const restrictedZone = zones.find((z) => z.kind === 'restricted');
  const activeFlash = events.find((e) => e.id === flash);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Zones — Wandering / Perimeter</h1>
        <p>Virtual safe / restricted zones. A boundary crossing is interpreted with time of day and whether another person is nearby.</p>
      </div>

      <PipelineStrip activeKey="understand" />
      <div style={{ height: 18 }} />

      <div className="grid cols-2">
        <div className="card">
          <div className="section-title">Home floor plan</div>
          <svg viewBox="0 0 540 360" width="100%" className="zone-map">
            {zones.map((z) => (
              <g key={z.id}>
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  fill={`${KIND_COLOR[z.kind]}0d`}
                  stroke={KIND_COLOR[z.kind]}
                  strokeWidth="1.6"
                  strokeDasharray={z.kind === 'restricted' ? '0' : '5 4'}
                  rx="8"
                />
                <text x={z.x + 12} y={z.y + 22} fontSize="12" fontWeight="700" fill="#334155">
                  {z.label}
                </text>
                <text x={z.x + 12} y={z.y + 38} fontSize="10" fill="#94a3b8" style={{ textTransform: 'uppercase' }}>
                  {z.kind}
                </text>
              </g>
            ))}
            {restrictedZone && activeFlash && (
              <circle
                cx={restrictedZone.x + restrictedZone.w / 2}
                cy={restrictedZone.y + restrictedZone.h / 2}
                r="14"
                fill={activeFlash.context?.supervised ? '#12b76a' : '#f04438'}
                opacity="0.85"
              >
                <animate attributeName="r" values="14;28;14" dur="1.4s" repeatCount="3" />
                <animate attributeName="opacity" values="0.85;0.15;0.85" dur="1.4s" repeatCount="3" />
              </circle>
            )}
          </svg>
          <div className="flex gap-8" style={{ marginTop: 12, fontSize: 12 }}>
            <span className="muted">● Safe</span>
            <span className="muted">● Common</span>
            <span className="muted">● Restricted</span>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Crossing log</div>
          {events.length === 0 && <div className="empty-state">No boundary crossings yet.</div>}
          {events.map((e) => (
            <div key={e.id} className="zone-log-item" style={{ cursor: 'pointer' }} onClick={() => navigate(`/incidents/${e.id}`)}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  marginTop: 5,
                  background: e.context?.supervised ? 'var(--safe)' : 'var(--danger)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {e.context?.supervised ? 'Supervised crossing' : 'Unsupervised exit'} — {e.room}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{fmtTime(e.createdAt)} · {e.context?.timeOfDay} · confidence {(e.confidence * 100).toFixed(0)}%</div>
              </div>
              <span className={`status-pill ${e.status}`}>{e.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
