import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { behavioralTrend, elder, fallEvidenceTemplate, zones } from '../data/seed.js';
import { buildRecommendation } from '../services/recommender.js';
import { resetConsent } from '../services/consent.js';
import { resetAudit } from '../services/auditLog.js';

// In-memory incident/risk state machine.
// Mirrors the "Incident & risk service" node in the solution architecture:
// one shared state machine for all three detectors (fall, behavioral, wandering).

export const bus = new EventEmitter();

const incidents = new Map();
let deviceOnline = true;

const FALL_CANDIDATE_DELAY_MS = 700; // Stage 1 candidate check
const FALL_CONFIRM_WINDOW_MS = 6000; // Stage 2: 5-8s watch window (demo uses 6s)

function pushIncident(incident) {
  incidents.set(incident.id, incident);
  return incident;
}

function addTimeline(incident, event, extra = {}) {
  incident.timeline.push({ ts: new Date().toISOString(), event, ...extra });
}

function emitIncident(kind, incident) {
  bus.emit(kind, incident);
}

// Run the Drafter → Validator → Critic chain and attach the result.
// Replaces the hardcoded recommendation strings this POC started with.
function attachRecommendation(incident) {
  const hour = new Date().getHours();
  const recentDismissals = Array.from(incidents.values()).filter(
    (i) => i.id !== incident.id && i.type === incident.type && i.status === 'dismissed'
  ).length;

  const { recommendation, chain, requiresHumanSignOff } = buildRecommendation(incident, {
    isNight: hour >= 21 || hour < 6,
    recentDismissals,
    trendDeclining: behavioralTrend.summary.commonAreaTimeChangePct <= -30,
  });

  incident.explain.recommendation = recommendation?.text ?? null;
  incident.recommendation = recommendation;
  incident.recommendationChain = chain;
  incident.requiresHumanSignOff = requiresHumanSignOff;
  return incident;
}

