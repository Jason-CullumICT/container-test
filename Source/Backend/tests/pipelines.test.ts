// Verifies: FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-041, FR-042, FR-043, FR-048
// Tests for Pipeline orchestration APIs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  createPipelineRun,
  listPipelineRuns,
  getPipelineRunById,
  getPipelineRunByCycleId,
  startStage,
  completeStageAction,
} from '../src/services/pipelineService';
import {
  createCycle,
  getCycleById,
  updateCycle,
  createTicket,
  updateTicket,
  completeCycle,
} from '../src/services/cycleService';
import { createBug, updateBug } from '../src/services/bugService';
import { createFeatureRequest } from '../src/services/featureRequestService';
import { getDashboardSummary } from '../src/services/dashboardService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function seedTriagedBug(db: Database.Database, title = 'Critical Bug', severity = 'critical') {
  const bug = createBug(db, { title, description: 'desc', severity });
  updateBug(db, bug.id, { status: 'triaged' });
  return bug;
}

function seedApprovedFR(db: Database.Database, title = 'Approved Feature', priority = 'medium') {
  const fr = createFeatureRequest(db, { title, description: 'desc', priority });
  db.prepare(`UPDATE feature_requests SET status = 'approved' WHERE id = ?`).run(fr.id);
  return fr;
}

function advanceTicketToDone(db: Database.Database, cycleId: string, ticketId: string) {
  updateTicket(db, cycleId, ticketId, { status: 'in_progress' });
  updateTicket(db, cycleId, ticketId, { status: 'code_review' });
  updateTicket(db, cycleId, ticketId, { status: 'testing' });
  updateTicket(db, cycleId, ticketId, { status: 'security_review' });
  updateTicket(db, cycleId, ticketId, { status: 'done' });
}

// --- FR-035: Schema migrations ---
describe('FR-035: Pipeline schema migrations', () => {
  it('should create pipeline_runs and pipeline_stages tables', () => {
    // Verifies: FR-035
    const db = createTestDb();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pipeline_runs', 'pipeline_stages')`).all() as Array<{ name: string }>;
    expect(tables.map(t => t.name).sort()).toEqual(['pipeline_runs', 'pipeline_stages']);
    db.close();
  });

  it('should add pipeline_run_id column to cycles table', () => {
    // Verifies: FR-035
    const db = createTestDb();
    const columns = db.prepare(`PRAGMA table_info(cycles)`).all() as Array<{ name: string }>;
    expect(columns.some(c => c.name === 'pipeline_run_id')).toBe(true);
    db.close();
  });

  it('should be idempotent (can run migrations twice)', () => {
    // Verifies: FR-035
    const db = createTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });
});

