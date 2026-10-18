// DPDP-aligned consent record.
//
// India's Digital Personal Data Protection Act requires notice, purpose
// limitation, and a withdrawal that is "as easy as giving consent". The
// research summary flags the same gap from the other direction: the Health
// Affairs paper's data-access obstacle, and the IEEE paper's "informed consent,
// data minimisation, right to explanation" future-work item.
//
// Consent here is enforceable, not decorative: withdrawing a purpose actually
// changes what the masking layer will release.

const PURPOSES = [
  {
    id: 'fall_detection',
    label: 'Fall detection',
    description: 'Detect falls in common areas and alert the primary caregiver.',
    dataUsed: 'Pose keypoints. Still frames retained only when an event is flagged.',
    essential: true,
  },
  {
    id: 'perimeter',
    label: 'Wandering / perimeter alerts',
    description: 'Alert when a restricted boundary is crossed without a companion present.',
    dataUsed: 'Zone-crossing events and nearby-person count.',
    essential: false,
  },
  {
    id: 'behavioural_trends',
    label: 'Behavioural trend analysis',
    description: 'Build a personal baseline to spot decline before it becomes a crisis.',
    dataUsed: 'Daily aggregates only — no frame-level data is retained.',
    essential: false,
  },
  {
    id: 'family_sharing',
    label: 'Family updates',
    description: 'Share a plain-language summary of incidents with named family members.',
    dataUsed: 'Incident status and time. No images, no confidence scores.',
    essential: false,
  },
  {
    id: 'social_wellbeing',
    label: 'Social isolation alerts',
    description: 'Flag prolonged isolation so a person can reach out — the system never fills the gap itself.',
    dataUsed: 'A daily count of whether another person was present. No identity, no audio, no conversation content.',
    essential: false,
  },
  {
    id: 'incident_voice',
    label: 'Two-way voice during an incident',
    description: 'Lets the caregiver speak to Kamala through the room device after a confirmed incident.',
    dataUsed: 'Microphone and speaker activate only while an incident is open, and only when the caregiver starts a call. Nothing is recorded or transcribed.',
    essential: false,
  },
  {
    id: 'companion_voice',
    label: 'Daily conversational companion',
    phase: 2,
    experimental: true,
    description:
      'A short scheduled conversation intended to reduce loneliness. Not enabled: this is a Phase 2 experiment awaiting a validation study.',
    dataUsed:
      'Would require speech capture and a language model. Materially larger privacy surface than anything else in this list.',
    validationQuestion:
      'Does a scheduled conversational agent reduce measured loneliness in Indian elders more than a prompted human call — and do elders prefer it? No deployed evidence exists in the reviewed literature.',
    essential: false,
    defaultGranted: false,
  },
];

// ---------------------------------------------------------------------------
// Capacity and lawful basis.
//
// DPDP §9 covers children and persons with disability who have a *lawful
// guardian*. An adult developing dementia fits neither cleanly: the National
// Trust Act 1999 enumerates autism, cerebral palsy, mental retardation and
// multiple disabilities — not dementia — and the remaining routes are a
// nominated representative under the Mental Healthcare Act 2017 §14, or a civil
// court guardianship no family will pursue in order to install a camera.
//
// India has no clean answer here, so this is designed for the absence of one:
//
//   · consent captured as an ADVANCE directive while capacity is intact
//   · a nominated representative recorded, with the statutory basis named
//   · capacity reviewed on a schedule — consent is not a one-time signature
//   · the elder's own objection overrides the representative, always
//   · minimisation ratchets UP as capacity declines, never down
// ---------------------------------------------------------------------------

const CAPACITY_LEVELS = ['full', 'fluctuating', 'diminished'];

const state = {
  dataPrincipal: 'Kamala Rao',
  grantedBy: 'Kamala Rao',
  grantedOn: '2026-08-01T09:15:00.000Z',
  noticeVersion: '1.2',
  granted: new Set(PURPOSES.filter((p) => p.defaultGranted !== false).map((p) => p.id)),

  capacity: 'full',
  capacityAssessedOn: '2026-08-01T09:15:00.000Z',
  capacityReviewDue: '2027-02-01T09:15:00.000Z',
  advanceDirective: true,
  representative: {
    name: 'Rohan Rao',
    relationship: 'Son',
    basis: 'Nominated Representative — Mental Healthcare Act 2017, s.14',
    recordedOn: '2026-08-01T09:15:00.000Z',
  },
  objections: new Set(),

  history: [
    { ts: '2026-08-01T09:15:00.000Z', event: 'Consent given for all purposes', actor: 'Kamala Rao' },
    {
      ts: '2026-08-01T09:15:00.000Z',
      event: 'Advance directive recorded — Rohan Rao named as representative (MHCA 2017 s.14)',
      actor: 'Kamala Rao',
    },
  ],
};

export function getConsent() {
  return {
    dataPrincipal: state.dataPrincipal,
    grantedBy: state.grantedBy,
    grantedOn: state.grantedOn,
    noticeVersion: state.noticeVersion,
    retention: 'Evidence frames 30 days · daily aggregates 24 months · raw video never stored',
    capacity: state.capacity,
    representative: state.representative,
    purposes: PURPOSES.map((p) => ({
      ...p,
      granted: state.granted.has(p.id),
      objected: state.objections.has(p.id),
      effective: state.granted.has(p.id) && !state.objections.has(p.id),
    })),
    history: [...state.history].reverse(),
  };
}

