// Two-stage fall detector driven by real pose keypoints.
// Mirrors the architecture's design: Stage 1 is a fast candidate check from
// pose movement and body-shape change; Stage 2 watches 5-8s for recovery.
//
// Cultural calibration: floor-sitting, floor-sleeping, cross-legged eating and
// prayer postures are normal in many Indian homes. A naive "wide and low in
// frame" trigger fires on all of them. Stage 1 therefore requires evidence of
// an *uncontrolled descent from an upright posture*, and per-home safe floor
// zones suppress the areas where floor presence is expected.

const TORSO_PARTS = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'];

const CONFIG = {
  minKeypointScore: 0.3,
  minTorsoParts: 3,
  // Stage 1 triggers
  dropVelocityThreshold: 0.55, // frame-heights per second
  wideAspectThreshold: 0.95, // bbox w/h — person is wider than tall
  lowCentroidThreshold: 0.62, // torso centre in lower part of frame
  // Stage 2
  confirmWindowMs: 6000,
  nightConfirmWindowMs: 9000, // longer grace at night — sleep is not a fall
  recoveryUprightAspect: 0.75,
  recoveryRiseDelta: 0.08, // torso rises back up this much
  stillnessThreshold: 0.012, // mean per-second motion below this = still
  settleIgnoreMs: 1500, // ignore the fall motion itself when judging stillness
  velocityWindowMs: 400,
  // Cultural calibration
  controlledDescentVelocity: 0.3, // at or below this, the descent was deliberate
  uprightAspectCeiling: 0.8, // aspect below this counts as "was upright"
  uprightWithinMs: 3000, // must have been upright this recently to be a fall
  historyWindowMs: 5000,
};

// Per-home configuration. Normalised [x, y, w, h] rects where floor presence is
// expected — a prayer corner, a floor mattress, a mat used for eating.
let safeFloorZones = [];

export function setSafeFloorZones(zones) {
  safeFloorZones = Array.isArray(zones) ? zones : [];
}

export function getSafeFloorZones() {
  return safeFloorZones;
}

function inSafeFloorZone(m) {
  return safeFloorZones.some(
    (z) => m.torsoX >= z.x && m.torsoX <= z.x + z.w && m.torsoY >= z.y && m.torsoY <= z.y + z.h
  );
}

function isNightNow() {
  const h = new Date().getHours();
  return h >= 21 || h < 6;
}

// `now` is injectable so scene replays and the evaluation harness can drive a
// deterministic clock instead of wall time.
export function extractPoseMetrics(pose, frameWidth, frameHeight, now = null) {
  if (!pose?.keypoints?.length) return null;

  const byName = {};
  for (const kp of pose.keypoints) {
    if (kp.score >= CONFIG.minKeypointScore) byName[kp.name] = kp;
  }

  const torso = TORSO_PARTS.map((n) => byName[n]).filter(Boolean);
  if (torso.length < CONFIG.minTorsoParts) return null;

  const torsoY = torso.reduce((s, k) => s + k.y, 0) / torso.length / frameHeight;
  const torsoX = torso.reduce((s, k) => s + k.x, 0) / torso.length / frameWidth;

  const visible = Object.values(byName);
  const xs = visible.map((k) => k.x);
  const ys = visible.map((k) => k.y);
  const bboxW = (Math.max(...xs) - Math.min(...xs)) / frameWidth;
  const bboxH = (Math.max(...ys) - Math.min(...ys)) / frameHeight;
  const aspect = bboxH > 0.001 ? bboxW / bboxH : 0;

  return {
    t: now ?? performance.now(),
    torsoX,
    torsoY,
    aspect,
    bboxH,
    visibleCount: visible.length,
  };
}

export class FallDetector {
  constructor(onStateChange, trackId = 'solo') {
    this.onStateChange = onStateChange;
    this.trackId = trackId;
    this.history = [];
    this.state = 'monitoring';
    this.suspectedAt = null;
    this.baselineTorsoY = null;
    this.peakMetrics = null;
    this.watchSamples = [];
    this.activeWindowMs = CONFIG.confirmWindowMs;
    this.lastSuppression = null;
  }

  reset() {
    this.history = [];
    this.state = 'monitoring';
    this.suspectedAt = null;
    this.baselineTorsoY = null;
    this.peakMetrics = null;
    this.watchSamples = [];
    this.activeWindowMs = CONFIG.confirmWindowMs;
    this.lastSuppression = null;
    this.onStateChange?.({ state: 'monitoring' });
  }

