// Evaluation harness for the fall detector.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS MEASURES — read before quoting any number from it.
//
// This runs the detector over a generated corpus of pose sequences with known
// labels and reports a confusion matrix. It measures whether the detector does
// what it was designed to do, consistently, across parameter variation.
//
// It is NOT field validation. The corpus is synthetic and was written by the
// same author as the detector, so it cannot be treated as independent evidence
// of real-world accuracy. Real numbers require staged falls in real homes with
// human-labelled ground truth — the line budgeted at Rs 6–12L.
//
// Quote these figures as "synthetic corpus, N=…", never as an accuracy claim.
// ─────────────────────────────────────────────────────────────────────────────
//
// Run: node client/src/lib/accuracy.mjs [N]

import { SceneTracker, setSafeFloorZones } from './fallDetector.js';

// ---------------------------------------------------------------- rng
// Seeded so a run is reproducible and a reported figure can be re-derived.
function makeRng(seed = 20260910) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FRAME_MS = 125;                       // 8 fps
const W = 640, H = 480;

// ---------------------------------------------------------------- pose builder
function pose(id, torsoY, aspect, torsoX, rng, noise = 3) {
  const cy = torsoY * H, cx = torsoX * W;
  const half = aspect > 1 ? 40 : 90;
  const wide = aspect > 1 ? 120 : 34;
  const j = () => (rng() - 0.5) * 2 * noise;   // keypoint jitter, px
  const kp = (name, x, y) => ({ name, x: x + j(), y: y + j(), score: 0.85 + rng() * 0.14 });
  return {
    id,
    keypoints: [
      kp('left_shoulder', cx - wide, cy - 18),
      kp('right_shoulder', cx + wide, cy - 18),
      kp('left_hip', cx - wide, cy + 18),
      kp('right_hip', cx + wide, cy + 18),
      kp('nose', cx, cy - half),
      kp('left_ankle', cx - wide, cy + half),
      kp('right_ankle', cx + wide, cy + half),
    ],
  };
}

const rangeOf = (rng, lo, hi) => lo + rng() * (hi - lo);

// ---------------------------------------------------------------- generators
// Each returns { frames, zones } and carries a ground-truth label via CATEGORIES.

function standHold(rng, n, x) {
  return Array.from({ length: n }, () => [pose(1, rangeOf(rng, 0.31, 0.39), rangeOf(rng, 0.40, 0.52), x, rng)]);
}

function genFall(rng) {
  const x = rangeOf(rng, 0.28, 0.72);
  const floorY = rangeOf(rng, 0.72, 0.80);
  const floorA = rangeOf(rng, 1.20, 1.70);
  const dropFrames = rng() < 0.5 ? 1 : 2;   // 125–250 ms — uncontrolled
  const mid = [];
  for (let i = 1; i <= dropFrames; i++) {
    mid.push([pose(1, 0.35 + (floorY - 0.35) * (i / (dropFrames + 1)),
      0.45 + (floorA - 0.45) * (i / (dropFrames + 1)), x, rng)]);
  }
  return {
    frames: [
      ...standHold(rng, 14, x),
      ...mid,
      ...Array.from({ length: 70 }, () => [pose(1, floorY, floorA, x, rng, 1)]),
    ],
    zones: [],
  };
}

function genFallThenRecover(rng) {
  const x = rangeOf(rng, 0.3, 0.7);
  const upAt = Math.floor(rangeOf(rng, 16, 34));   // stands again inside the window
  return {
    frames: [
      ...standHold(rng, 14, x),
      [pose(1, 0.56, 0.72, x, rng)],
      ...Array.from({ length: upAt }, () => [pose(1, 0.76, 1.45, x, rng, 1)]),
      ...Array.from({ length: 30 }, () => [pose(1, rangeOf(rng, 0.32, 0.38), rangeOf(rng, 0.42, 0.5), x, rng)]),
    ],
    zones: [],
  };
}

function genControlledSit(rng) {
  const x = rangeOf(rng, 0.25, 0.75);
  const steps = Math.floor(rangeOf(rng, 16, 26));   // 2–3.2 s descent
  const out = [...standHold(rng, 14, x)];
  let y = 0.35, a = 0.45;
  for (let i = 0; i < steps; i++) {
    y = Math.min(y + (0.76 - 0.35) / steps, 0.76);
    a = Math.min(a + (1.4 - 0.45) / steps, 1.4);
    out.push([pose(1, y, a, x, rng)]);
  }
  out.push(...Array.from({ length: 60 }, () => [pose(1, 0.76, 1.4, x, rng, 1)]));
  return { frames: out, zones: [] };
}

