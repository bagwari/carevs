// Adoption instrumentation.
//
// The project assessment's own conclusion: "Adoption, not accuracy, is the
// measurable variable — and it is measurable here." All three sources lack
// primary outcome data, so this is where the project can contribute something
// the literature does not have.
//
// These are the numbers that decide whether a system stays switched on:
// does the caregiver respond, how fast, and how often is the alert wrong?

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeAdoptionMetrics(incidents) {
  // Only incidents that actually asked the caregiver for a decision count.
  const actionable = incidents.filter(
    (i) => i.status !== 'candidate' && i.status !== 'suspected' && i.resolution !== 'auto_reset' && i.status !== 'logged'
  );

  const acted = actionable.filter((i) => ['acknowledged', 'escalated', 'dismissed'].includes(i.status));
  const dismissed = actionable.filter((i) => i.status === 'dismissed');
  const escalated = actionable.filter((i) => i.status === 'escalated');

  const responseTimes = acted
    .filter((i) => i.resolvedAt && i.createdAt)
    .map((i) => (new Date(i.resolvedAt) - new Date(i.createdAt)) / 1000);

  // Auto-resets are the detector standing itself down — the false alarms the
  // caregiver never had to see. That suppression rate is the trust metric.
  const autoResets = incidents.filter((i) => i.resolution === 'auto_reset').length;
  const totalRaised = incidents.filter((i) => i.type === 'fall').length;

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

  return {
    actionableAlerts: actionable.length,
    respondedTo: acted.length,
    responseRatePct: pct(acted.length, actionable.length),
    medianResponseSeconds: median(responseTimes) != null ? Math.round(median(responseTimes)) : null,
    dismissalRatePct: pct(dismissed.length, actionable.length),
    escalationRatePct: pct(escalated.length, actionable.length),
    autoSuppressed: autoResets,
    autoSuppressionRatePct: pct(autoResets, totalRaised),
    interpretation: {
      responseRate: 'Share of alerts the caregiver actually acted on. Falling response rate is the leading indicator of a system about to be ignored.',
      dismissalRate: 'High dismissal means the detector is crying wolf. Watch this before watching accuracy.',
      autoSuppression: 'Candidates the detector stood down on its own — alerts the caregiver never had to see.',
    },
  };
}
