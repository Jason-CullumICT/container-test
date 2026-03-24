// Verifies: FR-020
// Feature (completed items) route handlers — thin HTTP layer, delegates to service.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import { listFeatures } from '../services/featureService';
import { withSpan } from '../lib/tracing';
import logger from '../lib/logger';

const router = Router();

// GET /api/features
// Verifies: FR-020
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('features.list', async (span) => {
      const { q } = req.query as { q?: string };
      span.setAttribute('search.query', q || '');

      const db = getDb();
      const features = listFeatures(db, { q });
      logger.info('Listed features', { count: features.length, query: q });
      res.json({ data: features });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
