import { Router } from 'express';
import { DOCS } from '../../docs/spec.js';

const router = Router();

// GET /docs → all docs
router.get('/', (req, res) => {
  res.json(DOCS);
});

// GET /docs/:role → filter by role = admin | agent | source
router.get('/:role', (req, res) => {
  const role = req.params.role as 'admin' | 'agent' | 'source';
  if (!['admin', 'agent', 'source'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, agent, or source' });
  }
  const filtered = DOCS.map((cat) => ({
    ...cat,
    endpoints: cat.endpoints.filter((e) => !e.roles || e.roles.includes(role)),
  })).filter((cat) => cat.endpoints.length > 0);
  res.json(filtered);
});

export default router;
