// Verifies: FR-074, FR-079
// Image attachment service — all business logic for image CRUD.
// No framework imports. Uses structured logging and Prometheus metrics.

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import type { ImageAttachment, ImageEntityType } from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';
import logger from '../lib/logger';
import { imageUploadsCounter } from '../middleware/metrics';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// --- DB row mapping ---
interface ImageRow {
  id: string;
  entity_id: string;
  entity_type: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function mapImageRow(row: ImageRow): ImageAttachment {
  return {
    id: row.id,
    entity_id: row.entity_id,
    entity_type: row.entity_type as ImageEntityType,
    filename: row.filename,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
  };
}

// --- ID generation ---
function generateImageId(db: Database.Database): string {
  const row = db.prepare('SELECT id FROM image_attachments ORDER BY id DESC LIMIT 1').get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `IMG-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

// Verifies: FR-074
export function uploadImagesService(
  db: Database.Database,
  entityId: string,
  entityType: ImageEntityType,
  files: MulterFile[]
): ImageAttachment[] {
  const now = new Date().toISOString();
  const results: ImageAttachment[] = [];

  const insertStmt = db.prepare(`
    INSERT INTO image_attachments (id, entity_id, entity_type, filename, original_name, mime_type, size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const file of files) {
      const id = generateImageId(db);
      insertStmt.run(id, entityId, entityType, file.filename, file.originalname, file.mimetype, file.size, now);
      results.push({
        id,
        entity_id: entityId,
        entity_type: entityType,
        filename: file.filename,
        original_name: file.originalname,
        mime_type: file.mimetype,
        size_bytes: file.size,
        created_at: now,
      });
    }
  });

  insertAll();

  // FR-079: Observability
  logger.info('Images uploaded', { entity_id: entityId, entity_type: entityType, count: files.length });
  imageUploadsCounter.inc({ entity_type: entityType }, files.length);

  return results;
}

// Verifies: FR-074
export function listImages(
  db: Database.Database,
  entityId: string,
  entityType: ImageEntityType
): ImageAttachment[] {
  const rows = db.prepare(
    'SELECT * FROM image_attachments WHERE entity_id = ? AND entity_type = ? ORDER BY created_at ASC'
  ).all(entityId, entityType) as ImageRow[];
  return rows.map(mapImageRow);
}

// Verifies: FR-074
export function deleteImage(
  db: Database.Database,
  imageId: string
): void {
  const row = db.prepare('SELECT * FROM image_attachments WHERE id = ?').get(imageId) as ImageRow | undefined;
  if (!row) {
    throw new AppError(404, 'Image not found');
  }

  // Delete from DB
  db.prepare('DELETE FROM image_attachments WHERE id = ?').run(imageId);

  // DD-IMG-05: Delete file from disk
  const filePath = path.join(UPLOAD_DIR, row.filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    // Log but don't fail — DB record is already deleted
    logger.warn('Failed to delete image file from disk', { imageId, filename: row.filename, error: (err as Error).message });
  }

  // FR-079: Observability
  logger.info('Image deleted', { imageId, entity_id: row.entity_id, entity_type: row.entity_type });
}
