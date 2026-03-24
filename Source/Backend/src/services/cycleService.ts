// Verifies: FR-014, FR-015, FR-016
// Development Cycle service — all business logic; no framework imports.

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import type {
  DevelopmentCycle,
  CycleStatus,
  Ticket,
  TicketStatus,
  WorkItemType,
  ConsideredFix,
} from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';
import { createBug } from './bugService';
import { createLearning } from './learningService';
import { createFeature } from './featureService';
import { listFeedback } from './feedbackService';

// --- Valid status values ---
export const VALID_CYCLE_STATUSES: CycleStatus[] = [
  'spec_changes',
  'ticket_breakdown',
  'implementation',
  'review',
  'smoke_test',
  'complete',
];

export const VALID_TICKET_STATUSES: TicketStatus[] = [
  'pending',
  'in_progress',
  'code_review',
  'testing',
  'security_review',
  'done',
];

// --- Linear cycle status transitions (DD-4) ---
const CYCLE_STATUS_ORDER: CycleStatus[] = [
  'spec_changes',
  'ticket_breakdown',
  'implementation',
  'review',
  'smoke_test',
  'complete',
];

// --- Ticket state machine transitions ---
const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['code_review'],
  code_review: ['testing'],
  testing: ['security_review'],
  security_review: ['done'],
  done: [],
};

// --- Input length limits (DD-11, Security M-04) ---
export const TICKET_TITLE_MAX_LENGTH = 200;
export const TICKET_DESCRIPTION_MAX_LENGTH = 10000;

