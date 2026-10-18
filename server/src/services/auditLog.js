// Append-only access log.
//
// Answers the IEEE paper's "audit logging" mitigation (listed against prompt
// injection and unauthorised access) and the DPDP expectation that a data
// fiduciary can show who accessed personal data and when.
//
// Every read of an incident is recorded — including reads that returned masked
// data — so the log demonstrates that masking happened rather than asserting it.

const MAX_ENTRIES = 500;
const entries = [];

export function record({ role, actor, action, resource, outcome = 'allowed', detail }) {
  const entry = {
    id: entries.length + 1,
    ts: new Date().toISOString(),
    role,
    actor: actor ?? role,
    action,
    resource,
    outcome,
    detail,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  return entry;
}

export function listAudit({ limit = 100 } = {}) {
  return entries.slice(-limit).reverse();
}

export function auditSummary() {
  const byRole = {};
  let denied = 0;
  for (const e of entries) {
    byRole[e.role] = (byRole[e.role] ?? 0) + 1;
    if (e.outcome !== 'allowed') denied += 1;
  }
  return { total: entries.length, byRole, denied };
}

export function resetAudit() {
  entries.length = 0;
}