// --- FR-036: Pipeline service ---
describe('FR-036: pipelineService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a pipeline run with 5 stages', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    expect(run.id).toMatch(/^RUN-\d{4}$/);
    expect(run.cycle_id).toBe(cycle.id);
    expect(run.team).toBe('TheATeam');
    expect(run.status).toBe('running');
    expect(run.current_stage).toBe(1);
    expect(run.stages_total).toBe(5);
    expect(run.stages).toHaveLength(5);
    expect(run.completed_at).toBeNull();
  });

  it('should auto-start stage 1 on creation', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    expect(run.stages[0].status).toBe('running');
    expect(run.stages[0].started_at).not.toBeNull();
    for (let i = 1; i < 5; i++) {
      expect(run.stages[i].status).toBe('pending');
    }
  });

  it('should assign correct stage names and agents', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    expect(run.stages[0].stage_name).toBe('requirements');
    expect(run.stages[0].agent_ids).toEqual(['requirements-reviewer']);
    expect(run.stages[1].stage_name).toBe('api_contract');
    expect(run.stages[1].agent_ids).toEqual(['api-contract']);
    expect(run.stages[2].stage_name).toBe('implementation');
    expect(run.stages[2].agent_ids).toEqual(['backend-coder', 'frontend-coder']);
    expect(run.stages[3].stage_name).toBe('qa');
    expect(run.stages[3].agent_ids).toHaveLength(5);
    expect(run.stages[4].stage_name).toBe('integration');
    expect(run.stages[4].agent_ids).toEqual(['design-critic', 'integration-reviewer']);
  });

  it('should link pipeline run to cycle', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    createPipelineRun(db, cycle.id);

    const updatedCycle = getCycleById(db, cycle.id)!;
    expect(updatedCycle.pipeline_run_id).toMatch(/^RUN-\d{4}$/);
  });

  it('should list pipeline runs', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    createPipelineRun(db, cycle.id);

    const runs = listPipelineRuns(db);
    expect(runs).toHaveLength(1);
  });

  it('should filter pipeline runs by status', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    createPipelineRun(db, cycle.id);

    expect(listPipelineRuns(db, 'running')).toHaveLength(1);
    expect(listPipelineRuns(db, 'completed')).toHaveLength(0);
  });

  it('should get pipeline run by ID', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    const fetched = getPipelineRunById(db, run.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(run.id);
  });

  it('should return null for unknown pipeline run ID', () => {
    // Verifies: FR-036
    expect(getPipelineRunById(db, 'RUN-9999')).toBeNull();
  });

  it('should get pipeline run by cycle ID', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    const fetched = getPipelineRunByCycleId(db, cycle.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(run.id);
  });

  it('should enforce linear stage ordering on start (DD-15)', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Stage 2 cannot start before stage 1 is completed
    expect(() => startStage(db, run.id, 2)).toThrow(/must be completed/);
  });

  it('should allow starting a stage after previous is completed', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Complete stage 1
    completeStageAction(db, run.id, 1, 'approved');

    // Start stage 2
    const updated = startStage(db, run.id, 2);
    expect(updated.stages[1].status).toBe('running');
    expect(updated.current_stage).toBe(2);
  });

  it('should reject starting an already running stage', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Stage 1 is already running
    expect(() => startStage(db, run.id, 1)).toThrow(/already running/);
  });

  it('should throw 404 for unknown run ID on start', () => {
    // Verifies: FR-036
    expect(() => startStage(db, 'RUN-9999', 1)).toThrow(/not found/);
  });

  it('should throw 404 for unknown stage number', () => {
    // Verifies: FR-036
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    expect(() => startStage(db, run.id, 6)).toThrow(/not found/);
  });

  it('should generate sequential RUN IDs (DD-10 pattern)', () => {
    // Verifies: FR-036
    seedTriagedBug(db, 'Bug 1');
    const c1 = createCycle(db);
    const r1 = createPipelineRun(db, c1.id);

    // Complete first cycle so we can create another
    const t1 = createTicket(db, c1.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, c1.id, t1.id);
    completeCycle(db, c1.id, { random: () => 0.5 });

    seedTriagedBug(db, 'Bug 2');
    const c2 = createCycle(db);
    const r2 = createPipelineRun(db, c2.id);

    expect(r1.id).toBe('RUN-0001');
    expect(r2.id).toBe('RUN-0002');
  });
});