// --- Severity / priority ordering (highest first) ---
const SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// --- DB row mappings ---
interface CycleRow {
  id: string;
  work_item_id: string;
  work_item_type: string;
  status: string;
  spec_changes: string | null;
  pipeline_run_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TicketRow {
  id: string;
  cycle_id: string;
  title: string;
  description: string;
  status: string;
  assignee: string | null;
  work_item_ref: string | null;
  issue_description: string | null;
  considered_fixes: string | null;  // JSON string
  created_at: string;
  updated_at: string;
}

function mapTicketRow(row: TicketRow): Ticket {
  // FR-055: Parse considered_fixes JSON (DD-19)
  let parsedFixes: ConsideredFix[] | null = null;
  if (row.considered_fixes) {
    try {
      parsedFixes = JSON.parse(row.considered_fixes);
    } catch {
      parsedFixes = null;
    }
  }

  return {
    id: row.id,
    cycle_id: row.cycle_id,
    title: row.title,
    description: row.description,
    status: row.status as TicketStatus,
    assignee: row.assignee,
    work_item_ref: row.work_item_ref || null,          // FR-055
    issue_description: row.issue_description || null,   // FR-055
    considered_fixes: parsedFixes,                      // FR-055
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getTicketsForCycle(db: Database.Database, cycleId: string): Ticket[] {
  const rows = db.prepare(`SELECT * FROM tickets WHERE cycle_id = ? ORDER BY created_at ASC`).all(cycleId) as TicketRow[];
  return rows.map(mapTicketRow);
}

import type { CycleFeedback } from '../../../Shared/types';

function mapCycleRow(
  row: CycleRow,
  tickets: Ticket[],
  feedback: CycleFeedback[] = [],
  teamName: string | null = null,
): DevelopmentCycle {
  return {
    id: row.id,
    work_item_id: row.work_item_id,
    work_item_type: row.work_item_type as WorkItemType,
    status: row.status as CycleStatus,
    spec_changes: row.spec_changes,
    tickets,
    pipeline_run_id: row.pipeline_run_id || null,
    feedback,                           // FR-058
    team_name: teamName,                // FR-058
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

// --- ID generation ---
function generateCycleId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM cycles ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `CYCLE-${String(next).padStart(4, '0')}`;
}

function generateTicketId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM tickets ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `TKT-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

export function listCycles(db: Database.Database): DevelopmentCycle[] {
  const rows = db.prepare(`SELECT * FROM cycles ORDER BY created_at DESC`).all() as CycleRow[];
  return rows.map((row) => mapCycleRow(row, getTicketsForCycle(db, row.id)));
}

export function getCycleById(db: Database.Database, id: string): DevelopmentCycle | null {
  const row = db.prepare(`SELECT * FROM cycles WHERE id = ?`).get(id) as CycleRow | undefined;
  if (!row) return null;

  const tickets = getTicketsForCycle(db, row.id);

  // FR-058: Hydrate feedback[] from cycle_feedback table
  const feedback = listFeedback(db, row.id);

  // FR-058: Hydrate team_name from pipeline_run.team
  let teamName: string | null = null;
  if (row.pipeline_run_id) {
    const pipelineRow = db.prepare(`SELECT team FROM pipeline_runs WHERE id = ?`).get(row.pipeline_run_id) as { team: string } | undefined;
    if (pipelineRow) teamName = pipelineRow.team;
  }

  return mapCycleRow(row, tickets, feedback, teamName);
}

/**
 * Create a new cycle by auto-selecting the highest-priority work item.
 * Priority: bugs (triaged) > FRs (approved), then by severity/priority (critical > high > medium > low).
 * Only one active cycle allowed (409 if one exists).
 */
export function createCycle(db: Database.Database): DevelopmentCycle {
  // Check for existing active cycle (status != 'complete')
  const activeCycle = db.prepare(`SELECT id FROM cycles WHERE status != 'complete'`).get() as { id: string } | undefined;
  if (activeCycle) {
    throw new AppError(409, 'An active development cycle already exists. Complete it before starting a new one.');
  }

  // Try to find a triaged bug first (bugs have priority over FRs)
  const bugsRows = db.prepare(`SELECT * FROM bugs WHERE status = 'triaged' ORDER BY created_at ASC`).all() as Array<{
    id: string;
    title: string;
    severity: string;
  }>;

  let workItemId: string | null = null;
  let workItemType: WorkItemType | null = null;
  let workItemTitle = '';

  if (bugsRows.length > 0) {
    // Sort by severity (critical > high > medium > low)
    const sorted = bugsRows.sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));
    const best = sorted[0];
    workItemId = best.id;
    workItemType = 'bug';
    workItemTitle = best.title;
  } else {
    // Try approved FRs
    const frsRows = db.prepare(`SELECT * FROM feature_requests WHERE status = 'approved' ORDER BY created_at ASC`).all() as Array<{
      id: string;
      title: string;
      priority: string;
    }>;

    if (frsRows.length === 0) {
      throw new AppError(404, 'No available work items to start a cycle. Need triaged bugs or approved feature requests.');
    }

    // Sort by priority (critical > high > medium > low)
    const sorted = frsRows.sort((a, b) => (SEVERITY_ORDER[b.priority] || 0) - (SEVERITY_ORDER[a.priority] || 0));
    const best = sorted[0];
    workItemId = best.id;
    workItemType = 'feature_request';
    workItemTitle = best.title;
  }

  const id = generateCycleId(db);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO cycles (id, work_item_id, work_item_type, status, spec_changes, created_at, completed_at, pipeline_run_id)
    VALUES (?, ?, ?, 'spec_changes', NULL, ?, NULL, NULL)
  `).run(id, workItemId, workItemType, now);

  // Mark work item as in_development
  if (workItemType === 'bug') {
    db.prepare(`UPDATE bugs SET status = 'in_development', updated_at = ? WHERE id = ?`).run(now, workItemId);
  } else {
    db.prepare(`UPDATE feature_requests SET status = 'in_development', updated_at = ? WHERE id = ?`).run(now, workItemId);
  }

  return getCycleById(db, id)!;
}

export interface UpdateCycleInput {
  status?: string;
  spec_changes?: string;
}

export function updateCycle(db: Database.Database, id: string, input: UpdateCycleInput): DevelopmentCycle {
  const cycle = getCycleById(db, id);
  if (!cycle) throw new AppError(404, `Cycle ${id} not found`);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.status !== undefined) {
    // FR-039: Block manual status changes on pipeline-linked cycles (DD-13)
    if (cycle.pipeline_run_id) {
      throw new AppError(
        409,
        `This cycle is orchestrated via pipeline ${cycle.pipeline_run_id}. Use pipeline stage completion to advance phases.`
      );
    }

    const newStatus = input.status as CycleStatus;
    if (!VALID_CYCLE_STATUSES.includes(newStatus)) {
      throw new AppError(400, `Invalid cycle status: ${input.status}`);
    }

    // Block direct transition to complete via PATCH — must use POST /complete (NEW-BLOCKER-1)
    if (newStatus === 'complete') {
      throw new AppError(400, `Use POST /api/cycles/:id/complete to complete a cycle`);
    }

    // Enforce linear transitions (DD-4)
    const currentIdx = CYCLE_STATUS_ORDER.indexOf(cycle.status);
    const newIdx = CYCLE_STATUS_ORDER.indexOf(newStatus);

    if (newIdx !== currentIdx + 1) {
      const nextStatus = CYCLE_STATUS_ORDER[currentIdx + 1] || 'none';
      throw new AppError(
        400,
        `Invalid cycle status transition: ${cycle.status} → ${newStatus}. Next allowed status: ${nextStatus}`
      );
    }

    updates.push(`status = ?`);
    params.push(newStatus);
  }

  if (input.spec_changes !== undefined) {
    updates.push(`spec_changes = ?`);
    params.push(input.spec_changes);
  }

  if (updates.length === 0) {
    return cycle;
  }

  params.push(id);
  db.prepare(`UPDATE cycles SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return getCycleById(db, id)!;
}

// --- Ticket methods ---

export interface CreateTicketInput {
  title: string;
  description: string;
  assignee?: string;
  work_item_ref?: string;                    // FR-055 (DD-24)
  issue_description?: string;                // FR-055
  considered_fixes?: ConsideredFix[];        // FR-055 (DD-19) — JSON array
}

export function createTicket(db: Database.Database, cycleId: string, input: CreateTicketInput): Ticket {
  const cycle = getCycleById(db, cycleId);
  if (!cycle) throw new AppError(404, `Cycle ${cycleId} not found`);

  // Validate input lengths (DD-11, Security M-04)
  if (input.title.length > TICKET_TITLE_MAX_LENGTH) {
    throw new AppError(400, `title must be at most ${TICKET_TITLE_MAX_LENGTH} characters`);
  }
  if (input.description.length > TICKET_DESCRIPTION_MAX_LENGTH) {
    throw new AppError(400, `description must be at most ${TICKET_DESCRIPTION_MAX_LENGTH} characters`);
  }

  const id = generateTicketId(db);
  const now = new Date().toISOString();

  // FR-055: Stringify considered_fixes JSON (DD-19)
  const consideredFixesJson = input.considered_fixes ? JSON.stringify(input.considered_fixes) : null;

  db.prepare(`
    INSERT INTO tickets (id, cycle_id, title, description, status, assignee, work_item_ref, issue_description, considered_fixes, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
  `).run(
    id, cycleId, input.title, input.description,
    input.assignee || null,
    input.work_item_ref || null,
    input.issue_description || null,
    consideredFixesJson,
    now, now
  );

  const row = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as TicketRow;
  return mapTicketRow(row);
}

export interface UpdateTicketInput {
  status?: string;
  title?: string;
  description?: string;
  assignee?: string;
}

export function updateTicket(
  db: Database.Database,
  cycleId: string,
  ticketId: string,
  input: UpdateTicketInput
): Ticket {
  const cycle = getCycleById(db, cycleId);
  if (!cycle) throw new AppError(404, `Cycle ${cycleId} not found`);

  const ticketRow = db.prepare(`SELECT * FROM tickets WHERE id = ? AND cycle_id = ?`).get(ticketId, cycleId) as TicketRow | undefined;
  if (!ticketRow) throw new AppError(404, `Ticket ${ticketId} not found in cycle ${cycleId}`);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.status !== undefined) {
    const newStatus = input.status as TicketStatus;
    if (!VALID_TICKET_STATUSES.includes(newStatus)) {
      throw new AppError(400, `Invalid ticket status: ${input.status}`);
    }

    const currentStatus = ticketRow.status as TicketStatus;
    const allowedTransitions = TICKET_STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        400,
        `Invalid ticket status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
      );
    }

    updates.push(`status = ?`);
    params.push(newStatus);
  }

