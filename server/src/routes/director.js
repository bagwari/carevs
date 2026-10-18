import { Router } from 'express';
import { resetDemo, triggerFall, triggerIsolation, triggerZoneCrossing } from '../state/incidentStore.js';

// Unlisted presenter-control endpoints — drive the scripted demo narrative.
// Not gated by role: this is a demo director tool, not part of the product surface.

const router = Router();

router.post('/trigger-fall', (req, res) => {
  const { outcome } = req.body ?? {};
  const incident = triggerFall({ outcome: outcome === 'reset' ? 'reset' : 'confirmed' });
  res.json({ incident });
});

router.post('/trigger-zone-crossing', (req, res) => {
  const { supervised } = req.body ?? {};
  const incident = triggerZoneCrossing({ supervised: Boolean(supervised) });
  res.json({ incident });
});

router.post('/trigger-isolation', (_req, res) => {
  res.json({ incident: triggerIsolation() });
});

router.post('/reset', (_req, res) => {
  resetDemo();
  res.json({ ok: true });
});

export default router;
