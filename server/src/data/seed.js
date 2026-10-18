// Static seed data for the CareVS demo POC.
// All content is synthetic/mock — no real persons or footage.

export const elder = {
  id: 'elder-1',
  name: 'Kamala Rao',
  age: 78,
  home: 'Rao Residence',
  room: 'Living room',
};

export const users = [
  {
    id: 'admin-1',
    role: 'admin',
    name: 'Priya Sinha',
    title: 'System Administrator',
  },
  {
    id: 'caregiver-1',
    role: 'caregiver',
    name: 'Anita Verma',
    title: 'Primary Caregiver',
  },
  {
    id: 'family-1',
    role: 'family',
    name: 'Rohan Rao',
    title: 'Son',
  },
];

export const zones = [
  { id: 'bedroom', label: 'Bedroom', kind: 'safe', x: 20, y: 20, w: 220, h: 160 },
  { id: 'living-room', label: 'Living Room', kind: 'common', x: 260, y: 20, w: 260, h: 160 },
  { id: 'kitchen', label: 'Kitchen', kind: 'common', x: 20, y: 200, w: 220, h: 140 },
  { id: 'front-door', label: 'Front Door', kind: 'restricted', x: 260, y: 200, w: 260, h: 140 },
];

// 14 days of behavioral baseline data for the Prevent stage.
// Days 1-9: stable baseline. Days 10-14 (most recent 5): meaningful decline.
function buildBehavioralTrend() {
  const days = [];
  const today = new Date();
  const totalDays = 14;

  for (let i = totalDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dayIndex = totalDays - i; // 1..14
    const inDecline = dayIndex > 9; // last 5 days

    // Baseline: ~92% night-time stillness score, ~70 min common-area time
    const baselineStillness = 92;
    const baselineCommonArea = 70;

    let nightStillness;
    let commonAreaMinutes;

    if (!inDecline) {
      nightStillness = baselineStillness + (Math.random() * 4 - 2);
      commonAreaMinutes = baselineCommonArea + (Math.random() * 8 - 4);
    } else {
      const declineStep = dayIndex - 9; // 1..5
      const stillnessDrop = (40 / 5) * declineStep; // ramps to -40%
      const commonAreaDrop = (60 / 5) * declineStep; // ramps to -60%
      nightStillness = baselineStillness * (1 - stillnessDrop / 100) + (Math.random() * 2 - 1);
      commonAreaMinutes = baselineCommonArea * (1 - commonAreaDrop / 100) + (Math.random() * 3 - 1.5);
    }

    // Social presence: minutes per day with another person detected in frame.
    // The fourth baseline signal named in the architecture, and the one that
    // makes loneliness measurable rather than inferred.
    //
    // Note the different window: visits stop on day 6, and her own activity
    // only starts declining on day 10. The isolation leads the decline by four
    // days, which is the whole argument for treating it as a Prevent signal.
    const baselineSocial = 95;
    const socialIsolated = dayIndex > 5; // last 9 days
    let socialMinutes;
    if (!socialIsolated) {
      socialMinutes = baselineSocial + (Math.random() * 22 - 11);
    } else if (dayIndex === 6) {
      socialMinutes = 11 + Math.random() * 5; // brief doorstep exchange, not a visit
    } else {
      socialMinutes = Math.random() * 7; // brief doorstep contact at most
    }

    days.push({
      date: date.toISOString().slice(0, 10),
      nightTimeStillness: Math.round(nightStillness * 10) / 10,
      commonAreaMinutes: Math.round(commonAreaMinutes * 10) / 10,
      socialPresenceMinutes: Math.round(Math.max(socialMinutes, 0) * 10) / 10,
      inDecline,
    });
  }

  return days;
}

export const behavioralTrend = {
  elderId: elder.id,
  metricLabels: {
    nightTimeStillness: 'Night-time stillness (%)',
    commonAreaMinutes: 'Common-area time (min/day)',
    socialPresenceMinutes: 'Social presence (min/day with another person)',
  },
  baseline: {
    nightTimeStillness: 92,
    commonAreaMinutes: 70,
    socialPresenceMinutes: 95,
  },
  days: buildBehavioralTrend(),
  summary: {
    nightTimeStillnessChangePct: -40,
    commonAreaTimeChangePct: -60,
    socialPresenceChangePct: -95,
    daysSinceVisitor: 9,
    isolationLeadDays: 4,
    visitorsPerWeekBaseline: 3,
    windowDays: 5,
    headline: 'Night-time stillness down 40% and common-area time down 60% over the last 5 days',
    recommendation:
      'Meaningful drift from Kamala\'s own baseline. Suggest a wellness check call and a home-health visit within the week — before this becomes a fall or crisis event.',
  },
};

export const fallEvidenceTemplate = {
  what: 'Possible fall detected in the Living Room',
  whyTemplate: (confirmed) =>
    confirmed
      ? 'Sudden drop in body-height and a shape change consistent with a fall were detected, and no recovery motion was seen during the confirmation window.'
      : 'Sudden drop in body-height and a shape change consistent with a fall were detected. Watching for recovery motion.',
  evidenceSummary: 'Pose-keypoint clip, 5–8 second confirmation window, edge-processed (no raw video leaves the home).',
};
