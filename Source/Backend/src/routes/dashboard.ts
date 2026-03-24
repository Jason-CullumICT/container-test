// Verifies: FR-017, FR-018
// Dashboard route handlers — thin HTTP layer, delegates to service.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import { getDashboardSummary, getDashboardActivity } from '../services/dashboardService';
import { withSpan } from '../lib/tracing';
import logger from '../lib/logger';

const router = Router();

// GET /api/dashboard/summary
// Verifies: FR-017
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('dashboard.summary', async () => {
      const db = getDb();
      const summary = getDashboardSummary(db);
      logger.info('Retrieved dashboard summary');
      res.json(summary);
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/activity
// Verifies: FR-018
router.get('/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('dashboard.activity', async (span) => {
      const limitParam = req.query.limit;
      const limit = limitParam ? parseInt(String(limitParam), 10) : undefined;

      span.setAttribute('activity.limit', limit || 20);

      const db = getDb();
      const items = getDashboardActivity(db, limit);
      logger.info('Retrieved dashboard activity', { count: items.length, requested_limit: limit });
      res.json({ data: items });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
