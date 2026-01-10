import express from 'express';
import { getSourceClient, getHealthClient, getAgentTesterClient, unary } from '../infra/grpc/loader.js';

const router = express.Router();

// Defaults (overridable by env)
const DEFAULT_SOURCE_ADDR = process.env.SOURCE_GRPC_ADDR || 'localhost:51061';
const DEFAULT_AGENT_ADDR  = process.env.AGENT_GRPC_ADDR  || 'localhost:51062';

// ---- SOURCE: Locations ------------------------------------------------------
router.post('/source/locations', async (req, res) => {
  const addr = req.body?.addr || DEFAULT_SOURCE_ADDR;
  try {
    const client = getSourceClient(addr);
    const { ms, resp } = await unary(client, 'GetLocations', {}); // Empty
    res.json({ ok: true, addr, ms, result: resp });
  } catch (err) {
    res.status(500).json({ ok: false, addr, error: err.message, stack: err.stack });
  }
});

// ---- SOURCE: Availability ---------------------------------------------------
router.post('/source/availability', async (req, res) => {
  const addr = req.body?.addr || DEFAULT_SOURCE_ADDR;
  const { pickup_unlocode, dropoff_unlocode, pickup_iso, dropoff_iso } = req.body || {};
  const payload = { pickup_unlocode, dropoff_unlocode, pickup_iso, dropoff_iso };
  try {
    const client = getSourceClient(addr);
    const { ms, resp } = await unary(client, 'GetAvailability', payload);
    res.json({ ok: true, addr, ms, result: resp });
  } catch (err) {
    res.status(500).json({ ok: false, addr, error: err.message, stack: err.stack });
  }
});

// ---- AGENT: Ping (Health.Check) -------------------------------------------
router.post('/agent/ping', async (req, res) => {
  const addr = req.body?.addr || DEFAULT_AGENT_ADDR;
  try {
    const client = getHealthClient(addr);
    // HealthCheckRequest { service: '' } checks overall server
    const { ms, resp } = await unary(client, 'Check', { service: '' });
    res.json({ ok: true, addr, ms, result: resp });
  } catch (err) {
    res.status(500).json({ ok: false, addr, error: err.message, stack: err.stack });
  }
});

// ---- AGENT: Run Check (try tester service, else fallback to Health) --------
router.post('/agent/run-check', async (req, res) => {
  const addr = req.body?.addr || DEFAULT_AGENT_ADDR;
  const testerClient = getAgentTesterClient(addr);
  try {
    if (testerClient && typeof testerClient.RunSearch === 'function') {
      const { ms, resp } = await unary(testerClient, 'RunSearch', { scenario: req.body?.scenario || 'default' });
      return res.json({ ok: true, addr, ms, result: resp, via: 'agent_tester.RunSearch' });
    }
    // Fallback: just perform Health.Check as a smoke test
    const health = getHealthClient(addr);
    const { ms, resp } = await unary(health, 'Check', { service: '' });
    res.json({ ok: true, addr, ms, result: resp, via: 'health.Check' });
  } catch (err) {
    res.status(500).json({ ok: false, addr, error: err.message, stack: err.stack });
  }
});

export default router;
