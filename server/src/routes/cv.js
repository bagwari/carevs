import { Router } from 'express';
import { advanceLiveFall, startLiveFall } from '../state/incidentStore.js';

const router = Router();

const MAX_FRAMES_PER_REQUEST = 8;

function sanitizeFrames(frames) {
  if (!Array.isArray(frames)) return [];
  return frames
    .slice(0, MAX_FRAMES_PER_REQUEST)
    .filter((f) => typeof f?.dataUrl === 'string' && f.dataUrl.startsWith('data:image/jpeg;base64,'))
    .map((f) => ({
      dataUrl: f.dataUrl,
      label: typeof f.label === 'string' ? f.label.slice(0, 60) : 'frame',
      capturedAt: new Date().toISOString(),
    }));
}

router.post('/fall/start', (req, res) => {
  const { reason, metrics, frames } = req.body ?? {};
  const incident = startLiveFall({
    reason: typeof reason === 'string' ? reason.slice(0, 300) : undefined,
    metrics,
    frames: sanitizeFrames(frames),
  });
  res.json({ incident });
});

router.post('/fall/:id/advance', (req, res) => {
  const { outcome, reason, frames, confidence, motionEnergy } = req.body ?? {};
  if (!['confirmed', 'recovered'].includes(outcome)) {
    return res.status(400).json({ error: 'outcome must be "confirmed" or "recovered"' });
  }
  const incident = advanceLiveFall(req.params.id, {
    outcome,
    reason: typeof reason === 'string' ? reason.slice(0, 300) : undefined,
    frames: sanitizeFrames(frames),
    confidence: typeof confidence === 'number' ? confidence : undefined,
    motionEnergy,
  });
  if (!incident) return res.status(404).json({ error: 'Not found' });
  res.json({ incident });
});

export default router;
