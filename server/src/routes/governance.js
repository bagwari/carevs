import { Router } from 'express';
import { computeAdoptionMetrics } from '../services/adoptionMetrics.js';
import { auditSummary, listAudit, record } from '../services/auditLog.js';
import { getCapacity, getConsent, setCapacity, setConsent, setObjection } from '../services/consent.js';
import { probeValidator } from '../services/recommender.js';
import { listIncidents } from '../state/incidentStore.js';

const router = Router();

function role(req) {
  return req.header('x-carevs-role');
}

// Consent is readable by everyone — transparency is the point — but only the
// caregiver (acting for the data principal) can change it.
router.get('/consent', (req, res) => {
  record({ role: role(req), action: 'read', resource: 'consent-record' });
  res.json({ consent: getConsent() });
});

router.post('/consent', (req, res) => {
  const r = role(req);
  if (r !== 'caregiver') {
    record({ role: r, action: 'update', resource: 'consent-record', outcome: 'denied' });
    return res.status(403).json({ error: 'Only the caregiver, acting for the data principal, can change consent' });
  }
  const { purposeId, granted } = req.body ?? {};
  const result = setConsent(purposeId, Boolean(granted));
  if (result.error) return res.status(400).json({ error: result.error });
  record({
    role: r,
    action: 'update',
    resource: `consent:${purposeId}`,
    detail: granted ? 'granted' : 'withdrawn',
  });
  res.json(result);
});

// Capacity and lawful basis — readable by all, changeable only by the caregiver
// acting on a clinical assessment.
router.get('/capacity', (req, res) => {
  record({ role: role(req), action: 'read', resource: 'capacity-record' });
  res.json({ capacity: getCapacity() });
});

router.post('/capacity', (req, res) => {
  const r = role(req);
  if (r !== 'caregiver') {
    record({ role: r, action: 'update', resource: 'capacity-record', outcome: 'denied' });
    return res.status(403).json({ error: 'Only the caregiver can record a capacity reassessment' });
  }
  const result = setCapacity(req.body?.level);
  if (result.error) return res.status(400).json({ error: result.error });
  record({
    role: r,
    action: 'update',
    resource: `capacity:${req.body?.level}`,
    detail: result.revoked.length ? `auto-withdrew ${result.revoked.join(', ')}` : 'no purposes affected',
  });
  res.json(result);
});

// The data principal objects. Overrides consent on file, whoever gave it.
router.post('/objection', (req, res) => {
  const r = role(req);
  if (r !== 'caregiver') {
    return res.status(403).json({ error: 'Objections are recorded by the caregiver on the resident’s behalf' });
  }
  const { purposeId, objecting } = req.body ?? {};
  const result = setObjection(purposeId, Boolean(objecting));
  if (result.error) return res.status(400).json({ error: result.error });
  record({
    role: r,
    action: 'objection',
    resource: `consent:${purposeId}`,
    detail: objecting ? 'registered — overrides consent' : 'lifted',
  });
  res.json(result);
});

router.get('/audit', (req, res) => {
  const r = role(req);
  if (r !== 'admin' && r !== 'caregiver') {
    return res.status(403).json({ error: 'Audit log is restricted to admin and caregiver' });
  }
  res.json({ entries: listAudit({ limit: 120 }), summary: auditSummary() });
});

router.get('/metrics/adoption', (req, res) => {
  const r = role(req);
  if (r !== 'admin' && r !== 'caregiver') {
    return res.status(403).json({ error: 'Adoption metrics are restricted to admin and caregiver' });
  }
  res.json({ metrics: computeAdoptionMetrics(listIncidents()) });
});

// Lets the demo show the Validator refusing unsafe content on demand.
router.post('/validator/probe', (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Provide text to test against the Validator policy' });
  }
  res.json({ result: probeValidator(text.slice(0, 400)) });
});

export default router;