  if (input.title !== undefined) {
    updates.push(`title = ?`);
    params.push(input.title);
  }

  if (input.description !== undefined) {
    updates.push(`description = ?`);
    params.push(input.description);
  }

  if (input.assignee !== undefined) {
    updates.push(`assignee = ?`);
    params.push(input.assignee);
  }

  if (updates.length === 0) {
    return mapTicketRow(ticketRow);
  }

  updates.push(`updated_at = ?`);
  params.push(new Date().toISOString());
  params.push(ticketId);

  db.prepare(`UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticketId) as TicketRow;
  return mapTicketRow(updated);
}

// --- Cycle completion (FR-016) ---

export interface CompleteCycleOptions {
  /** Injectable random function for testability (default: Math.random) */
  random?: () => number;
}

export function completeCycle(
  db: Database.Database,
  cycleId: string,
  opts: CompleteCycleOptions = {}
): DevelopmentCycle {
  const cycle = getCycleById(db, cycleId);
  if (!cycle) throw new AppError(404, `Cycle ${cycleId} not found`);

  // Validate all tickets are done
  const incompleteTickets = cycle.tickets.filter((t) => t.status !== 'done');
  if (incompleteTickets.length > 0) {
    throw new AppError(
      409,
      `Cannot complete cycle: ${incompleteTickets.length} ticket(s) are not done. Complete all tickets first.`
    );
  }

  const random = opts.random || Math.random;
  const now = new Date().toISOString();

  // Determine work item title for records
  let workItemTitle = cycle.work_item_id;
  if (cycle.work_item_type === 'bug') {
    const bug = db.prepare(`SELECT title FROM bugs WHERE id = ?`).get(cycle.work_item_id) as { title: string } | undefined;
    if (bug) workItemTitle = bug.title;
  } else {
    const fr = db.prepare(`SELECT title FROM feature_requests WHERE id = ?`).get(cycle.work_item_id) as { title: string } | undefined;
    if (fr) workItemTitle = fr.title;
  }

  // Simulate deployment: 10% chance of failure
  const deploymentFailed = random() < 0.1;

  db.transaction(() => {
    // Mark cycle as complete
    db.prepare(`UPDATE cycles SET status = 'complete', completed_at = ? WHERE id = ?`).run(now, cycleId);

    // Create Feature record — FR-056: pass cycle_id (DD-22)
    createFeature(db, {
      title: workItemTitle,
      description: `Completed work item: ${cycle.work_item_id} (${cycle.work_item_type})`,
      source_work_item_id: cycle.work_item_id,
      cycle_id: cycleId,
    });

    // Create Learning record
    createLearning(db, {
      cycle_id: cycleId,
      content: deploymentFailed
        ? `Deployment failure encountered during cycle for ${workItemTitle}. Bug filed for investigation.`
        : `Successfully completed development cycle for ${workItemTitle}.`,
      category: 'process',
    });

    // Mark work item as completed/resolved
    if (cycle.work_item_type === 'bug') {
      db.prepare(`UPDATE bugs SET status = 'resolved', updated_at = ? WHERE id = ?`).run(now, cycle.work_item_id);
    } else {
      db.prepare(`UPDATE feature_requests SET status = 'completed', updated_at = ? WHERE id = ?`).run(now, cycle.work_item_id);
    }

    // Deployment failure: create a bug report — FR-056: populate related fields (DD-18)
    if (deploymentFailed) {
      createBug(db, {
        title: `Deployment failure: ${workItemTitle}`,
        description: `Automated deployment failure detected after completing cycle ${cycleId} for work item ${cycle.work_item_id}.`,
        severity: 'high',
        source_system: 'ci_cd',
        related_work_item_id: cycle.work_item_id,
        related_work_item_type: cycle.work_item_type,
        related_cycle_id: cycleId,
      });
    }
  })();

  return getCycleById(db, cycleId)!;
}
