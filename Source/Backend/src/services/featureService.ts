// Verifies: FR-020
// Feature (completed work items) service — all business logic; no framework imports.

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import type { Feature } from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';

// --- DB row mapping ---
interface FeatureRow {
  id: string;
  title: string;
  description: string;
  source_work_item_id: string;
  cycle_id: string | null;
  traceability_report: string | null;
  created_at: string;
}

function mapFeatureRow(row: FeatureRow): Feature {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source_work_item_id: row.source_work_item_id,
    cycle_id: row.cycle_id || null,                   // FR-057
    traceability_report: row.traceability_report || null, // FR-057
    created_at: row.created_at,
  };
}

// --- ID generation ---
function generateFeatureId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM features ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `FEAT-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export interface ListFeaturesOptions {
  q?: string;
}

export function listFeatures(db: Database.Database, opts: ListFeaturesOptions = {}): Feature[] {
  let query: string;
  const params: string[] = [];

  if (opts.q && opts.q.trim()) {
    const escaped = opts.q.trim().replace(/[%_\\]/g, '\\$&');
    const searchTerm = `%${escaped}%`;
    query = `SELECT * FROM features WHERE (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\') ORDER BY created_at DESC`;
    params.push(searchTerm, searchTerm);
  } else {
    query = `SELECT * FROM features ORDER BY created_at DESC`;
  }

  const rows = db.prepare(query).all(...params) as FeatureRow[];
  return rows.map(mapFeatureRow);
}

export interface CreateFeatureInput {
  title: string;
  description: string;
  source_work_item_id: string;
  cycle_id?: string;                         // FR-057 (DD-22)
  traceability_report?: string;              // FR-057 (DD-21)
}

export function createFeature(db: Database.Database, input: CreateFeatureInput): Feature {
  const { title, description, source_work_item_id } = input;

  const id = generateFeatureId(db);
  const now = new Date().toISOString();

  // FR-057: Accept and persist cycle_id and traceability_report
  db.prepare(`
    INSERT INTO features (id, title, description, source_work_item_id, cycle_id, traceability_report, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, source_work_item_id, input.cycle_id || null, input.traceability_report || null, now);

  const row = db.prepare(`SELECT * FROM features WHERE id = ?`).get(id) as FeatureRow;
  return mapFeatureRow(row);
}
