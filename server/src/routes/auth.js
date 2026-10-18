import { Router } from 'express';
import { users } from '../data/seed.js';

const router = Router();

router.get('/users', (_req, res) => {
  res.json({ users });
});

router.post('/login', (req, res) => {
  const { role } = req.body ?? {};
  const user = users.find((u) => u.role === role);
  if (!user) {
    return res.status(400).json({ error: `Unknown role "${role}"` });
  }
  res.json({ user });
});

export default router;
