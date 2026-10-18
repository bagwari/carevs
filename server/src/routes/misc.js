import { Router } from 'express';
import { behavioralTrend, elder, zones } from '../data/seed.js';
import { getDeviceStatus } from '../state/incidentStore.js';

const router = Router();

router.get('/trends/:elderId', (req, res) => {
  const role = req.header('x-carevs-role');
  if (role !== 'caregiver') {
    return res.status(403).json({ error: 'Behavioral trend detail is caregiver-only' });
  }
  if (req.params.elderId !== behavioralTrend.elderId) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ trend: behavioralTrend, elder });
});

router.get('/zones', (_req, res) => {
  res.json({ zones });
});

router.get('/device-status', (req, res) => {
  const role = req.header('x-carevs-role');
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Device status is admin-only' });
  }
  res.json(getDeviceStatus());
});

export default router;
