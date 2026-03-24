// Verifies: FR-053
// Cycle Feedback service — CRUD for cycle_feedback table.
// Feedback may be cycle-level or ticket-level (DD-20).

import Database from 'better-sqlite3';
import type { CycleFeedback, CycleFeedbackType } from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import { cycleFeedbackCounter } from '../middleware/metrics';

// --- Valid feedback types ---
export const VALID_FEEDBACK_TYPES: CycleFeedbackType[] = ['rejection', 'finding', 'suggestion', 'approval'];

// --- Content length limit ---
export const FEEDBACK_CONTENT_MAX_LENGTH = 10000;

// --- DB row mapping ---
interface FeedbackRow {
  id: string;
  cycle_id: string;
  ticket_id: string | null;
  agent_role: string;
  team: string;
  feedback_type: string;
  content: string;
  created_at: string;
}

function mapFeedbackRow(row: FeedbackRow): CycleFeedback {
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    ticket_id: row.ticket_id,
    agent_role: row.agent_role,
    team: row.team,
    feedback_type: row.feedback_type as CycleFeedbackType,
    content: row.content,
    created_at: row.created_at,
  };
}

// --- ID generation (DD-10 pattern) ---
function generateFeedbackId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM cycle_feedback ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `CFBK-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export interface CreateFeedbackInput {
  ticket_id?: string;
  agent_role: string;
  team?: string;
  feedback_type: string;
  content: string;
}

/**
 * Create a feedback entry for a cycle.
 * Validates cycle exists; if ticket_id provided, validates ticket belongs to cycle.
 * Verifies: FR-053
 */
export function createFeedback(
  db: Database.Database,
  cycleId: string,
  input: CreateFeedbackInput
): CycleFeedback {
  // Validate required fields
  if (!input.agent_role || typeof input.agent_role !== 'string' || input.agent_role.trim() === '') {
    throw new AppError(400, 'agent_role is required');
  }
  if (!input.feedback_type || typeof input.feedback_type !== 'string') {
    throw new AppError(400, 'feedback_type is required');
  }
  if (!input.content || typeof input.content !== 'string' || input.content.trim() === '') {
    throw new AppError(400, 'content is required');
  }

  // Validate feedback_type enum
  const feedbackType = input.feedback_type as CycleFeedbackType;
  if (!VALID_FEEDBACK_TYPES.includes(feedbackType)) {
    throw new AppError(400, `Invalid feedback_type. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}`);
  }

  // Validate content length
  if (input.content.length > FEEDBACK_CONTENT_MAX_LENGTH) {
    throw new AppError(400, `content must be at most ${FEEDBACK_CONTENT_MAX_LENGTH} characters`);
  }

  // Validate cycle exists
  const cycle = db.prepare(`SELECT id FROM cycles WHERE id = ?`).get(cycleId) as { id: string } | undefined;
  if (!cycle) {
    throw new AppError(404, `Cycle ${cycleId} not found`);
  }

  // Validate ticket if provided
  if (input.ticket_id) {
    const ticket = db.prepare(
      `SELECT id FROM tickets WHERE id = ? AND cycle_id = ?`
    ).get(input.ticket_id, cycleId) as { id: string } | undefined;
    if (!ticket) {
      throw new AppError(404, `Ticket ${input.ticket_id} not found in cycle ${cycleId}`);
    }
  }

  const id = generateFeedbackId(db);
  const now = new Date().toISOString();
  const team = input.team || 'TheATeam';

  db.prepare(`
    INSERT INTO cycle_feedback (id, cycle_id, ticket_id, agent_role, team, feedback_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, cycleId, input.ticket_id || null, input.agent_role.trim(), team, feedbackType, input.content.trim(), now);

  // Observability (FR-061)
  logger.info('Created cycle feedback', { id, cycle_id: cycleId, agent_role: input.agent_role, feedback_type: feedbackType });
  cycleFeedbackCounter.inc({ feedback_type: feedbackType });

  return getFeedbackById(db, id)!;
}

/**
 * List feedback for a cycle, optionally filtered by agent_role and/or feedback_type.
 * Verifies: FR-053
 */
export interface ListFeedbackOptions {
  agent_role?: string;
  feedback_type?: string;
}

export function listFeedback(
  db: Database.Database,
  cycleId: string,
  opts: ListFeedbackOptions = {}
): CycleFeedback[] {
  let query = `SELECT * FROM cycle_feedback WHERE cycle_id = ?`;
  const params: string[] = [cycleId];

  if (opts.agent_role) {
    query += ` AND agent_role = ?`;
    params.push(opts.agent_role);
  }
  if (opts.feedback_type) {
    query += ` AND feedback_type = ?`;
    params.push(opts.feedback_type);
  }

  query += ` ORDER BY created_at ASC`;
  const rows = db.prepare(query).all(...params) as FeedbackRow[];
  return rows.map(mapFeedbackRow);
}

/**
 * Get a single feedback entry by ID.
 * Verifies: FR-053
 */
export function getFeedbackById(db: Database.Database, id: string): CycleFeedback | null {
  const row = db.prepare(`SELECT * FROM cycle_feedback WHERE id = ?`).get(id) as FeedbackRow | undefined;
  if (!row) return null;
  return mapFeedbackRow(row);
}