// --- FR-038: Stage completion auto-advances cycle ---
describe('FR-038: completeStageAction auto-advances cycle', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should advance cycle from spec_changes to ticket_breakdown on stage 1 completion', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    completeStageAction(db, run.id, 1, 'approved');

    const updated = getCycleById(db, cycle.id)!;
    expect(updated.status).toBe('ticket_breakdown');
  });

  it('should advance cycle through all phases with stage completions', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Stage 1 → ticket_breakdown
    completeStageAction(db, run.id, 1, 'approved');
    expect(getCycleById(db, cycle.id)!.status).toBe('ticket_breakdown');

    // Stage 2 → implementation
    startStage(db, run.id, 2);
    completeStageAction(db, run.id, 2, 'approved');
    expect(getCycleById(db, cycle.id)!.status).toBe('implementation');

    // Stage 3 → review
    startStage(db, run.id, 3);
    completeStageAction(db, run.id, 3, 'approved');
    expect(getCycleById(db, cycle.id)!.status).toBe('review');

    // Stage 4 → smoke_test
    startStage(db, run.id, 4);
    completeStageAction(db, run.id, 4, 'approved');
    expect(getCycleById(db, cycle.id)!.status).toBe('smoke_test');
  });

  it('should trigger completeCycle on stage 5 completion (DD-14)', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    // Advance all stages
    completeStageAction(db, run.id, 1, 'approved');
    startStage(db, run.id, 2);
    completeStageAction(db, run.id, 2, 'approved');
    startStage(db, run.id, 3);
    completeStageAction(db, run.id, 3, 'approved');
    startStage(db, run.id, 4);
    completeStageAction(db, run.id, 4, 'approved');
    startStage(db, run.id, 5);
    completeStageAction(db, run.id, 5, 'approved', { random: () => 0.5 });

    // Cycle should be complete
    const completedCycle = getCycleById(db, cycle.id)!;
    expect(completedCycle.status).toBe('complete');
    expect(completedCycle.completed_at).not.toBeNull();

    // Pipeline run should be completed
    const completedRun = getPipelineRunById(db, run.id)!;
    expect(completedRun.status).toBe('completed');
    expect(completedRun.completed_at).not.toBeNull();
  });

  it('should create Feature and Learning on stage 5 completion', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    // Complete all stages
    completeStageAction(db, run.id, 1, 'approved');
    startStage(db, run.id, 2);
    completeStageAction(db, run.id, 2, 'approved');
    startStage(db, run.id, 3);
    completeStageAction(db, run.id, 3, 'approved');
    startStage(db, run.id, 4);
    completeStageAction(db, run.id, 4, 'approved');
    startStage(db, run.id, 5);
    completeStageAction(db, run.id, 5, 'approved', { random: () => 0.5 });

    const features = db.prepare(`SELECT * FROM features`).all();
    expect(features).toHaveLength(1);
    const learnings = db.prepare(`SELECT * FROM learnings`).all();
    expect(learnings).toHaveLength(1);
  });

  it('should not advance cycle on rejected verdict (DD-16)', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    completeStageAction(db, run.id, 1, 'rejected');

    // Cycle should still be in spec_changes
    expect(getCycleById(db, cycle.id)!.status).toBe('spec_changes');

    // Stage should be marked as failed
    const updatedRun = getPipelineRunById(db, run.id)!;
    expect(updatedRun.stages[0].status).toBe('failed');
    expect(updatedRun.stages[0].verdict).toBe('rejected');

    // Pipeline run should still be running
    expect(updatedRun.status).toBe('running');
  });

  it('should allow restarting a failed stage after rejection', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Reject stage 1
    completeStageAction(db, run.id, 1, 'rejected');

    // Restart stage 1 (failed → running)
    const restarted = startStage(db, run.id, 1);
    expect(restarted.stages[0].status).toBe('running');
  });

  it('should reject invalid verdict', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    expect(() => completeStageAction(db, run.id, 1, 'invalid')).toThrow(/Invalid verdict/);
  });

  it('should reject completing a stage that is not running', () => {
    // Verifies: FR-038
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    // Stage 2 is pending, not running
    expect(() => completeStageAction(db, run.id, 2, 'approved')).toThrow(/not running/);
  });
});

// --- FR-037: POST /api/cycles creates pipeline run ---
describe('FR-037: POST /api/cycles creates pipeline run', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create cycle with pipeline_run_id set', async () => {
    // Verifies: FR-037
    seedTriagedBug(db);

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.pipeline_run_id).toMatch(/^RUN-\d{4}$/);
  });

  it('should have pipeline run with 5 stages after cycle creation', async () => {
    // Verifies: FR-037
    seedTriagedBug(db);

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);

    const run = getPipelineRunById(db, res.body.pipeline_run_id)!;
    expect(run).not.toBeNull();
    expect(run.stages).toHaveLength(5);
    expect(run.stages[0].status).toBe('running'); // stage 1 auto-started
  });
});

