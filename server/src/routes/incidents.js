import { Router } from 'express';
import { applyAction, endVoiceSession, getIncident, listIncidents, startVoiceSession } from '../state/incidentStore.js';
import { maskIncidentForRole, maskListForRole } from '../services/piiMasking.js';
import { record } from '../services/auditLog.js';
import { hasConsent } from '../services/consent.js';
import { incidentToFhir } from '../services/fhir.js';

const router = Router();

function requireRole(req, res) {
  const role = req.header('x-carevs-role');
  if (!role || !['admin', 'caregiver', 'family'].includes(role)) {
    res.status(400).json({ error: 'Missing or invalid x-carevs-role header' });
    return null;
  }
  return role;
}

router.get('/', (req, res) => {
  const role = requireRole(req, res);
  if (!role) return;
  const masked = maskListForRole(listIncidents(), role);
  record({ role, action: 'list', resource: 'incidents', detail: `${masked.length} records released` });
  res.json({ incidents: masked });
});

router.get('/:id', (req, res) => {
  const role = requireRole(req, res);
  if (!role) return;
  const incident = getIncident(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Not found' });
  const masked = maskIncidentForRole(incident, role);
  if (!masked) {
    record({ role, action: 'read', resource: req.params.id, outcome: 'withheld', detail: 'consent withdrawn for this purpose' });
    return res.status(403).json({ error: 'Withheld — consent for this purpose has been withdrawn' });
  }
  record({ role, action: 'read', resource: req.params.id, detail: `view: ${masked.view}` });
  res.json({ incident: masked });
});

// FHIR R4 projection — the shape an incident needs to leave the system in
// for ABDM / HL7-compatible exchange.
router.get('/:id/fhir', (req, res) => {
  const role = requireRole(req, res);
  if (!role) return;
  if (role === 'family') {
    record({ role, action: 'export-fhir', resource: req.params.id, outcome: 'denied' });
    return res.status(403).json({ error: 'Clinical export is restricted to caregiver and admin' });
  }
  const incident = getIncident(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Not found' });
  record({ role, action: 'export-fhir', resource: req.params.id, detail: 'FHIR R4 Observation generated' });
  res.json(incidentToFhir(incident));
});

// Two-way voice — caregiver only, consent-gated, and only while an incident is open.
router.post('/:id/voice/:op', (req, res) => {
  const role = requireRole(req, res);
  if (!role) return;
  const { id, op } = req.params;

  if (role !== 'caregiver') {
    record({ role, action: `voice:${op}`, resource: id, outcome: 'denied' });
    return res.status(403).json({ error: 'Only the caregiver can open a voice channel' });
  }
  if (!hasConsent('incident_voice')) {
    record({ role, action: `voice:${op}`, resource: id, outcome: 'withheld', detail: 'consent withdrawn' });
    return res.status(403).json({ error: 'Consent for two-way voice has been withdrawn' });
  }

  const result =
    op === 'start'
      ? startVoiceSession(id)
      : op === 'end'
        ? endVoiceSession(id, Number(req.body?.seconds) || 0)
        : { error: 'Unknown operation' };

  if (result.error === 'not_found') return res.status(404).json({ error: 'Not found' });
  if (result.error) return res.status(400).json({ error: result.error });

  record({ role, action: `voice:${op}`, resource: id, detail: 'live audio, no recording retained' });
  res.json({ incident: maskIncidentForRole(result.incident, role) });
});

router.post('/:id/action', (req, res) => {
  const role = requireRole(req, res);
  if (!role) return;
  if (role !== 'caregiver') {
    record({ role, action: 'act', resource: req.params.id, outcome: 'denied' });
    return res.status(403).json({ error: 'Only the caregiver can act on an incident' });
  }
  const { action } = req.body ?? {};
  if (!['acknowledge', 'escalate', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  const incident = applyAction(req.params.id, action);
  if (!incident) return res.status(404).json({ error: 'Not found' });
  record({ role, action: `sign-off:${action}`, resource: req.params.id, detail: 'human sign-off recorded' });
  res.json({ incident: maskIncidentForRole(incident, role) });
});

export default router;
