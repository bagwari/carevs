import { FallDetector, setSafeFloorZones } from './fallDetector.js';

// Feed a synthetic metric sequence and report the terminal state.
function run(name, samples, { zones = [] } = {}) {
  setSafeFloorZones(zones);
  const events = [];
  const d = new FallDetector((e) => events.push(e));
  for (const s of samples) d.push(s);
  const last = events[events.length - 1];
  const outcome = d.state === 'suspected' || d.state === 'confirmed' ? d.state : (last?.state ?? 'monitoring');
  return { name, outcome, state: d.state, reason: last?.reason, rule: last?.rule };
}

// helpers: t in ms, torsoY 0(top)..1(bottom), aspect w/h
const S = (t, torsoY, aspect, torsoX = 0.5) => ({ t, torsoX, torsoY, aspect, bboxH: 0.5, visibleCount: 14 });

const results = [];

// 1. REAL FALL — upright, then rapid drop, then still on floor.
{
  const s = [];
  for (let t = 0; t <= 1000; t += 125) s.push(S(t, 0.35, 0.45));   // standing
  s.push(S(1125, 0.55, 0.7));                                        // falling
  s.push(S(1250, 0.75, 1.4));                                        // hit floor
  for (let t = 1375; t <= 9000; t += 125) s.push(S(t, 0.76, 1.45));  // still
  results.push(run('Real fall (rapid drop, stays down)', s));
}

// 2. FLOOR SITTING — already on the floor from the start (cross-legged).
{
  const s = [];
  for (let t = 0; t <= 9000; t += 125) s.push(S(t, 0.72, 1.2));
  results.push(run('Already seated on floor at start', s));
}

// 3. CONTROLLED DESCENT — upright, then lowers slowly to the floor (sitting down).
{
  const s = [];
  for (let t = 0; t <= 1000; t += 125) s.push(S(t, 0.35, 0.45));
  // slow descent over ~2.5s
  let y = 0.35, a = 0.45;
  for (let t = 1125; t <= 3500; t += 125) { y += 0.019; a += 0.038; s.push(S(t, Math.min(y, 0.73), Math.min(a, 1.2))); }
  for (let t = 3625; t <= 11000; t += 125) s.push(S(t, 0.73, 1.2));
  results.push(run('Sits down slowly on the floor', s));
}

// 4. SAFE FLOOR ZONE — genuine rapid drop, but inside a configured prayer/sleeping zone.
{
  const s = [];
  for (let t = 0; t <= 1000; t += 125) s.push(S(t, 0.35, 0.45, 0.2));
  s.push(S(1125, 0.55, 0.7, 0.2));
  s.push(S(1250, 0.75, 1.4, 0.2));
  for (let t = 1375; t <= 9000; t += 125) s.push(S(t, 0.76, 1.45, 0.2));
  results.push(run('Rapid descent inside safe floor zone', s, {
    zones: [{ x: 0.05, y: 0.6, w: 0.35, h: 0.4 }],
  }));
}

// 5. RECOVERY — falls, but gets back up inside the watch window.
{
  const s = [];
  for (let t = 0; t <= 1000; t += 125) s.push(S(t, 0.35, 0.45));
  s.push(S(1125, 0.55, 0.7));
  s.push(S(1250, 0.75, 1.4));
  for (let t = 1375; t <= 3000; t += 125) s.push(S(t, 0.76, 1.45));
  for (let t = 3125; t <= 4000; t += 125) s.push(S(t, 0.36, 0.44)); // stands up
  results.push(run('Falls then gets back up', s));
}

const pad = (v, n) => String(v).padEnd(n);
console.log(pad('SCENARIO', 42), pad('OUTCOME', 12), 'DETAIL');
console.log('-'.repeat(120));
for (const r of results) {
  console.log(pad(r.name, 42), pad(r.outcome, 12), (r.rule ? `[${r.rule}] ` : '') + (r.reason ?? ''));
}