// --- FR-039: Block manual PATCH status on pipeline-linked cycles ---
describe('FR-039: Block manual PATCH status on pipeline-linked cycles', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 409 when trying to PATCH status on pipeline-linked cycle', async () => {
    // Verifies: FR-039
    seedTriagedBug(db);

    const app = createApp();
    const createRes = await supertest(app).post('/api/cycles');
    expect(createRes.status).toBe(201);
    const cycleId = createRes.body.id;

    const patchRes = await supertest(app)
      .patch(`/api/cycles/${cycleId}`)
      .send({ status: 'ticket_breakdown' });

    expect(patchRes.status).toBe(409);
    expect(patchRes.body.error).toContain('orchestrated via pipeline');
  });

  it('should allow PATCH spec_changes on pipeline-linked cycle', async () => {
    // Verifies: FR-039
    seedTriagedBug(db);

    const app = createApp();
    const createRes = await supertest(app).post('/api/cycles');
    expect(createRes.status).toBe(201);
    const cycleId = createRes.body.id;

    const patchRes = await supertest(app)
      .patch(`/api/cycles/${cycleId}`)
      .send({ spec_changes: 'Updated spec text' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.spec_changes).toBe('Updated spec text');
  });

  it('should still allow PATCH status on non-pipeline cycles (DD-13)', () => {
    // Verifies: FR-039
    seedTriagedBug(db);
    // Create cycle through service directly (no pipeline)
    const cycle = createCycle(db);
    expect(cycle.pipeline_run_id).toBeNull();

    // Should allow manual status transitions
    const updated = updateCycle(db, cycle.id, { status: 'ticket_breakdown' });
    expect(updated.status).toBe('ticket_breakdown');
  });
});

// --- FR-040: Pipeline routes ---
describe('FR-040: GET /api/pipeline-runs', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no pipeline runs exist', async () => {
    // Verifies: FR-040
    const app = createApp();
    const res = await supertest(app).get('/api/pipeline-runs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveLength(0);
  });

  it('should return pipeline runs wrapped in {data: []}', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    await supertest(app).post('/api/cycles');

    const res = await supertest(app).get('/api/pipeline-runs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toMatch(/^RUN-\d{4}$/);
  });

  it('should filter by status', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    await supertest(app).post('/api/cycles');

    const running = await supertest(app).get('/api/pipeline-runs?status=running');
    expect(running.body.data).toHaveLength(1);

    const completed = await supertest(app).get('/api/pipeline-runs?status=completed');
    expect(completed.body.data).toHaveLength(0);
  });
});

