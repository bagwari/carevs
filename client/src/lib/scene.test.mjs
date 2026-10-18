// Two-person scene scenarios.
//
// A single-pose model silently picks one body and can swap between them
// mid-sequence — which both invents falls that never happened and hides ones
// that did. These cases pin the per-track behaviour and the companion-context
// escalation that replaces it.
//
// Run: node client/src/lib/scene.test.mjs

import { SceneTracker, setSafeFloorZones } from './fallDetector.js';

// Build a MoveNet-shaped pose from normalised torso position + aspect.
function pose(id, torsoY, aspect, torsoX) {
  const H = 480, W = 640;
  const cy = torsoY * H, cx = torsoX * W;
  const half = (aspect > 1 ? 40 : 90);          // vertical extent of the body
  const wide = (aspect > 1 ? 120 : 34);         // horizontal extent
  const kp = (name, x, y) => ({ name, x, y, score: 0.9 });
  return {
    id,
    keypoints: [
      kp('left_shoulder',  cx - wide, cy - 18),
      kp('right_shoulder', cx + wide, cy - 18),
      kp('left_hip',       cx - wide, cy + 18),
      kp('right_hip',      cx + wide, cy + 18),
      kp('nose',           cx,        cy - half),
      kp('left_ankle',     cx - wide, cy + half),
      kp('right_ankle',    cx + wide, cy + half),
    ],
  };
}

const STAND = { y: 0.35, a: 0.45 };
const FLOOR = { y: 0.76, a: 1.45 };

function run(name, frames, { zones = [] } = {}) {
  setSafeFloorZones(zones);
  const events = [];
  const st = new SceneTracker((e) => events.push(e));
  let t = 0;
  for (const people of frames) {
    st.push(people, 640, 480, t);
    t += 125;
  }
  const confirmed = events.filter((e) => e.state === 'confirmed');
  const coverage = events.filter((e) => e.state === 'coverage');
  return { name, events, confirmed, coverage, tracker: st };
}

// helper: hold a set of people steady for n frames
function hold(spec, n) {
  return Array.from({ length: n }, () => spec.map((p) => pose(p.id, p.y, p.a, p.x)));
}

const results = [];

// 1 · Elder falls ALONE -> full escalation
{
  const frames = [
    ...hold([{ id: 1, ...STAND, x: 0.4 }], 12),
    [pose(1, 0.55, 0.7, 0.4)],
    ...hold([{ id: 1, ...FLOOR, x: 0.4 }], 70),
  ];
  results.push(run('Falls alone', frames));
}

// 2 · Elder falls, companion APPROACHES -> log, do not escalate
{
  const frames = [
    ...hold([{ id: 1, ...STAND, x: 0.4 }, { id: 2, ...STAND, x: 0.9 }], 12),
    [pose(1, 0.55, 0.7, 0.4), pose(2, 0.35, 0.45, 0.9)],
    // companion walks over during the watch window
    ...Array.from({ length: 70 }, (_, i) => [
      pose(1, FLOOR.y, FLOOR.a, 0.4),
      pose(2, 0.35, 0.45, Math.max(0.46, 0.9 - i * 0.012)),
    ]),
  ];
  results.push(run('Falls, companion approaches', frames));
}

// 3 · Elder falls, companion across the room never reacts -> still escalate
{
  const frames = [
    ...hold([{ id: 1, ...STAND, x: 0.4 }, { id: 2, ...STAND, x: 0.92 }], 12),
    [pose(1, 0.55, 0.7, 0.4), pose(2, 0.35, 0.45, 0.92)],
    ...hold([{ id: 1, ...FLOOR, x: 0.4 }, { id: 2, ...STAND, x: 0.92 }], 90),
  ];
  results.push(run('Falls, companion ignores', frames));
}

// 4 · Two people, NOBODY falls — one lowers themselves to the floor deliberately.
//     Must be a *gradual* descent: an instant jump to the floor really is a fall.
{
  const descent = [];
  let y = STAND.y, a = STAND.a;
  for (let i = 0; i < 20; i++) {                 // ~2.5s controlled sit-down
    y = Math.min(y + 0.021, FLOOR.y);
    a = Math.min(a + 0.05, FLOOR.a);
    descent.push([pose(1, STAND.y, STAND.a, 0.4), pose(2, y, a, 0.8)]);
  }
  const frames = [
    ...hold([{ id: 1, ...STAND, x: 0.4 }, { id: 2, ...STAND, x: 0.8 }], 12),
    ...descent,
    ...hold([{ id: 1, ...STAND, x: 0.4 }, { id: 2, ...FLOOR, x: 0.8 }], 60),
  ];
  results.push(run('Two present, one sits down on floor', frames));
}

// 5 · The single-pose failure this replaces: identity swap must NOT invent a fall.
//     Frame-to-frame the visible body alternates between a standing person and a
//     seated one. Under one detector that reads as a violent drop.
{
  const frames = Array.from({ length: 60 }, (_, i) =>
    i % 2 === 0
      ? [pose(1, STAND.y, STAND.a, 0.4)]
      : [pose(2, FLOOR.y, FLOOR.a, 0.75)]
  );
  results.push(run('Identity flip between two bodies', frames));
}

// 6 · Crowded room -> coverage degraded
{
  const many = [
    { id: 1, ...STAND, x: 0.2 }, { id: 2, ...STAND, x: 0.4 },
    { id: 3, ...STAND, x: 0.6 }, { id: 4, ...STAND, x: 0.75 },
    { id: 5, ...STAND, x: 0.9 },
  ];
  results.push(run('Five people in frame', hold(many, 10)));
}

// ---------------------------------------------------------------- report
const pad = (v, n) => String(v).padEnd(n);
console.log(pad('SCENARIO', 34), pad('CONFIRMED', 10), pad('COMPANION', 21), 'ESCALATION');
console.log('-'.repeat(112));
let fails = 0;

const expect = {
  'Falls alone':                     { confirmed: 1, level: 'escalate' },
  'Falls, companion approaches':     { confirmed: 1, level: 'log' },
  'Falls, companion ignores':        { confirmed: 1, level: 'escalate' },
  'Two present, one sits down on floor': { confirmed: 0 },
  'Identity flip between two bodies':{ confirmed: 0 },
  'Five people in frame':            { confirmed: 0, degraded: true },
};

for (const r of results) {
  const c = r.confirmed[0];
  const level = c?.escalation?.level ?? '—';
  console.log(
    pad(r.name, 34),
    pad(r.confirmed.length, 10),
    pad(c?.companion ?? '—', 21),
    level + (c?.escalation ? `  (${c.escalation.why})` : '')
  );

  const e = expect[r.name];
  if (e.confirmed !== r.confirmed.length) {
    console.log(`   FAIL: expected ${e.confirmed} confirmed, got ${r.confirmed.length}`); fails++;
  }
  if (e.level && level !== e.level) {
    console.log(`   FAIL: expected escalation '${e.level}', got '${level}'`); fails++;
  }
  if (e.degraded && !r.coverage.some((x) => x.degraded)) {
    console.log('   FAIL: expected a degraded-coverage event'); fails++;
  }
}

console.log('-'.repeat(112));
console.log(fails === 0 ? 'all scene scenarios PASS' : `${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