export function listIncidents() {
  return Array.from(incidents.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getIncident(id) {
  return incidents.get(id);
}

export function getDeviceStatus() {
  return {
    devices: [
      { id: 'edge-node-01', room: 'Living room', status: deviceOnline ? 'online' : 'offline', fps: 8 },
      { id: 'edge-node-02', room: 'Bedroom', status: 'online', fps: 6 },
      { id: 'edge-node-03', room: 'Front door', status: 'online', fps: 8 },
    ],
    piiMasking: 'enforced',
    rawVideoRetention: 'edge-only, 24h rolling buffer',
  };
}

// ---- Fall detection state machine -----------------------------------

export function triggerFall({ outcome = 'confirmed' } = {}) {
  const id = `inc-${nanoid(8)}`;
  const incident = {
    id,
    type: 'fall',
    detector: 'Fall detection',
    stage: 'observe',
    status: 'candidate',
    elder,
    room: 'Living room',
    confidence: 0.31,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    resolvedAt: null,
    resolution: null,
    context: {},
    explain: {
      what: fallEvidenceTemplate.what,
      why: 'Stage 1 candidate check: drop speed and body-shape change detected. Verifying...',
      evidence: fallEvidenceTemplate.evidenceSummary,
      recommendation: null,
    },
    timeline: [],
  };
  addTimeline(incident, 'Stage 1: candidate check started (drop speed & shape change)');
  pushIncident(incident);
  emitIncident('incident:new', incident);

  setTimeout(() => {
    const inc = getIncident(id);
    if (!inc) return;
    inc.status = 'suspected';
    inc.stage = 'understand';
    inc.confidence = 0.58;
    inc.explain.why = fallEvidenceTemplate.whyTemplate(false);
    addTimeline(inc, 'Fall suspected — confirmation timer started (5–8s watch window)');
    emitIncident('incident:update', inc);

    setTimeout(() => {
      const inc2 = getIncident(id);
      if (!inc2) return;
      if (outcome === 'reset') {
        inc2.status = 'resolved';
        inc2.stage = 'understand';
        inc2.resolution = 'auto_reset';
        inc2.resolvedAt = new Date().toISOString();
        inc2.confidence = 0.12;
        inc2.explain.why = 'Recovery motion seen during the watch window. No escalation needed.';
        addTimeline(inc2, 'No fall — recovery motion seen, resumed normal tracking');
        emitIncident('incident:update', inc2);
        return;
      }

      inc2.status = 'confirmed';
      inc2.stage = 'alert';
      inc2.confidence = 0.93;
      inc2.confirmedAt = new Date().toISOString();
      inc2.explain.why = fallEvidenceTemplate.whyTemplate(true);
      attachRecommendation(inc2);
      addTimeline(inc2, 'Fall confirmed — no recovery motion, escalated to caregiver');
      addTimeline(inc2, 'Recommendation drafted, validated and passed to caregiver for sign-off');
      emitIncident('incident:update', inc2);
      emitIncident('incident:alert', inc2);
    }, FALL_CONFIRM_WINDOW_MS);
  }, FALL_CANDIDATE_DELAY_MS);

  return incident;
}

// ---- Social isolation --------------------------------------------------
// Loneliness treated as a risk signal to escalate to a person, not as a gap
// for the system to fill itself. Built on the "social presence" baseline
// signal already named in the architecture.

export function triggerIsolation() {
  const id = `inc-${nanoid(8)}`;
  const s = behavioralTrend.summary;

  const incident = {
    id,
    type: 'isolation',
    detector: 'Behavioural anomaly — social isolation',
    stage: 'prevent',
    status: 'confirmed',
    elder,
    room: 'Whole home',
    confidence: 0.79,
    createdAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    resolvedAt: null,
    resolution: null,
    context: {
      daysSinceVisitor: s.daysSinceVisitor,
      visitorsPerWeekBaseline: s.visitorsPerWeekBaseline,
      socialPresenceChangePct: s.socialPresenceChangePct,
      windowDays: s.windowDays,
    },
    evidenceFrames: [],
    explain: {
      what: `No visitor detected for ${s.daysSinceVisitor} days`,
      why: `Social presence is down ${Math.abs(s.socialPresenceChangePct)}% against ${elder.name.split(' ')[0]}'s own baseline of about ${s.visitorsPerWeekBaseline} visits a week. Visits stopped ${s.daysSinceVisitor} days ago; her own activity only began declining ${s.daysSinceVisitor - s.isolationLeadDays} days ago. The isolation leads the decline by ${s.isolationLeadDays} days, which is why it is worth acting on now.`,
      evidence:
        'Daily counts of whether another person was present, aggregated on the edge device. No audio, no identity, no conversation content.',
      recommendation: null,
    },
    timeline: [],
  };

  addTimeline(incident, `Social presence below personal baseline for ${s.windowDays} consecutive days`);
  addTimeline(incident, 'Isolation flagged for human follow-up');
  attachRecommendation(incident);
  pushIncident(incident);
  emitIncident('incident:new', incident);
  emitIncident('incident:alert', incident);
  return incident;
}

// ---- Wandering / perimeter -------------------------------------------

export function triggerZoneCrossing({ supervised = false } = {}) {
  const id = `inc-${nanoid(8)}`;
  const restrictedZone = zones.find((z) => z.kind === 'restricted');
  const hour = new Date().getHours();
  const isNight = hour >= 21 || hour < 6;

  const supervisedText = supervised
    ? 'Another person was in frame at the time of the crossing — treated as supervised movement.'
    : 'No other person was detected nearby — treated as an unsupervised exit.';

  const incident = {
    id,
    type: 'wandering',
    detector: 'Wandering / perimeter',
    stage: supervised ? 'understand' : 'alert',
    status: supervised ? 'logged' : 'confirmed',
    elder,
    room: restrictedZone?.label ?? 'Front door',
    confidence: supervised ? 0.42 : 0.87,
    createdAt: new Date().toISOString(),
    confirmedAt: supervised ? null : new Date().toISOString(),
    resolvedAt: null,
    resolution: null,
    context: {
      supervised,
      timeOfDay: isNight ? 'night' : 'day',
      zone: restrictedZone?.id ?? 'front-door',
    },
    explain: {
      what: `${restrictedZone?.label ?? 'Front door'} boundary crossing detected`,
      why: `Virtual perimeter crossed. ${supervisedText} Evaluated with time of day (${isNight ? 'night' : 'day'}) and nearby-person context.`,
      evidence: 'Zone-crossing event, edge-processed against the configured safe/restricted boundary.',
      recommendation: null,
    },
    timeline: [],
  };

  addTimeline(
    incident,
    supervised
      ? 'Boundary crossing logged — supervised movement, no escalation'
      : 'Boundary crossing confirmed — unsupervised exit, escalated to caregiver'
  );

  attachRecommendation(incident);
  pushIncident(incident);
  emitIncident('incident:new', incident);
  if (!supervised) {
    emitIncident('incident:alert', incident);
  }
  return incident;
}

// ---- Live CV-driven fall detection --------------------------------------
// Driven by the in-browser pose detector. Only selected evidence frames are
// stored (never a continuous stream), keeping with edge-privacy by design.

const MAX_EVIDENCE_FRAMES = 8;

export function startLiveFall({ reason, metrics, frames = [] }) {
  const id = `inc-${nanoid(8)}`;
  const incident = {
    id,
    type: 'fall',
    detector: 'Fall detection (live CV)',
    source: 'live-cv',
    stage: 'understand',
    status: 'suspected',
    elder,
    room: 'Living room',
    confidence: 0.58,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    resolvedAt: null,
    resolution: null,
    context: { metrics },
    evidenceFrames: frames.slice(-MAX_EVIDENCE_FRAMES),
    explain: {
      what: 'Possible fall detected in the Living Room',
      why: reason ?? 'Stage 1 candidate check triggered from live pose keypoints.',
      evidence: 'Key frames captured at the moment of the event — no continuous recording is kept.',
      recommendation: null,
    },
    timeline: [],
  };
  addTimeline(incident, 'Stage 1: candidate detected from live pose keypoints');
  addTimeline(incident, 'Fall suspected — confirmation timer started (5–8s watch window)');
  pushIncident(incident);
  emitIncident('incident:new', incident);
  return incident;
}

export function advanceLiveFall(id, { outcome, reason, frames = [], confidence, motionEnergy }) {
  const incident = getIncident(id);
  if (!incident) return null;

  if (frames.length) {
    incident.evidenceFrames = [...(incident.evidenceFrames ?? []), ...frames].slice(-MAX_EVIDENCE_FRAMES);
  }

  if (outcome === 'recovered') {
    incident.status = 'resolved';
    incident.resolution = 'auto_reset';
    incident.resolvedAt = new Date().toISOString();
    incident.confidence = 0.12;
    incident.explain.why = reason ?? 'Recovery motion seen during the watch window. No escalation needed.';
    addTimeline(incident, 'No fall — recovery motion seen, resumed normal tracking');
    emitIncident('incident:update', incident);
    return incident;
  }

  incident.status = 'confirmed';
  incident.stage = 'alert';
  incident.confidence = confidence ?? 0.93;
  incident.confirmedAt = new Date().toISOString();
  incident.context = { ...incident.context, motionEnergy };
  incident.explain.why = reason ?? 'No recovery motion was seen during the confirmation window.';
  attachRecommendation(incident);
  addTimeline(incident, 'Fall confirmed — no recovery motion, escalated to caregiver');
  addTimeline(incident, 'Recommendation drafted, validated and passed to caregiver for sign-off');
  emitIncident('incident:update', incident);
  emitIncident('incident:alert', incident);
  return incident;
}

// ---- Incident voice ----------------------------------------------------
// Two-way audio, available only while a confirmed incident is open. There is
// no always-on microphone and no path that records or transcribes: the device
// opens a live channel and closes it. Nothing is retained but the fact of the
// call, which the audit trail needs.

export function startVoiceSession(id, actor = 'Primary caregiver') {
  const incident = getIncident(id);
  if (!incident) return { error: 'not_found' };
  if (!['confirmed', 'escalated', 'acknowledged'].includes(incident.status)) {
    return { error: 'Voice is available only while a confirmed incident is open' };
  }
  incident.voice = { state: 'live', startedAt: new Date().toISOString(), by: actor };
  addTimeline(incident, `Voice channel opened by ${actor} — live audio, not recorded`);
  emitIncident('incident:update', incident);
  return { incident };
}

export function endVoiceSession(id, seconds = 0) {
  const incident = getIncident(id);
  if (!incident) return { error: 'not_found' };
  if (incident.voice?.state !== 'live') return { error: 'No live voice session' };
  incident.voice = {
    ...incident.voice,
    state: 'ended',
    endedAt: new Date().toISOString(),
    durationSeconds: Math.round(seconds),
  };
  addTimeline(incident, `Voice channel closed after ${Math.round(seconds)}s — no recording kept`);
  emitIncident('incident:update', incident);
  return { incident };
}

// ---- Caregiver actions -------------------------------------------------

export function applyAction(id, action) {
  const incident = getIncident(id);
  if (!incident) return null;

  const map = {
    acknowledge: 'acknowledged',
    escalate: 'escalated',
    dismiss: 'dismissed',
  };
  const status = map[action];
  if (!status) return incident;

  incident.status = status;
  incident.stage = action === 'dismiss' ? incident.stage : 'recommend';
  incident.resolvedAt = new Date().toISOString();
  incident.resolution = action;
  incident.requiresHumanSignOff = false;
  addTimeline(incident, `Human sign-off: caregiver chose to ${action}`);
  emitIncident('incident:update', incident);
  return incident;
}

export function resetDemo() {
  incidents.clear();
  deviceOnline = true;
  resetConsent();
  resetAudit();
  bus.emit('demo:reset', {});
}
