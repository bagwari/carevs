// Agentic Recommend stage with the safety architecture the source paper prescribes.
//
// Khalil, Ahmad & Ali (2026) identify hallucination (5-30%) as the central
// reliability risk, and propose multi-agent validation — Validator and Critic
// sub-agents cross-checking outputs — plus human-in-the-loop sign-off on
// anything clinical. This implements that chain:
//
//   Drafter  → proposes a next action from incident context
//   Validator→ hard policy gate; anything clinical is rejected outright
//   Critic   → checks the draft is specific, actionable and proportionate
//   Human    → the caregiver still taps. Nothing dispatches autonomously.
//
// The Drafter is deliberately rule-based. Swapping in an LLM means replacing
// draft() alone — the Validator and Critic gates are model-agnostic and would
// still run on its output. Keeping it deterministic means the demo has no
// network dependency and no hallucination surface in the first place.

// Anything resembling clinical instruction is refused. This is the gate that
// makes an LLM drafter safe to add later.
const CLINICAL_PATTERNS = [
  /\b\d+\s?(mg|ml|mcg|g)\b/i,
  /\bdos(e|age|ing)\b/i,
  /\b(prescrib|medicat|tablet|injection|insulin|warfarin)/i,
  /\bdiagnos/i,
  /\b(administer|inject|titrate)\b/i,
];

const VAGUE_PATTERNS = [/\bmonitor the situation\b/i, /\btake appropriate action\b/i, /\bas needed\b/i];

function draft(incident, context) {
  const { isNight, recentDismissals, trendDeclining } = context;

  if (incident.type === 'fall') {
    if (incident.status !== 'confirmed') return null;
    const steps = [`Call ${incident.elder.name.split(' ')[0]} now.`];
    steps.push('If there is no answer within 2 minutes, dispatch the on-call visit.');
    if (isNight) steps.push('It is night — if a visit is needed, notify the family contact at the same time rather than after.');
    if (trendDeclining) {
      steps.push('Her activity has been declining for 5 days. Flag this fall to the physician at the next review, not as a one-off.');
    }
    return {
      action: 'call_then_dispatch',
      urgency: 'immediate',
      text: steps.join(' '),
      basis: [
        'Fall confirmed — no recovery motion in the watch window',
        isNight ? 'Night-time event' : 'Daytime event',
        trendDeclining ? '5-day behavioural decline on record' : 'Behavioural baseline stable',
      ],
    };
  }

  if (incident.type === 'isolation') {
    const c = incident.context ?? {};
    const first = incident.elder.name.split(' ')[0];
    const steps = [`Call ${first} today, or ask a family member to visit this week.`];
    if (c.daysSinceVisitor >= 7) {
      steps.push(`It has been ${c.daysSinceVisitor} days — long enough that a call is unlikely to be enough on its own.`);
    }
    if (trendDeclining) {
      steps.push('Her activity is declining over the same period. Raise both together at the next review rather than as separate items.');
    }
    return {
      action: 'route_to_human',
      urgency: 'this_week',
      text: steps.join(' '),
      basis: [
        `Social presence down ${Math.abs(c.socialPresenceChangePct ?? 0)}% against her own baseline`,
        `${c.daysSinceVisitor} days since another person was detected`,
        trendDeclining ? 'Concurrent activity decline' : 'Activity baseline stable',
      ],
    };
  }

  if (incident.type === 'wandering') {
    if (incident.context?.supervised) {
      return {
        action: 'log_only',
        urgency: 'none',
        text: 'No action needed — a companion was in frame. Logged to the activity record only.',
        basis: ['Companion detected at the boundary', 'Supervised movement'],
      };
    }
    const steps = [`Call ${incident.elder.name.split(' ')[0]} and check the front door.`];
    if (isNight) steps.push('Night-time unsupervised exit — if she does not answer, treat this as urgent and go.');
    if (recentDismissals >= 2) {
      steps.push('The last 2 perimeter alerts were dismissed. If these crossings are routine, adjust the zone schedule so the alerts stay meaningful.');
    }
    return {
      action: 'call_and_check',
      urgency: isNight ? 'immediate' : 'prompt',
      text: steps.join(' '),
      basis: [
        'Restricted boundary crossed with no companion detected',
        isNight ? 'Night-time crossing' : 'Daytime crossing',
        recentDismissals >= 2 ? `${recentDismissals} recent dismissals — tuning suggested` : 'Alert pattern normal',
      ],
    };
  }

  return null;
}

function validate(candidate) {
  if (!candidate) return { passed: false, reason: 'No recommendation applicable at this stage' };

  for (const p of CLINICAL_PATTERNS) {
    if (p.test(candidate.text)) {
      return {
        passed: false,
        reason: 'Rejected by Validator — clinical content is out of scope for an automated recommendation',
        blocked: true,
      };
    }
  }
  if (candidate.text.length > 400) {
    return { passed: false, reason: 'Rejected by Validator — recommendation too long to act on quickly' };
  }
  return { passed: true, reason: 'No clinical content; within scope and length policy' };
}

function critique(candidate) {
  const notes = [];
  for (const p of VAGUE_PATTERNS) {
    if (p.test(candidate.text)) notes.push('Contains vague filler — a caregiver cannot act on it');
  }
  if (!/\d/.test(candidate.text) && candidate.urgency !== 'none') {
    notes.push('No concrete time bound given');
  }
  const passed = notes.length === 0;
  return {
    passed,
    reason: passed ? 'Specific, time-bound and proportionate to the urgency' : notes.join('; '),
    notes,
  };
}

export function buildRecommendation(incident, context = {}) {
  const chain = [];

  const candidate = draft(incident, {
    isNight: context.isNight ?? false,
    recentDismissals: context.recentDismissals ?? 0,
    trendDeclining: context.trendDeclining ?? false,
  });

  chain.push({
    agent: 'Drafter',
    outcome: candidate ? 'proposed' : 'no-op',
    detail: candidate ? candidate.text : 'No recommendation applicable at this stage',
  });

  if (!candidate) {
    return { recommendation: null, chain, requiresHumanSignOff: false };
  }

  const validation = validate(candidate);
  chain.push({
    agent: 'Validator',
    outcome: validation.passed ? 'passed' : 'rejected',
    detail: validation.reason,
  });
  if (!validation.passed) {
    return { recommendation: null, chain, requiresHumanSignOff: false, blocked: validation.blocked ?? false };
  }

  const criticism = critique(candidate);
  chain.push({
    agent: 'Critic',
    outcome: criticism.passed ? 'passed' : 'flagged',
    detail: criticism.reason,
  });

  chain.push({
    agent: 'Human sign-off',
    outcome: 'pending',
    detail: 'Caregiver must acknowledge, escalate or dismiss. Nothing dispatches automatically.',
  });

  return {
    recommendation: {
      text: candidate.text,
      action: candidate.action,
      urgency: candidate.urgency,
      basis: candidate.basis,
    },
    chain,
    requiresHumanSignOff: true,
  };
}

// Exposed so the demo can show the Validator refusing unsafe content.
export function probeValidator(text) {
  return validate({ text, urgency: 'immediate' });
}