export function hasConsent(purposeId) {
  // An objection by the data principal overrides a granted permission,
  // whoever granted it. Assent is checked continuously, not once.
  if (state.objections.has(purposeId)) return false;
  return state.granted.has(purposeId);
}

export function getCapacity() {
  const overdue = new Date(state.capacityReviewDue) < new Date();
  return {
    level: state.capacity,
    levels: CAPACITY_LEVELS,
    assessedOn: state.capacityAssessedOn,
    reviewDue: state.capacityReviewDue,
    reviewOverdue: overdue,
    advanceDirective: state.advanceDirective,
    representative: state.representative,
    objections: [...state.objections],
    // Who may lawfully change consent at the current capacity level.
    consentAuthority:
      state.capacity === 'full'
        ? 'Data principal only'
        : state.capacity === 'fluctuating'
          ? 'Data principal, with representative counter-signature'
          : 'Nominated representative, bounded by the advance directive',
    note:
      state.capacity === 'diminished'
        ? 'Consent rests on the advance directive given while capacity was intact. The representative may not extend it to purposes she never agreed to.'
        : 'Consent is held by the data principal. The representative is recorded but not yet acting.',
  };
}

export function setCapacity(level, actor = 'Primary caregiver') {
  if (!CAPACITY_LEVELS.includes(level)) return { error: `Unknown capacity level "${level}"` };
  const previous = state.capacity;
  state.capacity = level;
  state.capacityAssessedOn = new Date().toISOString();

  const next = new Date();
  next.setMonth(next.getMonth() + (level === 'full' ? 6 : 3)); // reviewed more often as it declines
  state.capacityReviewDue = next.toISOString();

  // Minimisation ratchets up, never down: a decline withdraws the purposes
  // that are convenience rather than safety.
  const revoked = [];
  if (level === 'diminished') {
    for (const id of ['social_wellbeing', 'incident_voice']) {
      if (state.granted.delete(id)) revoked.push(id);
    }
  }

  state.history.push({
    ts: new Date().toISOString(),
    event:
      `Capacity reassessed: ${previous} → ${level}` +
      (revoked.length ? ` · non-essential purposes withdrawn (${revoked.join(', ')})` : ''),
    actor,
  });
  return { capacity: getCapacity(), consent: getConsent(), revoked };
}

// The elder objects — in words or by behaviour. Overrides any permission.
export function setObjection(purposeId, objecting, actor = 'Kamala Rao') {
  const purpose = PURPOSES.find((p) => p.id === purposeId);
  if (!purpose) return { error: `Unknown purpose "${purposeId}"` };

  if (objecting) state.objections.add(purposeId);
  else state.objections.delete(purposeId);

  state.history.push({
    ts: new Date().toISOString(),
    event: objecting
      ? `Objection registered by the data principal — ${purpose.label} suspended regardless of consent on file`
      : `Objection lifted — ${purpose.label}`,
    actor,
  });
  return { consent: getConsent(), capacity: getCapacity() };
}

export function setConsent(purposeId, granted, actor = 'Kamala Rao') {
  const purpose = PURPOSES.find((p) => p.id === purposeId);
  if (!purpose) return { error: `Unknown purpose "${purposeId}"` };
  if (purpose.essential && !granted) {
    return { error: 'Fall detection is the core safety purpose and cannot be withdrawn while the service is active.' };
  }
  // A Phase 2 experiment cannot be consented to before it exists, and before
  // there is evidence to describe in the notice.
  if (purpose.experimental && granted) {
    return {
      error:
        'This is a Phase 2 experiment and cannot be enabled. Consent requires a validation study and a revised privacy notice first.',
    };
  }

  // Bounded delegation: once capacity has declined, the representative may
  // withdraw but never widen. Adding a purpose she never agreed to would be
  // consent she is no longer able to give.
  if (granted && state.capacity === 'diminished' && !state.granted.has(purposeId)) {
    return {
      error:
        'Capacity is diminished. The nominated representative may withdraw consent but cannot add a purpose ' +
        'beyond the advance directive given while capacity was intact.',
    };
  }

  if (granted) state.granted.add(purposeId);
  else state.granted.delete(purposeId);

  state.history.push({
    ts: new Date().toISOString(),
    event: `${granted ? 'Consent given' : 'Consent withdrawn'} — ${purpose.label}`,
    actor,
  });

  return { consent: getConsent() };
}

export function resetConsent() {
  state.granted = new Set(PURPOSES.filter((p) => p.defaultGranted !== false).map((p) => p.id));
  state.capacity = 'full';
  state.capacityAssessedOn = '2026-08-01T09:15:00.000Z';
  state.capacityReviewDue = '2027-02-01T09:15:00.000Z';
  state.objections = new Set();
  state.history = [
    { ts: '2026-08-01T09:15:00.000Z', event: 'Consent given for all purposes', actor: 'Kamala Rao' },
  ];
}