function genAlreadySeated(rng) {
  const x = rangeOf(rng, 0.2, 0.8);
  return {
    frames: Array.from({ length: 90 }, () => [pose(1, rangeOf(rng, 0.70, 0.78), rangeOf(rng, 1.1, 1.5), x, rng, 1)]),
    zones: [],
  };
}

function genPrayerZone(rng) {
  const x = rangeOf(rng, 0.12, 0.30);
  return {
    frames: [
      ...standHold(rng, 14, x),
      [pose(1, 0.58, 0.8, x, rng)],
      ...Array.from({ length: 70 }, () => [pose(1, 0.77, 1.45, x, rng, 1)]),
    ],
    zones: [{ x: 0.05, y: 0.6, w: 0.35, h: 0.4 }],
  };
}

function genBendPickup(rng) {
  const x = rangeOf(rng, 0.3, 0.7);
  // dips down fast but stays tall-shaped, and comes straight back up
  return {
    frames: [
      ...standHold(rng, 12, x),
      [pose(1, 0.52, 0.62, x, rng)],
      [pose(1, 0.60, 0.70, x, rng)],
      [pose(1, 0.52, 0.62, x, rng)],
      ...standHold(rng, 30, x),
    ],
    zones: [],
  };
}

function genSquat(rng) {
  const x = rangeOf(rng, 0.3, 0.7);
  return {
    frames: [
      ...standHold(rng, 12, x),
      ...Array.from({ length: 24 }, () => [pose(1, rangeOf(rng, 0.58, 0.64), rangeOf(rng, 0.66, 0.80), x, rng)]),
      ...standHold(rng, 20, x),
    ],
    zones: [],
  };
}

function genTwoPersonFlip(rng) {
  const xa = rangeOf(rng, 0.2, 0.4), xb = rangeOf(rng, 0.6, 0.85);
  return {
    frames: Array.from({ length: 70 }, (_, i) =>
      i % 2 === 0
        ? [pose(1, rangeOf(rng, 0.32, 0.38), 0.45, xa, rng)]
        : [pose(2, rangeOf(rng, 0.72, 0.78), 1.4, xb, rng, 1)]
    ),
    zones: [],
  };
}

function genFallWithResponder(rng) {
  // A genuine fall, but a companion comes over. Ground truth: still a fall
  // event — we assert on detection, and report escalation separately.
  const x = rangeOf(rng, 0.3, 0.5);
  const start = rangeOf(rng, 0.85, 0.95);
  return {
    frames: [
      ...Array.from({ length: 14 }, () => [pose(1, 0.35, 0.45, x, rng), pose(2, 0.35, 0.45, start, rng)]),
      [pose(1, 0.56, 0.72, x, rng), pose(2, 0.35, 0.45, start, rng)],
      ...Array.from({ length: 70 }, (_, i) => [
        pose(1, 0.76, 1.45, x, rng, 1),
        pose(2, 0.35, 0.45, Math.max(x + 0.06, start - i * 0.012), rng),
      ]),
    ],
    zones: [],
  };
}

// label = should this sequence produce a CONFIRMED alert?
const CATEGORIES = [
  { name: 'Fall — uncontrolled drop',      gen: genFall,             alert: true,  weight: 3 },
  { name: 'Fall — companion responds',     gen: genFallWithResponder, alert: true, weight: 1 },
  { name: 'Fall then self-recovers',       gen: genFallThenRecover,  alert: false, weight: 2 },
  { name: 'Sits down on floor (slow)',     gen: genControlledSit,    alert: false, weight: 3 },
  { name: 'Already on floor at start',     gen: genAlreadySeated,    alert: false, weight: 2 },
  { name: 'Prayer / mat in safe zone',     gen: genPrayerZone,       alert: false, weight: 2 },
  { name: 'Bends to pick something up',    gen: genBendPickup,       alert: false, weight: 2 },
  { name: 'Squats / crouches',             gen: genSquat,            alert: false, weight: 2 },
  { name: 'Two bodies, identity flip',     gen: genTwoPersonFlip,    alert: false, weight: 2 },
];

