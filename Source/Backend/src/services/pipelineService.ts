// Verifies: FR-036, FR-038, FR-043
// Pipeline orchestration service — manages pipeline runs and stage progression.
// Stage completion auto-advances the linked cycle phase (DD-12).
// Stage 5 completion triggers completeCycle() with all side-effects (DD-14).

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import type {
  PipelineRun,
  PipelineStage,
  PipelineRunStatus,
  PipelineStageStatus,
  PipelineStageName,
  CycleStatus,
} from '../../../Shared/types';
import { AppError } from '../middleware/errorHandler';
import { completeCycle, CompleteCycleOptions } from './cycleService';
import { createFeedback } from './feedbackService';
import { logger } from '../lib/logger';
import { pipelineStageCompletionsCounter } from '../middleware/metrics';

// --- Pipeline stage configuration ---
// Verifies: FR-036
const PIPELINE_STAGES: Array<{ name: PipelineStageName; agents: string[] }> = [
  { name: 'requirements', agents: ['requirements-reviewer'] },
  { name: 'api_contract', agents: ['api-contract'] },
  { name: 'implementation', agents: ['backend-coder', 'frontend-coder'] },
  { name: 'qa', agents: ['chaos-tester', 'security-qa', 'traceability-reporter', 'visual-playwright', 'qa-review-and-tests'] },
  { name: 'integration', agents: ['design-critic', 'integration-reviewer'] },
];

// Stage-to-cycle phase mapping (DD-12)
// Verifies: FR-038
const STAGE_TO_CYCLE_PHASE: Record<number, CycleStatus> = {
  1: 'ticket_breakdown',    // after requirements complete
  2: 'implementation',      // after api_contract complete
  3: 'review',              // after implementation complete
  4: 'smoke_test',          // after qa complete
  // 5: 'complete' handled via completeCycle()
};

