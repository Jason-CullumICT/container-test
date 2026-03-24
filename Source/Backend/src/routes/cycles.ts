// Verifies: FR-014, FR-015, FR-016
// Development Cycle route handlers — thin HTTP layer, delegates to service.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import {
  listCycles,
  createCycle,
  getCycleById,
  updateCycle,
  createTicket,
  updateTicket,
  completeCycle,
} from '../services/cycleService';
import { createPipelineRun, getPipelineRunById } from '../services/pipelineService';
import { createFeedback, listFeedback } from '../services/feedbackService';
import { AppError } from '../middleware/errorHandler';
import { withSpan } from '../lib/tracing';
import { getCyclePipelineHandler } from './pipelines';
import logger from '../lib/logger';

const router = Router();

// GET /api/cycles
// Verifies: FR-014
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.list', async () => {
      const db = getDb();
      const cycles = listCycles(db);
      logger.info('Listed development cycles', { count: cycles.length });
      res.json({ data: cycles });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cycles
// Verifies: FR-014, FR-037
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.create', async (span) => {
      const db = getDb();
      const cycle = createCycle(db);
      span.setAttribute('cycle.id', cycle.id);
      span.setAttribute('cycle.work_item_id', cycle.work_item_id);
      span.setAttribute('cycle.work_item_type', cycle.work_item_type);

      // FR-037: Create pipeline run linked to cycle, auto-start stage 1
      const pipelineRun = createPipelineRun(db, cycle.id);
      span.setAttribute('pipeline_run.id', pipelineRun.id);

      // Re-fetch cycle with pipeline_run_id set
      const updatedCycle = getCycleById(db, cycle.id)!;

      logger.info('Created development cycle with pipeline', {
        id: updatedCycle.id,
        work_item_id: updatedCycle.work_item_id,
        work_item_type: updatedCycle.work_item_type,
        pipeline_run_id: pipelineRun.id,
      });
      res.status(201).json(updatedCycle);
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/cycles/:id
// Verifies: FR-014
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.get', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const db = getDb();
      const cycle = getCycleById(db, id);
      if (!cycle) throw new AppError(404, `Cycle ${id} not found`);

      // FR-041: Hydrate pipeline_run when present
      if (cycle.pipeline_run_id) {
        const pipelineRun = getPipelineRunById(db, cycle.pipeline_run_id);
        if (pipelineRun) {
          cycle.pipeline_run = pipelineRun;
        }
      }

      logger.info('Retrieved development cycle', { id, ticket_count: cycle.tickets.length });
      res.json(cycle);
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cycles/:id
// Verifies: FR-014
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.update', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const db = getDb();
      const existing = getCycleById(db, id);
      if (!existing) throw new AppError(404, `Cycle ${id} not found`);

      const { status, spec_changes } = req.body;
      const updated = updateCycle(db, id, { status, spec_changes });

      if (status && status !== existing.status) {
        span.setAttribute('cycle.status.from', existing.status);
        span.setAttribute('cycle.status.to', status);
        logger.info('Development cycle status updated', { id, from: existing.status, to: status });
      }

      res.json(updated);
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cycles/:id/tickets
// Verifies: FR-015
router.post('/:id/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.tickets.create', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const { title, description, assignee, work_item_ref, issue_description, considered_fixes } = req.body;

      if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new AppError(400, 'title is required');
      }
      if (!description || typeof description !== 'string' || description.trim() === '') {
        throw new AppError(400, 'description is required');
      }

      const db = getDb();
      // FR-055: Pass new traceability fields to createTicket
      const ticket = createTicket(db, id, {
        title: title.trim(),
        description: description.trim(),
        assignee,
        work_item_ref,
        issue_description,
        considered_fixes,
      });
      span.setAttribute('ticket.id', ticket.id);
      logger.info('Created ticket', { id: ticket.id, cycle_id: id });
      res.status(201).json(ticket);
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/cycles/:id/tickets/:ticketId
// Verifies: FR-015
router.patch('/:id/tickets/:ticketId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.tickets.update', async (span) => {
      const { id, ticketId } = req.params;
      span.setAttribute('cycle.id', id);
      span.setAttribute('ticket.id', ticketId);

      const { status, title, description, assignee } = req.body;

      const db = getDb();
      const updated = updateTicket(db, id, ticketId, { status, title, description, assignee });

      logger.info('Updated ticket', { id: ticketId, cycle_id: id, status: updated.status });
      res.json(updated);
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/cycles/:id/pipeline
// Verifies: FR-040
router.get('/:id/pipeline', getCyclePipelineHandler);

// POST /api/cycles/:id/complete
// Verifies: FR-016
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.complete', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const db = getDb();
      const cycle = completeCycle(db, id);
      span.setAttribute('cycle.status', cycle.status);
      logger.info('Completed development cycle', { id, work_item_id: cycle.work_item_id });
      res.json(cycle);
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/cycles/:id/feedback
// Verifies: FR-059
router.get('/:id/feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.feedback.list', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const db = getDb();

      // Verify cycle exists
      const cycle = getCycleById(db, id);
      if (!cycle) throw new AppError(404, `Cycle ${id} not found`);

      const { agent_role, feedback_type } = req.query;
      const feedback = listFeedback(db, id, {
        agent_role: agent_role as string | undefined,
        feedback_type: feedback_type as string | undefined,
      });

      logger.info('Listed cycle feedback', { cycle_id: id, count: feedback.length });
      res.json({ data: feedback });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/cycles/:id/feedback
// Verifies: FR-059
router.post('/:id/feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('cycles.feedback.create', async (span) => {
      const { id } = req.params;
      span.setAttribute('cycle.id', id);

      const { ticket_id, agent_role, team, feedback_type, content } = req.body;

      const db = getDb();
      const feedback = createFeedback(db, id, {
        ticket_id,
        agent_role,
        team,
        feedback_type,
        content,
      });

      span.setAttribute('feedback.id', feedback.id);
      logger.info('Created cycle feedback', { id: feedback.id, cycle_id: id, agent_role, feedback_type });
      res.status(201).json(feedback);
    });
  } catch (err) {
    next(err);
  }
});

export default router;