describe('FR-040: GET /api/pipeline-runs/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return pipeline run with stages', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app).get(`/api/pipeline-runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(runId);
    expect(res.body.stages).toHaveLength(5);
  });

  it('should return 404 for unknown run ID', async () => {
    // Verifies: FR-040
    const app = createApp();
    const res = await supertest(app).get('/api/pipeline-runs/RUN-9999');
    expect(res.status).toBe(404);
  });
});

describe('FR-040: POST /api/pipeline-runs/:id/stages/:stageNumber/start', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should start a stage after previous is completed', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    // Complete stage 1
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'approved' });

    // Start stage 2
    const res = await supertest(app).post(`/api/pipeline-runs/${runId}/stages/2/start`);
    expect(res.status).toBe(200);
    expect(res.body.stages[1].status).toBe('running');
  });

  it('should return 409 when previous stage not completed', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app).post(`/api/pipeline-runs/${runId}/stages/2/start`);
    expect(res.status).toBe(409);
  });

  it('should return 400 for invalid stage number', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app).post(`/api/pipeline-runs/${runId}/stages/6/start`);
    expect(res.status).toBe(400);
  });
});

describe('FR-040: POST /api/pipeline-runs/:id/stages/:stageNumber/complete', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should complete a stage with approved verdict', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.stages[0].status).toBe('completed');
    expect(res.body.stages[0].verdict).toBe('approved');
  });

  it('should return 400 when verdict is missing', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid verdict', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const runId = cycleRes.body.pipeline_run_id;

    const res = await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'maybe' });

    expect(res.status).toBe(400);
  });
});

describe('FR-040: GET /api/cycles/:id/pipeline', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return pipeline run for a cycle', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);

    const app = createApp();
    const cycleRes = await supertest(app).post('/api/cycles');
    const cycleId = cycleRes.body.id;

    const res = await supertest(app).get(`/api/cycles/${cycleId}/pipeline`);
    expect(res.status).toBe(200);
    expect(res.body.cycle_id).toBe(cycleId);
    expect(res.body.stages).toHaveLength(5);
  });

  it('should return 404 for cycle without pipeline', async () => {
    // Verifies: FR-040
    seedTriagedBug(db);
    // Create cycle without pipeline (service-level)
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app).get(`/api/cycles/${cycle.id}/pipeline`);
    expect(res.status).toBe(404);
  });

  it('should return 404 for unknown cycle', async () => {
    // Verifies: FR-040
    const app = createApp();
    const res = await supertest(app).get('/api/cycles/CYCLE-9999/pipeline');
    expect(res.status).toBe(404);
  });
});

// --- FR-041: Hydrate pipeline_run in cycle GET ---
describe('FR-041: GET /api/cycles/:id hydrates pipeline_run', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should include pipeline_run in cycle GET response when linked', async () => {
    // Verifies: FR-041
    seedTriagedBug(db);

    const app = createApp();
    const createRes = await supertest(app).post('/api/cycles');
    const cycleId = createRes.body.id;

    const getRes = await supertest(app).get(`/api/cycles/${cycleId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.pipeline_run_id).toMatch(/^RUN-\d{4}$/);
    expect(getRes.body.pipeline_run).toBeDefined();
    expect(getRes.body.pipeline_run.stages).toHaveLength(5);
  });

  it('should not include pipeline_run for non-pipeline cycles', async () => {
    // Verifies: FR-041
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app).get(`/api/cycles/${cycle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.pipeline_run_id).toBeNull();
    expect(res.body.pipeline_run).toBeUndefined();
  });
});

// --- FR-042: Dashboard pipeline info ---
describe('FR-042: Dashboard summary includes pipeline info', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should include pipeline fields in active_cycle when pipeline is linked', async () => {
    // Verifies: FR-042
    seedTriagedBug(db);

    const app = createApp();
    await supertest(app).post('/api/cycles');

    const summary = getDashboardSummary(db);
    expect(summary.active_cycle).not.toBeNull();
    expect(summary.active_cycle!.pipeline_run_id).toMatch(/^RUN-\d{4}$/);
    expect(summary.active_cycle!.pipeline_stage).toBe(1);
    expect(summary.active_cycle!.pipeline_status).toBe('running');
  });

  it('should have null pipeline fields when no pipeline is linked', () => {
    // Verifies: FR-042
    seedTriagedBug(db);
    createCycle(db); // service-level, no pipeline

    const summary = getDashboardSummary(db);
    expect(summary.active_cycle).not.toBeNull();
    expect(summary.active_cycle!.pipeline_run_id).toBeNull();
    expect(summary.active_cycle!.pipeline_stage).toBeNull();
    expect(summary.active_cycle!.pipeline_status).toBeNull();
  });

  it('should have null active_cycle when no active cycle exists', () => {
    // Verifies: FR-042
    const summary = getDashboardSummary(db);
    expect(summary.active_cycle).toBeNull();
  });
});

// --- FR-033: Shared types compile ---
describe('FR-033: Shared types', () => {
  it('should import PipelineRun and PipelineStage types', () => {
    // Verifies: FR-033
    // Type-level check: these imports would fail at compile time if types are missing
    const run: import('../../../Shared/types').PipelineRun = {
      id: 'RUN-0001',
      cycle_id: 'CYCLE-0001',
      team: 'TheATeam',
      status: 'running',
      current_stage: 1,
      stages_total: 5,
      stages: [],
      created_at: '',
      updated_at: '',
      completed_at: null,
    };
    expect(run.id).toBe('RUN-0001');
  });

  it('should have pipeline_run_id on DevelopmentCycle type', () => {
    // Verifies: FR-033
    const cycle: import('../../../Shared/types').DevelopmentCycle = {
      id: 'CYCLE-0001',
      work_item_id: 'BUG-0001',
      work_item_type: 'bug',
      status: 'spec_changes',
      spec_changes: null,
      tickets: [],
      pipeline_run_id: null,
      created_at: '',
      completed_at: null,
    };
    expect(cycle.pipeline_run_id).toBeNull();
  });
});

// --- Full end-to-end pipeline progression ---
describe('FR-048: Full pipeline E2E progression', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should complete full pipeline from cycle creation to completion', async () => {
    // Verifies: FR-048
    const bug = seedTriagedBug(db);

    const app = createApp();

    // Create cycle (auto-creates pipeline, auto-starts stage 1)
    const createRes = await supertest(app).post('/api/cycles');
    expect(createRes.status).toBe(201);
    const cycleId = createRes.body.id;
    const runId = createRes.body.pipeline_run_id;

    // Create a ticket and advance to done (required for completion)
    const ticketRes = await supertest(app)
      .post(`/api/cycles/${cycleId}/tickets`)
      .send({ title: 'Fix bug', description: 'Details' });
    const ticketId = ticketRes.body.id;
    advanceTicketToDone(db, cycleId, ticketId);

    // Stage 1: requirements → approve
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'approved' });

    // Stage 2: api_contract → start & approve
    await supertest(app).post(`/api/pipeline-runs/${runId}/stages/2/start`);
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/2/complete`)
      .send({ verdict: 'approved' });

    // Stage 3: implementation → start & approve
    await supertest(app).post(`/api/pipeline-runs/${runId}/stages/3/start`);
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/3/complete`)
      .send({ verdict: 'approved' });

    // Stage 4: qa → start & approve
    await supertest(app).post(`/api/pipeline-runs/${runId}/stages/4/start`);
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/4/complete`)
      .send({ verdict: 'approved' });

    // Stage 5: integration → start & approve (triggers completeCycle)
    await supertest(app).post(`/api/pipeline-runs/${runId}/stages/5/start`);
    // Use service-level for injectable random
    completeStageAction(db, runId, 5, 'approved', { random: () => 0.5 });

    // Verify final state
    const finalCycle = getCycleById(db, cycleId)!;
    expect(finalCycle.status).toBe('complete');

    const finalRun = getPipelineRunById(db, runId)!;
    expect(finalRun.status).toBe('completed');
    expect(finalRun.stages.every(s => s.status === 'completed')).toBe(true);

    // Bug should be resolved
    const updatedBug = db.prepare(`SELECT status FROM bugs WHERE id = ?`).get(bug.id) as { status: string };
    expect(updatedBug.status).toBe('resolved');
  });

  it('should handle pipeline with rejection and retry', async () => {
    // Verifies: FR-048
    seedTriagedBug(db);

    const app = createApp();
    const createRes = await supertest(app).post('/api/cycles');
    const runId = createRes.body.pipeline_run_id;
    const cycleId = createRes.body.id;

    // Reject stage 1
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'rejected' });

    // Cycle should still be in spec_changes
    expect(getCycleById(db, cycleId)!.status).toBe('spec_changes');

    // Restart stage 1
    await supertest(app).post(`/api/pipeline-runs/${runId}/stages/1/start`);

    // Now approve
    await supertest(app)
      .post(`/api/pipeline-runs/${runId}/stages/1/complete`)
      .send({ verdict: 'approved' });

    // Cycle should have advanced
    expect(getCycleById(db, cycleId)!.status).toBe('ticket_breakdown');
  });

  it('should use bug priority ordering (bugs before FRs) for pipeline-orchestrated cycle', async () => {
    // Verifies: FR-048
    seedApprovedFR(db, 'Critical Feature', 'critical');
    seedTriagedBug(db, 'Low Bug', 'low');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.work_item_type).toBe('bug');
    expect(res.body.pipeline_run_id).toMatch(/^RUN-/);
  });
});
