// Verifies: FR-013
// Bug report route handlers — thin HTTP layer, delegates to service.
// All handlers use try/catch + next(err) per DD-3.

import { Router, Request, Response, NextFunction } from 'express';
import { getDb } from '../database/connection';
import {
  listBugs,
  createBug,
  getBugById,
  updateBug,
  deleteBug,
} from '../services/bugService';
import { uploadImagesService, listImages, deleteImage } from '../services/imageService';
import { uploadImages as uploadMiddleware } from '../middleware/upload';
import { AppError } from '../middleware/errorHandler';
import { withSpan } from '../lib/tracing';
import logger from '../lib/logger';

const router = Router();

// GET /api/bugs
// Verifies: FR-013
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('bugs.list', async (span) => {
      const { status, severity } = req.query as { status?: string; severity?: string };
      span.setAttribute('filter.status', status || '');
      span.setAttribute('filter.severity', severity || '');

      const db = getDb();
      const bugs = listBugs(db, { status, severity });
      logger.info('Listed bug reports', { count: bugs.length, status, severity });
      res.json({ data: bugs });
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bugs
// Verifies: FR-013
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('bugs.create', async (span) => {
      const { title, description, severity, source_system, related_work_item_id, related_work_item_type, related_cycle_id, target_repo } = req.body;

      if (!title || typeof title !== 'string' || title.trim() === '') {
        throw new AppError(400, 'title is required');
      }
      if (!description || typeof description !== 'string' || description.trim() === '') {
        throw new AppError(400, 'description is required');
      }
      if (!severity || typeof severity !== 'string' || severity.trim() === '') {
        throw new AppError(400, 'severity is required');
      }

      span.setAttribute('bug.severity', severity);

      const db = getDb();
      // FR-054: Pass optional related work item fields
      const bug = createBug(db, {
        title: title.trim(),
        description: description.trim(),
        severity,
        source_system,
        related_work_item_id,
        related_work_item_type,
        related_cycle_id,
        target_repo,
      });
      logger.info('Created bug report', { id: bug.id, title: bug.title, severity: bug.severity });
      res.status(201).json(bug);
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bugs/:id
// Verifies: FR-013
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('bugs.get', async (span) => {
      const { id } = req.params;
      span.setAttribute('bug.id', id);

      const db = getDb();
      const bug = getBugById(db, id);
      if (!bug) throw new AppError(404, `Bug ${id} not found`);

      logger.info('Retrieved bug report', { id });
      res.json(bug);
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bugs/:id
// Verifies: FR-013
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('bugs.update', async (span) => {
      const { id } = req.params;
      span.setAttribute('bug.id', id);

      const db = getDb();
      const existing = getBugById(db, id);
      if (!existing) throw new AppError(404, `Bug ${id} not found`);

      const { title, description, severity, status, source_system } = req.body;
      const updated = updateBug(db, id, { title, description, severity, status, source_system });

      logger.info('Updated bug report', { id, status: updated.status });
      res.json(updated);
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bugs/:id
// Verifies: FR-013
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await withSpan('bugs.delete', async (span) => {
      const { id } = req.params;
      span.setAttribute('bug.id', id);

      const db = getDb();
      deleteBug(db, id);
      logger.info('Deleted bug report', { id });
      res.status(204).send();
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/bugs/:id/images
// Verifies: FR-076
router.post('/:id/images', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const bug = getBugById(db, id);
    if (!bug) {
      res.status(404).json({ error: 'Bug not found' });
      return;
    }

    uploadMiddleware(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        if (message.includes('File too large') || message.includes('LIMIT_FILE_SIZE')) {
          res.status(400).json({ error: 'File too large (max 5MB)' });
          return;
        }
        if (message.includes('Invalid file type')) {
          res.status(400).json({ error: message });
          return;
        }
        next(err);
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      const images = uploadImagesService(db, id, 'bug', files);
      logger.info('Images uploaded for bug report', { bug_id: id, count: images.length });
      res.status(201).json({ data: images });
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/bugs/:id/images
// Verifies: FR-077
router.get('/:id/images', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const bug = getBugById(db, id);
    if (!bug) throw new AppError(404, 'Bug not found');

    const images = listImages(db, id, 'bug');
    res.json({ data: images });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bugs/:id/images/:imageId
// Verifies: FR-077
router.delete('/:id/images/:imageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { imageId } = req.params;
    deleteImage(getDb(), imageId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
