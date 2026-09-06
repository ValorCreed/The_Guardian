import { Router } from 'express';
import { env } from '../config/env';
import { asyncHandler, notFound } from '../lib/errors';
import { getTestCode } from '../lib/testCodes';

/**
 * Test-only harness. Mounted ONLY in test environments (NODE_ENV === 'test')
 * so live integration tests can read the verification codes the app would
 * deliver over email. Never enabled in production.
 */
const router = Router();

router.get(
  '/codes/:email',
  asyncHandler(async (req, res) => {
    if (env.NODE_ENV !== 'test') throw notFound();
    const code = getTestCode(req.params.email);
    if (!code) throw notFound('No pending code for this email.');
    res.json({ email: req.params.email, code });
  })
);

export default router;