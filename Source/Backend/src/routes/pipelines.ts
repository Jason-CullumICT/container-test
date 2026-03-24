// Verifies: FR-040, FR-043
// Pipeline run route handlers — thin HTTP layer, delegates to pipelineService.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import {
  listPipelineRuns,
  getPipelineRunById,
  getPipelineRunByCycleId,
  startStage,
  completeStageAction,
} from '../services/pipelineService';
import { getCycleById } from '../services/cycleService';
import { AppError } from '../middleware/errorHandler';
import { withSpan } from '../lib/tracing';
import logger from '../lib/logger';

const router = Router();

// GET /api/pipeline-runs
// Verifies: FR-040
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('pipelines.list', async () => {
      const db = getDb();
      const statusFilter = req.query.status as string | undefined;
      const runs = listPipelineRuns(db, statusFilter);
      logger.info('Listed pipeline runs', { count: runs.length, status_filter: statusFilter });
      res.json({ data: runs });
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline-runs/:id
// Verifies: FR-040
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('pipelines.get', async (span) => {
      const { id } = req.params;
      span.setAttribute('pipeline_run.id', id);

      const db = getDb();
      const run = getPipelineRunById(db, id);
      if (!run) throw new AppError(404, `Pipeline run ${id} not found`);

      logger.info('Retrieved pipeline run', { id, status: run.status, current_stage: run.current_stage });
      res.json(run);
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline-runs/:id/stages/:stageNumber/start
// Verifies: FR-040
router.post('/:id/stages/:stageNumber/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('pipelines.stages.start', async (span) => {
      const { id } = req.params;
      const stageNumber = parseInt(req.params.stageNumber, 10);
      span.setAttribute('pipeline_run.id', id);
      span.setAttribute('pipeline_stage.number', stageNumber);

      if (isNaN(stageNumber) || stageNumber < 1 || stageNumber > 5) {
        throw new AppError(400, 'Stage number must be between 1 and 5');
      }

      const db = getDb();
      const run = startStage(db, id, stageNumber);
      logger.info('Started pipeline stage', { run_id: id, stage: stageNumber });
      res.json(run);
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline-runs/:id/stages/:stageNumber/complete
// Verifies: FR-040
router.post('/:id/stages/:stageNumber/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('pipelines.stages.complete', async (span) => {
      const { id } = req.params;
      const stageNumber = parseInt(req.params.stageNumber, 10);
      span.setAttribute('pipeline_run.id', id);
      span.setAttribute('pipeline_stage.number', stageNumber);

      if (isNaN(stageNumber) || stageNumber < 1 || stageNumber > 5) {
        throw new AppError(400, 'Stage number must be between 1 and 5');
      }

      const { verdict, feedback } = req.body;
      if (!verdict) {
        throw new AppError(400, 'verdict is required');
      }

      const db = getDb();
      // FR-060: Pass optional feedback array to stage completion (DD-23)
      const run = completeStageAction(db, id, stageNumber, verdict, { feedback });
      logger.info('Completed pipeline stage', { run_id: id, stage: stageNumber, verdict });
      res.json(run);
    });
  } catch (err) {
    next(err);
  }
});

export default router;

// --- Cycle pipeline convenience endpoint (mounted on cycles router) ---
// GET /api/cycles/:id/pipeline
// Verifies: FR-040
export function getCyclePipelineHandler(req: Request, res: Response, next: NextFunction): void {
  (async () => {
    try {
      await withSpan('cycles.pipeline.get', async (span) => {
        const { id } = req.params;
        span.setAttribute('cycle.id', id);

        const db = getDb();
        const cycle = getCycleById(db, id);
        if (!cycle) throw new AppError(404, `Cycle ${id} not found`);

        const run = getPipelineRunByCycleId(db, id);
        if (!run) throw new AppError(404, `No pipeline run linked to cycle ${id}`);

        logger.info('Retrieved pipeline for cycle', { cycle_id: id, run_id: run.id });
        res.json(run);
      });
    } catch (err) {
      next(err);
    }
  })();
}
