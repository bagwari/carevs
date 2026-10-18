import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConfidenceGauge from '../components/ConfidenceGauge';
import EvidenceFrames from '../components/EvidenceFrames';
import IsolationEvidence from '../components/IsolationEvidence';
import PipelineStrip from '../components/PipelineStrip';
import VoiceLink from '../components/VoiceLink';
import PoseEvidence from '../components/PoseEvidence';
import RecommendationChain from '../components/RecommendationChain';
import StateTrack from '../components/StateTrack';
import ZoneCrossingEvidence from '../components/ZoneCrossingEvidence';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function IncidentDetail() {
  const { id } = useParams();
  const { user, socketTick } = useAuth();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState(null);
  const [fhir, setFhir] = useState(null);
  const [trendDays, setTrendDays] = useState([]);

  useEffect(() => {
    let mounted = true;
    api
      .getIncident(id)
      .then(({ incident }) => mounted && setIncident(incident))
      .catch((e) => mounted && setError(e.message));
    return () => {
      mounted = false;
    };
  }, [id]);

  // The isolation evidence strip needs the daily presence series.
  useEffect(() => {
    if (incident?.type !== 'isolation' || trendDays.length) return;
    api
      .getTrend(incident.elder?.id ?? 'elder-1')
      .then(({ trend }) => setTrendDays(trend.days))
      .catch(() => {});
  }, [incident?.type, incident?.elder?.id, trendDays.length]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onUpdate = (inc) => {
      if (inc.id === id) setIncident(inc);
    };
    socket.on('incident:update', onUpdate);
    socket.on('incident:new', onUpdate);
    return () => {
      socket.off('incident:update', onUpdate);
      socket.off('incident:new', onUpdate);
    };
  }, [id, socketTick]);

  if (error) {
    return (
      <div className="page">
        <div className="card">Couldn't load this incident: {error}</div>
      </div>
    );
  }
  if (!incident) {
    return (
      <div className="page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const doAction = async (action) => {
    setActing(true);
    try {
      const { incident: updated } = await api.actOnIncident(id, action);
      setIncident(updated);
    } finally {
      setActing(false);
    }
  };

  // Isolation is a standing concern, not an emergency — it must not wear the
  // same red as a confirmed fall.
  const headClass =
    incident.type === 'isolation'
      ? 'decision-card__head stage-isolation'
      : `decision-card__head stage-${incident.status}`;

  return (
    <div className="page">
      <button className="btn ghost small" style={{ marginBottom: 14 }} onClick={() => navigate('/console')}>
        ← Back to console
      </button>

      <PipelineStrip activeKey={incident.stage} />
      <div style={{ height: 18 }} />

      {/* ---------- CAREGIVER: full decision-moment card ---------- */}
      {incident.view === 'full' && (
        <div className="decision-card">
          <div className={headClass}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {incident.detector}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{incident.explain.what}</div>
            </div>
            <span className={`status-pill ${incident.status}`} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
              {incident.status}
            </span>
          </div>

          <div className="decision-card__body">
            {incident.type === 'fall' && <StateTrack status={incident.status} />}

            <div className="grid cols-2" style={{ alignItems: 'start' }}>
              <div>
                <div className="qa-grid" style={{ gridTemplateColumns: '1fr', margin: '0 0 16px' }}>
                  <div className="qa-item">
                    <div className="qa-item__label">What happened?</div>
                    <div className="qa-item__value">{incident.explain.what}</div>
                  </div>
                  <div className="qa-item">
                    <div className="qa-item__label">Why was it flagged?</div>
                    <div className="qa-item__value">{incident.explain.why}</div>
                  </div>
                  <div className="qa-item">
                    <div className="qa-item__label">What is the evidence?</div>
                    <div className="qa-item__value">{incident.explain.evidence}</div>
                  </div>
                  {incident.explain.recommendation && (
                    <div className="qa-item">
                      <div className="qa-item__label">What should I do next?</div>
                      <div className="qa-item__value">{incident.explain.recommendation}</div>
                    </div>
                  )}
                </div>

                <div className="section-title">Confidence</div>
                <ConfidenceGauge value={incident.confidence} />

                <RecommendationChain
                  chain={incident.recommendationChain}
                  requiresHumanSignOff={incident.requiresHumanSignOff}
                />

                <div className="actions-row">
                  <button className="btn danger" disabled={acting} onClick={() => doAction('escalate')}>
                    Escalate
                  </button>
                  <button className="btn primary" disabled={acting} onClick={() => doAction('acknowledge')}>
                    Acknowledge
                  </button>
                  <button className="btn" disabled={acting} onClick={() => doAction('dismiss')}>
                    Dismiss
                  </button>
                </div>
              </div>

              <div>
                {incident.type === 'isolation' ? (
                  <IsolationEvidence incident={incident} days={trendDays} />
                ) : incident.evidenceFrames?.length ? (
                  <EvidenceFrames frames={incident.evidenceFrames} confidence={incident.confidence} />
                ) : incident.type === 'fall' ? (
                  <PoseEvidence status={incident.status} confidence={incident.confidence} room={incident.room} />
                ) : (
                  <ZoneCrossingEvidence incident={incident} />
                )}

                {incident.type === 'fall' &&
                  ['confirmed', 'escalated', 'acknowledged'].includes(incident.status) && (
                    <VoiceLink incident={incident} onUpdate={setIncident} />
                  )}
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="section-title">Timeline</div>
              <div className="timeline">
                {incident.timeline.map((t, i) => (
                  <div key={i} className="timeline-item">
                    <time>{fmtTime(t.ts)}</time>
                    <span>{t.event}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 22 }}>
              <div className="section-title">Clinical exchange</div>
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                This incident can leave the system as a FHIR R4 Observation — the format ABDM's health information
                exchange expects. The subject is a pseudonymous reference; identity resolution stays with the provider.
              </p>
              <button
                className="btn small"
                onClick={() => (fhir ? setFhir(null) : api.getFhir(incident.id).then(setFhir).catch((e) => setError(e.message)))}
              >
                {fhir ? 'Hide FHIR resource' : 'Export as FHIR R4'}
              </button>
              {fhir && (
                <pre className="fhir-block">{JSON.stringify(fhir, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Consent withdrawn for this purpose ---------- */}
      {incident.view === 'consent_withheld' && (
        <div className="decision-card">
          <div className="decision-card__head stage-resolved">
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Not shared
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>Consent withdrawn</div>
            </div>
          </div>
          <div className="decision-card__body">
            <p style={{ margin: 0, fontSize: 15 }}>🔒 {incident.note}</p>
            <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
              The server returned nothing for this purpose. This is enforced at the masking layer, not hidden in the app.
            </p>
          </div>
        </div>
      )}

      {/* ---------- FAMILY: masked summary ---------- */}
      {incident.view === 'masked_summary' && (
        <div className="decision-card">
          <div className={headClass}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Family update
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{incident.elderName}</div>
            </div>
            <span className={`status-pill ${incident.status}`} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
              {incident.status}
            </span>
          </div>
          <div className="decision-card__body">
            <div className="qa-item" style={{ marginBottom: 16 }}>
              <div className="qa-item__label">What's happening</div>
              <div className="qa-item__value" style={{ fontSize: 16 }}>{incident.summary}</div>
            </div>
            <div className="grid cols-2">
              <div className="qa-item">
                <div className="qa-item__label">Handled by</div>
                <div className="qa-item__value">{incident.handledBy}</div>
              </div>
              <div className="qa-item">
                <div className="qa-item__label">Time</div>
                <div className="qa-item__value">{fmtTime(incident.createdAt)}</div>
              </div>
            </div>
            {incident.evidenceFrameCount > 0 && (
              <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                🔒 {incident.evidenceFrameCount} evidence frames exist for this incident but are not shared with family
                members.
              </p>
            )}
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>🔒 {incident.note}</p>
          </div>
        </div>
      )}

      {/* ---------- ADMIN: system-only view ---------- */}
      {incident.view === 'system_only' && (
        <div className="decision-card">
          <div className={headClass}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {incident.detector}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{incident.residentRef}</div>
            </div>
            <span className={`status-pill ${incident.status}`} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
              {incident.status}
            </span>
          </div>
          <div className="decision-card__body">
            <div className="grid cols-3">
              <div className="qa-item">
                <div className="qa-item__label">Device</div>
                <div className="qa-item__value">{incident.deviceId}</div>
              </div>
              <div className="qa-item">
                <div className="qa-item__label">Pipeline stage</div>
                <div className="qa-item__value" style={{ textTransform: 'capitalize' }}>{incident.stage}</div>
              </div>
              <div className="qa-item">
                <div className="qa-item__label">System confidence</div>
                <div className="qa-item__value">{(incident.confidenceScore * 100).toFixed(0)}%</div>
              </div>
              <div className="qa-item">
                <div className="qa-item__label">Evidence frames</div>
                <div className="qa-item__value">{incident.evidenceFrameCount ?? 0} stored · not viewable</div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>🔒 {incident.note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