  // Vertical velocity in frame-heights/sec over a short window.
  velocity() {
    if (this.history.length < 2) return 0;
    const latest = this.history[this.history.length - 1];
    let ref = null;
    for (let i = this.history.length - 2; i >= 0; i--) {
      if (latest.t - this.history[i].t >= CONFIG.velocityWindowMs) {
        ref = this.history[i];
        break;
      }
    }
    if (!ref) ref = this.history[0];
    const dt = (latest.t - ref.t) / 1000;
    if (dt < 0.05) return 0;
    return (latest.torsoY - ref.torsoY) / dt;
  }

  // Did we see this person standing recently? A fall requires a descent from
  // upright — someone already seated on the floor when monitoring began has
  // not fallen, they are simply sitting.
  wasRecentlyUpright(now) {
    return this.history.some(
      (m) => now - m.t <= CONFIG.uprightWithinMs && m.aspect < CONFIG.uprightAspectCeiling && m.torsoY < CONFIG.lowCentroidThreshold
    );
  }

  motionEnergy(samples) {
    if (samples.length < 2) return 1;
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
      const dx = samples[i].torsoX - samples[i - 1].torsoX;
      const dy = samples[i].torsoY - samples[i - 1].torsoY;
      const dt = Math.max((samples[i].t - samples[i - 1].t) / 1000, 0.01);
      total += Math.hypot(dx, dy) / dt;
    }
    return total / (samples.length - 1);
  }

  push(metrics) {
    if (!metrics) return this.status();

    this.history.push(metrics);
    const cutoff = metrics.t - CONFIG.historyWindowMs;
    this.history = this.history.filter((m) => m.t >= cutoff);

    if (this.state === 'monitoring') {
      this.evaluateCandidate(metrics);
    } else if (this.state === 'suspected') {
      this.evaluateConfirmation(metrics);
    } else if (this.state === 'confirmed') {
      // Re-arm once the person is upright again, so monitoring continues
      // after an incident rather than latching on the first fall.
      if (metrics.aspect < CONFIG.recoveryUprightAspect && metrics.torsoY < CONFIG.lowCentroidThreshold) {
        this.state = 'monitoring';
        this.suspectedAt = null;
        this.watchSamples = [];
        this.onStateChange?.({ state: 'monitoring', reason: 'Person upright again — resumed normal tracking' });
      }
    }

    return this.status();
  }

  evaluateCandidate(m) {
    const v = this.velocity();
    const fastDrop = v > CONFIG.dropVelocityThreshold;
    const wideShape = m.aspect > CONFIG.wideAspectThreshold;
    const lowInFrame = m.torsoY > CONFIG.lowCentroidThreshold;
    const onFloor = wideShape && lowInFrame;

    if (!fastDrop && !onFloor) {
      this.baselineTorsoY = this.baselineTorsoY == null ? m.torsoY : Math.min(this.baselineTorsoY, m.torsoY);
      this.lastSuppression = null;
      return;
    }

    // --- Cultural calibration gates -----------------------------------
    // A configured floor zone means floor presence here is expected.
    if (onFloor && inSafeFloorZone(m)) {
      this.noteSuppression('safe-floor-zone', 'Floor presence in a configured normal-use zone (prayer, sleeping or eating area)');
      return;
    }

    // No upright posture on record — the person did not descend, they were
    // already down. Sitting cross-legged is not a fall.
    if (!this.wasRecentlyUpright(m.t)) {
      this.noteSuppression('no-descent-observed', 'No upright posture seen beforehand — treated as seated, not a fall');
      return;
    }

    // Descent happened, but slowly. Lowering yourself deliberately is not a fall.
    if (!fastDrop && v <= CONFIG.controlledDescentVelocity) {
      this.noteSuppression('controlled-descent', `Controlled descent (${v.toFixed(2)} frame-heights/s) — deliberate, not a fall`);
      return;
    }

    const night = isNightNow();
    this.activeWindowMs = night ? CONFIG.nightConfirmWindowMs : CONFIG.confirmWindowMs;

    this.state = 'suspected';
    this.suspectedAt = m.t;
    this.peakMetrics = m;
    this.watchSamples = [m];
    this.lastSuppression = null;
    this.onStateChange?.({
      state: 'suspected',
      reason: fastDrop
        ? `Rapid downward motion (${v.toFixed(2)} frame-heights/s) from an upright posture, with body-shape change`
        : 'Uncontrolled descent to the floor from an upright posture',
      metrics: m,
      velocity: v,
      windowMs: this.activeWindowMs,
      night,
    });
  }

  noteSuppression(rule, reason) {
    if (this.lastSuppression === rule) return;
    this.lastSuppression = rule;
    this.onStateChange?.({ state: 'suppressed', rule, reason });
  }

  evaluateConfirmation(m) {
    this.watchSamples.push(m);
    const elapsed = m.t - this.suspectedAt;

    const uprightAgain = m.aspect < CONFIG.recoveryUprightAspect;
    const rose = this.peakMetrics.torsoY - m.torsoY > CONFIG.recoveryRiseDelta;

    if (uprightAgain && rose) {
      this.state = 'monitoring';
      this.suspectedAt = null;
      this.watchSamples = [];
      this.onStateChange?.({
        state: 'recovered',
        reason: 'Recovery motion seen — person returned upright during the watch window',
        elapsed,
      });
      return;
    }

    if (elapsed >= this.activeWindowMs) {
      // Stillness is judged on the settled period, not the fall motion itself.
      const settled = this.watchSamples.filter((s) => s.t >= this.suspectedAt + CONFIG.settleIgnoreMs);
      const energy = this.motionEnergy(settled.length >= 2 ? settled : this.watchSamples);
      const stillOnFloor = energy < CONFIG.stillnessThreshold;
      this.state = 'confirmed';
      this.onStateChange?.({
        state: 'confirmed',
        reason: stillOnFloor
          ? 'No recovery motion during the confirmation window — person remained still on the floor'
          : 'No recovery to an upright posture during the confirmation window',
        elapsed,
        motionEnergy: energy,
        confidence: stillOnFloor ? 0.94 : 0.82,
      });
    }
  }

  status() {
    return {
      state: this.state,
      elapsed: this.suspectedAt ? performance.now() - this.suspectedAt : 0,
      confirmWindowMs: this.activeWindowMs,
    };
  }
}

