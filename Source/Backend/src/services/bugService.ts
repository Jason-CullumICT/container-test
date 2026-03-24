// Verifies: FR-013
// Bug Report service — all business logic; no framework imports.

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import type { BugReport, BugSeverity, BugStatus, WorkItemType } from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';

// --- Valid enum values (DD-8) ---
export const VALID_SEVERITIES: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
export const VALID_BUG_STATUSES: BugStatus[] = ['reported', 'triaged', 'in_development', 'resolved', 'closed'];

// --- Input length limits (DD-11, Security M-04) ---
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10000;

// --- DB row mapping ---
interface BugRow {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  source_system: string;
  related_work_item_id: string | null;
  related_work_item_type: string | null;
  related_cycle_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapBugRow(row: BugRow): BugReport {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity as BugSeverity,
    status: row.status as BugStatus,
    source_system: row.source_system,
    related_work_item_id: row.related_work_item_id || null,       // FR-054
    related_work_item_type: (row.related_work_item_type as WorkItemType) || null, // FR-054
    related_cycle_id: row.related_cycle_id || null,                // FR-054
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- ID generation ---
function generateBugId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM bugs ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `BUG-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export interface ListBugsOptions {
  status?: string;
  severity?: string;
}

export function listBugs(db: Database.Database, opts: ListBugsOptions = {}): BugReport[] {
  let query = `SELECT * FROM bugs WHERE 1=1`;
  const params: string[] = [];

  if (opts.status) {
    query += ` AND status = ?`;
    params.push(opts.status);
  }
  if (opts.severity) {
    query += ` AND severity = ?`;
    params.push(opts.severity);
  }

  query += ` ORDER BY created_at DESC`;
  const rows = db.prepare(query).all(...params) as BugRow[];
  return rows.map(mapBugRow);
}

export interface CreateBugInput {
  title: string;
  description: string;
  severity: string;
  source_system?: string;
  related_work_item_id?: string;             // FR-054
  related_work_item_type?: string;           // FR-054
  related_cycle_id?: string;                 // FR-054
}

export function createBug(db: Database.Database, input: CreateBugInput): BugReport {
  const { title, description } = input;
  const severity = input.severity as BugSeverity;
  const source_system = input.source_system || 'manual';

  // Validate input lengths (DD-11, Security M-04)
  if (title.length > TITLE_MAX_LENGTH) {
    throw new AppError(400, `title must be at most ${TITLE_MAX_LENGTH} characters`);
  }
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    throw new AppError(400, `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`);
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    throw new AppError(400, `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  const id = generateBugId(db);
  const now = new Date().toISOString();

  // FR-054: Accept and persist related work item fields (DD-18: all nullable)
  db.prepare(`
    INSERT INTO bugs (id, title, description, severity, status, source_system, related_work_item_id, related_work_item_type, related_cycle_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'reported', ?, ?, ?, ?, ?, ?)
  `).run(
    id, title, description, severity, source_system,
    input.related_work_item_id || null,
    input.related_work_item_type || null,
    input.related_cycle_id || null,
    now, now
  );

  return getBugById(db, id)!;
}

export function getBugById(db: Database.Database, id: string): BugReport | null {
  const row = db.prepare(`SELECT * FROM bugs WHERE id = ?`).get(id) as BugRow | undefined;
  if (!row) return null;
  return mapBugRow(row);
}

export interface UpdateBugInput {
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  source_system?: string;
}

export function updateBug(db: Database.Database, id: string, input: UpdateBugInput): BugReport {
  const bug = getBugById(db, id);
  if (!bug) throw new AppError(404, `Bug ${id} not found`);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.title !== undefined) {
    if (input.title.length > TITLE_MAX_LENGTH) {
      throw new AppError(400, `title must be at most ${TITLE_MAX_LENGTH} characters`);
    }
    updates.push(`title = ?`);
    params.push(input.title);
  }

  if (input.description !== undefined) {
    if (input.description.length > DESCRIPTION_MAX_LENGTH) {
      throw new AppError(400, `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`);
    }
    updates.push(`description = ?`);
    params.push(input.description);
  }

  if (input.severity !== undefined) {
    const severity = input.severity as BugSeverity;
    if (!VALID_SEVERITIES.includes(severity)) {
      throw new AppError(400, `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }
    updates.push(`severity = ?`);
    params.push(severity);
  }

  if (input.status !== undefined) {
    const status = input.status as BugStatus;
    if (!VALID_BUG_STATUSES.includes(status)) {
      throw new AppError(400, `Invalid status. Must be one of: ${VALID_BUG_STATUSES.join(', ')}`);
    }
    updates.push(`status = ?`);
    params.push(status);
  }

  if (input.source_system !== undefined) {
    updates.push(`source_system = ?`);
    params.push(input.source_system);
  }

  if (updates.length === 0) {
    return bug;
  }

  updates.push(`updated_at = ?`);
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE bugs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getBugById(db, id)!;
}

export function deleteBug(db: Database.Database, id: string): void {
  const bug = getBugById(db, id);
  if (!bug) throw new AppError(404, `Bug ${id} not found`);

  db.prepare(`DELETE FROM bugs WHERE id = ?`).run(id);
}
