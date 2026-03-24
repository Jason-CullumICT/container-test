// Verifies: FR-019
// Learning route handlers — thin HTTP layer, delegates to service.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import { listLearnings, createLearning } from '../services/learningService';
import { AppError } from '../middleware/errorHandler';
import { withSpan } from '../lib/tracing';
import logger from '../lib/logger';

const router = Router();

// GET /api/learnings
// Verifies: FR-019
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('learnings.list', async (span) => {
      const { category, cycle_id } = req.query as { category?: string; cycle_id?: string };
      span.setAttribute('filter.category', category || '');
      span.setAttribute('filter.cycle_id', cycle_id || '');

      const db = getDb();
      const learnings = listLearnings(db, { category, cycle_id });
      logger.info('Listed learnings', { count: learnings.length, category, cycle_id });
      res.json({ data: learnings });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/learnings
// Verifies: FR-019
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('learnings.create', async (span) => {
      const { cycle_id, content, category } = req.body;

      if (!cycle_id || typeof cycle_id !== 'string' || cycle_id.trim() === '') {
        throw new AppError(400, 'cycle_id is required');
      }
      if (!content || typeof content !== 'string' || content.trim() === '') {
        throw new AppError(400, 'content is required');
      }
      if (!category || typeof category !== 'string' || category.trim() === '') {
        throw new AppError(400, 'category is required');
      }

      span.setAttribute('learning.category', category);

      const db = getDb();
      const learning = createLearning(db, { cycle_id: cycle_id.trim(), content: content.trim(), category });
      logger.info('Created learning', { id: learning.id, cycle_id: learning.cycle_id, category: learning.category });
      res.status(201).json(learning);
    });
  } catch (err) {
    next(err);
  }
});

export default router;