export const DETECTOR_CONFIG = CONFIG;

// ---------------------------------------------------------------------------
// Multi-person scene tracking
//
// MoveNet MultiPose plus the built-in tracker gives every person in frame a
// persistent id. One detector runs per track, so nobody's pose history is
// polluted by anybody else's — which is what a single-pose model silently did.
//
// The second person is then treated as a signal rather than noise: someone who
// falls with a companion who comes to help is a different event from someone
// who falls alone, and different again from someone who falls beside a
// companion who never reacts.

const SCENE = {
  proximityNear: 0.28,      // normalised frame distance — "same part of the room"
  approachDelta: 0.05,      // must close at least this much to count as approaching
  trackStaleMs: 2500,       // drop a track unseen for this long
  maxTracks: 4,             // beyond this, coverage is declared degraded
  verticalWeight: 0.25,     // see note below
};

// Separation between two people, approximated in the image plane.
//
// Vertical distance is deliberately down-weighted: a person lying on the floor
// has a torso low in frame while someone standing beside them has one high in
// frame, so raw euclidean distance reads *posture* as *separation* and would
// score a companion kneeling over a fallen elder as far away. Horizontal
// distance is the better proxy for floor position.
//
// The proper fix is a homography onto the floor plane, which needs a per-camera
// calibration step. This approximation is adequate for a single room and is
// stated as a limitation rather than hidden.
function separation(a, b) {
  const dx = a.torsoX - b.torsoX;
  const dy = (a.torsoY - b.torsoY) * SCENE.verticalWeight;
  return Math.hypot(dx, dy);
}

export class SceneTracker {
  constructor(onEvent) {
    this.onEvent = onEvent;          // (evt) -> void, evt.trackId always set
    this.tracks = new Map();         // id -> { detector, lastSeen, metrics }
    this.suspects = new Map();       // id -> { at, nearest }
    this.degraded = false;
  }

  reset() {
    for (const t of this.tracks.values()) t.detector.reset();
    this.tracks.clear();
    this.suspects.clear();
    this.degraded = false;
  }

  get personCount() {
    return this.tracks.size;
  }

