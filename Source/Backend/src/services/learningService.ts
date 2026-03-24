// Verifies: FR-019
// Learning service — all business logic; no framework imports.

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import type { Learning, LearningCategory } from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';

// --- Valid enum values (DD-8) ---
export const VALID_LEARNING_CATEGORIES: LearningCategory[] = ['process', 'technical', 'domain'];

// --- Input length limits (DD-11, Security M-04) ---
export const CONTENT_MAX_LENGTH = 10000;

// --- DB row mapping ---
interface LearningRow {
  id: string;
  cycle_id: string;
  content: string;
  category: string;
  created_at: string;
}

function mapLearningRow(row: LearningRow): Learning {
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    content: row.content,
    category: row.category as LearningCategory,
    created_at: row.created_at,
  };
}

// --- ID generation ---
function generateLearningId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM learnings ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `LRN-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export interface ListLearningsOptions {
  category?: string;
  cycle_id?: string;
}

export function listLearnings(db: Database.Database, opts: ListLearningsOptions = {}): Learning[] {
  let query = `SELECT * FROM learnings WHERE 1=1`;
  const params: string[] = [];

  if (opts.category) {
    query += ` AND category = ?`;
    params.push(opts.category);
  }
  if (opts.cycle_id) {
    query += ` AND cycle_id = ?`;
    params.push(opts.cycle_id);
  }

  query += ` ORDER BY created_at DESC`;
  const rows = db.prepare(query).all(...params) as LearningRow[];
  return rows.map(mapLearningRow);
}

export interface CreateLearningInput {
  cycle_id: string;
  content: string;
  category: string;
}

export function createLearning(db: Database.Database, input: CreateLearningInput): Learning {
  const { cycle_id, content } = input;
  const category = input.category as LearningCategory;

  // Validate input length (DD-11, Security M-04)
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new AppError(400, `content must be at most ${CONTENT_MAX_LENGTH} characters`);
  }

  if (!VALID_LEARNING_CATEGORIES.includes(category)) {
    throw new AppError(400, `Invalid category. Must be one of: ${VALID_LEARNING_CATEGORIES.join(', ')}`);
  }

  const id = generateLearningId(db);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO learnings (id, cycle_id, content, category, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, cycle_id, content, category, now);

  const row = db.prepare(`SELECT * FROM learnings WHERE id = ?`).get(id) as LearningRow;
  return mapLearningRow(row);
}