// ---------------------------------------------------------------- runner
function runSequence({ frames, zones }) {
  setSafeFloorZones(zones);
  const confirmed = [];
  const st = new SceneTracker((e) => { if (e.state === 'confirmed') confirmed.push(e); });
  let t = 0;
  for (const f of frames) { st.push(f, W, H, t); t += FRAME_MS; }
  setSafeFloorZones([]);
  return confirmed;
}

const N = Number(process.argv[2]) || 450;
const rng = makeRng();

const totalWeight = CATEGORIES.reduce((s, c) => s + c.weight, 0);
const rows = [];
let TP = 0, FP = 0, TN = 0, FN = 0;
let escalated = 0, loggedOnly = 0;

for (const cat of CATEGORIES) {
  const n = Math.max(8, Math.round((cat.weight / totalWeight) * N));
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < n; i++) {
    const confirmed = runSequence(cat.gen(rng));
    const fired = confirmed.length > 0;

    if (cat.alert && fired) {
      tp++;
      const lvl = confirmed[0].escalation?.level;
      if (lvl === 'escalate') escalated++; else loggedOnly++;
    } else if (cat.alert && !fired) fn++;
    else if (!cat.alert && fired) fp++;
    else tn++;
  }

  TP += tp; FP += fp; TN += tn; FN += fn;
  rows.push({ name: cat.name, n, alert: cat.alert, tp, fp, tn, fn });
}

// ---------------------------------------------------------------- metrics
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');
const precision = TP / (TP + FP);
const recall = TP / (TP + FN);
const f1 = (2 * precision * recall) / (precision + recall);
const specificity = TN / (TN + FP);
const fpr = FP / (FP + TN);

const pad = (v, n) => String(v).padEnd(n);
const num = (v, n) => String(v).padStart(n);

console.log('\nFALL DETECTOR — SYNTHETIC EVALUATION');
console.log(`corpus N=${TP + FP + TN + FN}  ·  seed 20260910  ·  8 fps  ·  reproducible\n`);

console.log(pad('CATEGORY', 32), pad('LABEL', 10), num('N', 5), num('CORRECT', 9), num('WRONG', 7));
console.log('-'.repeat(68));
for (const r of rows) {
  const correct = r.alert ? r.tp : r.tn;
  const wrong = r.alert ? r.fn : r.fp;
  const flag = wrong > 0 ? '  <-' : '';
  console.log(pad(r.name, 32), pad(r.alert ? 'fall' : 'not fall', 10),
    num(r.n, 5), num(correct, 9), num(wrong, 7) + flag);
}

console.log('\nCONFUSION MATRIX');
console.log('                     predicted alert   predicted quiet');
console.log(`  actual fall        ${num(TP, 13)}   ${num(FN, 15)}`);
console.log(`  actual not-fall    ${num(FP, 13)}   ${num(TN, 15)}`);

console.log('\nMETRICS');
console.log(`  Precision            ${pct(precision)}   of alerts raised, this share were real falls`);
console.log(`  Recall (sensitivity) ${pct(recall)}   of real falls, this share were caught`);
console.log(`  F1                   ${pct(f1)}`);
console.log(`  Specificity          ${pct(specificity)}   of non-falls, this share stayed quiet`);
console.log(`  False-positive rate  ${pct(fpr)}`);

// Modelled, not measured — assumptions stated inline.
const FLOOR_EVENTS_PER_DAY = 8;
const fpPerWeek = fpr * FLOOR_EVENTS_PER_DAY * 7;
console.log('\nMODELLED ALERT LOAD  (a projection, not a measurement)');
console.log(`  Assumes ${FLOOR_EVENTS_PER_DAY} floor-adjacent events per home per day`);
console.log(`  (sitting on the floor, lying down, bending, crouching)`);
console.log(`  -> ${fpPerWeek.toFixed(2)} false alarms per home per week`);
console.log(`  Escalated ${escalated} / logged-only ${loggedOnly} of ${TP} detected falls (companion context)`);

console.log('\nLIMITS');
console.log('  Synthetic corpus, authored alongside the detector — measures internal');
console.log('  consistency, not real-world accuracy. Not independent validation.');
console.log('  Field numbers need staged falls in real homes with human-labelled');
console.log('  ground truth. No lighting, occlusion, clothing or camera-angle variation.\n');