  // Distance from `id` to the closest other track, or null when alone.
  nearestOther(id) {
    const me = this.tracks.get(id)?.metrics;
    if (!me) return null;
    let best = null;
    for (const [otherId, t] of this.tracks) {
      if (otherId === id || !t.metrics) continue;
      const d = separation(me, t.metrics);
      if (best === null || d < best.d) best = { id: otherId, d };
    }
    return best;
  }

  // Classify what the rest of the scene did while this person was on the floor.
  //
  // Judged at confirmation, so the whole Stage 2 watch window is the evidence
  // period — there is no separate grace timer, which previously could not
  // elapse because it outlived the window it sat inside.
  companionContext(id) {
    const snap = this.suspects.get(id);
    const nearest = this.nearestOther(id);

    if (nearest === null) {
      return snap?.nearest
        ? { companion: 'left', detail: 'The other person left the room after the fall' }
        : { companion: 'none', detail: 'No other person detected in the room' };
    }

    const near = nearest.d <= SCENE.proximityNear;

    // Nobody was around when they went down — someone has since walked in.
    if (!snap || snap.nearest === null) {
      return near
        ? { companion: 'approached', detail: 'Someone came to them after the fall' }
        : { companion: 'present_no_response', detail: 'Another person entered but has not come over' };
    }

    if (near) {
      const closed = snap.nearest.d - nearest.d;
      return closed >= SCENE.approachDelta
        ? { companion: 'approached', detail: 'A companion moved towards them — help is already on the scene' }
        : { companion: 'approached', detail: 'A companion was already beside them' };
    }

    return {
      companion: 'present_no_response',
      detail: 'Another person is in the room but has not moved towards them',
    };
  }

  // Escalation is decided by context, not by the detection alone.
  static escalationFor(ctx) {
    switch (ctx.companion) {
      case 'approached':
        return { level: 'log', why: 'Companion responded — logged, not escalated' };
      case 'present_no_response':
        return { level: 'escalate', why: 'Companion present but unresponsive — escalated anyway' };
      case 'left':
        return { level: 'escalate', why: 'Companion left the room — escalated' };
      case 'none':
        return { level: 'escalate', why: 'No one else present — full escalation' };
      default:
        return { level: 'escalate', why: 'Companion status unclear — escalated by default' };
    }
  }

  /**
   * @param poses  array of { id, keypoints } from MoveNet MultiPose w/ tracking
   */
  push(poses, frameWidth, frameHeight, now = performance.now()) {
    const seen = new Set();

    for (const pose of poses ?? []) {
      const metrics = extractPoseMetrics(pose, frameWidth, frameHeight, now);
      if (!metrics) continue;
      const id = String(pose.id ?? 'solo');
      seen.add(id);

      let track = this.tracks.get(id);
      if (!track) {
        const detector = new FallDetector((evt) => this.handle(id, evt, now), id);
        track = { detector, lastSeen: now, metrics };
        this.tracks.set(id, track);
      }
      track.lastSeen = now;
      track.metrics = metrics;
      track.detector.push(metrics);
    }

    for (const [id, t] of [...this.tracks]) {
      if (!seen.has(id) && now - t.lastSeen > SCENE.trackStaleMs) {
        this.tracks.delete(id);
        this.suspects.delete(id);
      }
    }

    const shouldDegrade = this.tracks.size > SCENE.maxTracks;
    if (shouldDegrade !== this.degraded) {
      this.degraded = shouldDegrade;
      this.onEvent?.({
        state: 'coverage',
        degraded: shouldDegrade,
        personCount: this.tracks.size,
        reason: shouldDegrade
          ? `${this.tracks.size} people in frame — tracking confidence reduced`
          : 'Tracking confidence restored',
      });
    }

    return { personCount: this.tracks.size, degraded: this.degraded };
  }

  handle(id, evt, now) {
    if (evt.state === 'suspected') {
      this.suspects.set(id, { at: now, nearest: this.nearestOther(id) });
    }

    if (evt.state === 'confirmed') {
      const ctx = this.companionContext(id);
      const esc = SceneTracker.escalationFor(ctx);
      this.suspects.delete(id);
      this.onEvent?.({ ...evt, trackId: id, personCount: this.tracks.size, ...ctx, escalation: esc });
      return;
    }

    if (evt.state === 'recovered' || evt.state === 'monitoring') {
      this.suspects.delete(id);
    }

    this.onEvent?.({ ...evt, trackId: id, personCount: this.tracks.size });
  }
}

export const SCENE_CONFIG = SCENE;
