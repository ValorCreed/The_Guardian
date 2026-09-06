import { Router } from 'express';
import { z } from 'zod';

import { asyncHandler } from '../lib/errors';
import { row, rows } from '../db/pool';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { createNotification } from '../services/notifications';

const router = Router({ mergeParams: true });

type BugRow = {
  id: number;
  title: string;
  category: string;
  severity: string;
  description: string;
  steps_to_reproduce: string | null;
  include_diagnostics: boolean;
  device_info: string | null;
  app_version: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function toBug(b: BugRow) {
  return {
    id: Number(b.id),
    title: b.title,
    category: b.category,
    severity: b.severity,
    description: b.description,
    stepsToReproduce: b.steps_to_reproduce,
    includeDiagnostics: b.include_diagnostics,
    deviceInfo: b.device_info,
    appVersion: b.app_version,
    status: b.status,
    createdAt: b.created_at.toISOString(),
    updatedAt: b.updated_at.toISOString(),
  };
}

const bodySchema = z.object({
  title: z.string().trim().min(1).max(150),
  category: z.string().trim().min(1).max(60),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().trim().min(1).max(4000),
  stepsToReproduce: z.string().trim().max(4000).optional(),
  includeDiagnostics: z.boolean().optional(),
  deviceInfo: z.string().trim().max(400).optional(),
  appVersion: z.string().trim().max(60).optional(),
});

router.post(
  '/bug-reports',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = bodySchema.parse(req.body);
    const bug = await row<BugRow>(
      `INSERT INTO bug_reports
         (user_id, title, category, severity, description, steps_to_reproduce, include_diagnostics, device_info, app_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.userId,
        body.title,
        body.category,
        body.severity,
        body.description,
        body.stepsToReproduce ?? null,
        body.includeDiagnostics ?? false,
        body.deviceInfo ?? null,
        body.appVersion ?? null,
      ]
    );

    await createNotification({
      userId: Number(req.userId),
      type: 'SYSTEM',
      title: 'Bug report received',
      body: 'Thank you for reporting this. Our team will review it.',
      route: '/support',
    });

    res.status(201).json(toBug(bug!));
  })
);

router.get(
  '/bug-reports/my',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const bugs = await rows<BugRow>(
      `SELECT * FROM bug_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    );
    res.json(bugs.map(toBug));
  })
);

export default router;