// --- DB row mappings ---
interface PipelineRunRow {
  id: string;
  cycle_id: string;
  team: string;
  status: string;
  current_stage: number;
  stages_total: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface PipelineStageRow {
  id: string;
  pipeline_run_id: string;
  stage_number: number;
  stage_name: string;
  status: string;
  verdict: string | null;
  agent_ids: string;
  started_at: string | null;
  completed_at: string | null;
}

function mapStageRow(row: PipelineStageRow): PipelineStage {
  return {
    id: row.id,
    pipeline_run_id: row.pipeline_run_id,
    stage_number: row.stage_number,
    stage_name: row.stage_name as PipelineStageName,
    status: row.status as PipelineStageStatus,
    verdict: row.verdict,
    agent_ids: JSON.parse(row.agent_ids),
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

function getStagesForRun(db: Database.Database, runId: string): PipelineStage[] {
  const rows = db.prepare(
    `SELECT * FROM pipeline_stages WHERE pipeline_run_id = ? ORDER BY stage_number ASC`
  ).all(runId) as PipelineStageRow[];
  return rows.map(mapStageRow);
}

function mapRunRow(row: PipelineRunRow, stages: PipelineStage[]): PipelineRun {
  return {
    id: row.id,
    cycle_id: row.cycle_id,
    team: row.team,
    status: row.status as PipelineRunStatus,
    current_stage: row.current_stage,
    stages_total: row.stages_total,
    stages,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

// --- ID generation (DD-10 pattern) ---
function generateRunId(db: Database.Database): string {
  const row = db.prepare(`SELECT id FROM pipeline_runs ORDER BY id DESC LIMIT 1`).get() as { id: string } | undefined;
  let next = 1;
  if (row) {
    const match = row.id.match(/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `RUN-${String(next).padStart(4, '0')}`;
}

// --- Service methods ---

/**
 * Create a new pipeline run linked to a cycle.
 * Creates 5 stages (all pending) and auto-starts stage 1.
 * Verifies: FR-036, FR-037
 */
export function createPipelineRun(db: Database.Database, cycleId: string): PipelineRun {
  const id = generateRunId(db);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO pipeline_runs (id, cycle_id, team, status, current_stage, stages_total, created_at, updated_at, completed_at)
    VALUES (?, ?, 'TheATeam', 'running', 1, 5, ?, ?, NULL)
  `).run(id, cycleId, now, now);

  // Create 5 pipeline stages
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const stageId = uuidv4();
    const stageNumber = i + 1;
    const isFirst = stageNumber === 1;

    db.prepare(`
      INSERT INTO pipeline_stages (id, pipeline_run_id, stage_number, stage_name, status, verdict, agent_ids, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)
    `).run(
      stageId,
      id,
      stageNumber,
      stage.name,
      isFirst ? 'running' : 'pending',
      JSON.stringify(stage.agents),
      isFirst ? now : null
    );
  }

  // Link pipeline run to cycle
  db.prepare(`UPDATE cycles SET pipeline_run_id = ? WHERE id = ?`).run(id, cycleId);

  logger.info('Created pipeline run', { id, cycle_id: cycleId, stages: PIPELINE_STAGES.length });

  return getPipelineRunById(db, id)!;
}

/**
 * List all pipeline runs, optionally filtered by status.
 * Verifies: FR-036
 */
export function listPipelineRuns(db: Database.Database, statusFilter?: string): PipelineRun[] {
  let query = `SELECT * FROM pipeline_runs`;
  const params: string[] = [];

  if (statusFilter) {
    query += ` WHERE status = ?`;
    params.push(statusFilter);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = db.prepare(query).all(...params) as PipelineRunRow[];
  return rows.map((row) => mapRunRow(row, getStagesForRun(db, row.id)));
}

/**
 * Get a pipeline run by ID, including stages.
 * Verifies: FR-036
 */
export function getPipelineRunById(db: Database.Database, id: string): PipelineRun | null {
  const row = db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`).get(id) as PipelineRunRow | undefined;
  if (!row) return null;
  return mapRunRow(row, getStagesForRun(db, row.id));
}

/**
 * Get a pipeline run by cycle ID.
 * Verifies: FR-036
 */
export function getPipelineRunByCycleId(db: Database.Database, cycleId: string): PipelineRun | null {
  const row = db.prepare(`SELECT * FROM pipeline_runs WHERE cycle_id = ?`).get(cycleId) as PipelineRunRow | undefined;
  if (!row) return null;
  return mapRunRow(row, getStagesForRun(db, row.id));
}

/**
 * Mark a stage as running. Enforces linear ordering (DD-15).
 * Verifies: FR-036
 */
export function startStage(db: Database.Database, runId: string, stageNumber: number): PipelineRun {
  const run = getPipelineRunById(db, runId);
  if (!run) throw new AppError(404, `Pipeline run ${runId} not found`);

  const stage = run.stages.find((s) => s.stage_number === stageNumber);
  if (!stage) throw new AppError(404, `Stage ${stageNumber} not found in pipeline run ${runId}`);

  if (stage.status !== 'pending' && stage.status !== 'failed') {
    throw new AppError(409, `Stage ${stageNumber} is already ${stage.status}`);
  }

  // Enforce linear ordering (DD-15): previous stage must be completed
  if (stageNumber > 1) {
    const prevStage = run.stages.find((s) => s.stage_number === stageNumber - 1);
    if (!prevStage || prevStage.status !== 'completed') {
      throw new AppError(409, `Stage ${stageNumber - 1} must be completed before starting stage ${stageNumber}`);
    }
  }

  const now = new Date().toISOString();

  db.prepare(`UPDATE pipeline_stages SET status = 'running', started_at = ? WHERE id = ?`).run(now, stage.id);
  db.prepare(`UPDATE pipeline_runs SET current_stage = ?, updated_at = ? WHERE id = ?`).run(stageNumber, now, runId);

  logger.info('Pipeline stage started', { run_id: runId, stage: stageNumber, stage_name: stage.stage_name });

  return getPipelineRunById(db, runId)!;
}

/**
 * Complete a stage with a verdict. Auto-advances the linked cycle phase (DD-12).
 * Stage 5 with approved verdict triggers completeCycle() (DD-14).
 * Rejected verdict marks stage as failed; cycle does NOT advance (DD-16).
 * Verifies: FR-038
 */
// FR-060: Feedback entry submitted with stage completion (DD-23)
export interface StageFeedbackInput {
  ticket_id?: string;
  agent_role: string;
  feedback_type: 'rejection' | 'finding' | 'suggestion' | 'approval';
  content: string;
}

export interface CompleteStageOptions {
  /** Injectable random function for testability in completeCycle (DD-14) */
  random?: () => number;
  /** FR-060: Optional feedback to store on stage completion (DD-23) */
  feedback?: StageFeedbackInput[];
}

export function completeStageAction(
  db: Database.Database,
  runId: string,
  stageNumber: number,
  verdict: string,
  opts: CompleteStageOptions = {}
): PipelineRun {
  if (verdict !== 'approved' && verdict !== 'rejected') {
    throw new AppError(400, `Invalid verdict: ${verdict}. Must be 'approved' or 'rejected'.`);
  }

  const run = getPipelineRunById(db, runId);
  if (!run) throw new AppError(404, `Pipeline run ${runId} not found`);

  const stage = run.stages.find((s) => s.stage_number === stageNumber);
  if (!stage) throw new AppError(404, `Stage ${stageNumber} not found in pipeline run ${runId}`);

  if (stage.status !== 'running') {
    throw new AppError(409, `Stage ${stageNumber} is not running (current status: ${stage.status})`);
  }

  const now = new Date().toISOString();

  // FR-060: Store feedback entries if provided (DD-23)
  if (opts.feedback && opts.feedback.length > 0) {
    for (const fb of opts.feedback) {
      createFeedback(db, run.cycle_id, {
        ticket_id: fb.ticket_id,
        agent_role: fb.agent_role,
        team: run.team,
        feedback_type: fb.feedback_type,
        content: fb.content,
      });
    }
    logger.info('Stored stage feedback', { run_id: runId, stage: stageNumber, feedback_count: opts.feedback.length });
  }

  if (verdict === 'rejected') {
    // DD-16: Rejected verdict does not advance cycle; stage marked as failed
    db.prepare(`UPDATE pipeline_stages SET status = 'failed', verdict = 'rejected', completed_at = ? WHERE id = ?`).run(now, stage.id);
    db.prepare(`UPDATE pipeline_runs SET updated_at = ? WHERE id = ?`).run(now, runId);

    logger.info('Pipeline stage rejected', { run_id: runId, stage: stageNumber, stage_name: stage.stage_name });

    return getPipelineRunById(db, runId)!;
  }

  // verdict === 'approved'
  db.prepare(`UPDATE pipeline_stages SET status = 'completed', verdict = 'approved', completed_at = ? WHERE id = ?`).run(now, stage.id);

  // Increment metrics counter (FR-043)
  pipelineStageCompletionsCounter.inc({ stage_name: stage.stage_name, verdict: 'approved' });

  if (stageNumber === 5) {
    // DD-14: Stage 5 completion triggers completeCycle() with all side-effects
    db.prepare(`UPDATE pipeline_runs SET status = 'completed', current_stage = 5, completed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, runId);

    const completeCycleOpts: CompleteCycleOptions = {};
    if (opts.random) completeCycleOpts.random = opts.random;

    completeCycle(db, run.cycle_id, completeCycleOpts);

    logger.info('Pipeline run completed', { run_id: runId, cycle_id: run.cycle_id });
  } else {
    // Auto-advance cycle phase (DD-12)
    const nextCyclePhase = STAGE_TO_CYCLE_PHASE[stageNumber];
    if (nextCyclePhase) {
      db.prepare(`UPDATE cycles SET status = ? WHERE id = ?`).run(nextCyclePhase, run.cycle_id);
    }

    db.prepare(`UPDATE pipeline_runs SET updated_at = ? WHERE id = ?`).run(now, runId);

    logger.info('Pipeline stage completed, cycle advanced', {
      run_id: runId,
      stage: stageNumber,
      stage_name: stage.stage_name,
      new_cycle_phase: nextCyclePhase,
    });
  }

  return getPipelineRunById(db, runId)!;
}
