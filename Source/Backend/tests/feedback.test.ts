// Verifies: FR-050, FR-051, FR-052, FR-053, FR-054, FR-055, FR-056, FR-057, FR-058, FR-059, FR-060, FR-061, FR-062
// Tests for Cycle Feedback, traceability fields on bugs/tickets/features, and pipeline stage feedback.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  createCycle,
  getCycleById,
  createTicket,
  updateTicket,
  completeCycle,
} from '../src/services/cycleService';
import { createBug, getBugById, listBugs } from '../src/services/bugService';
import { createFeatureRequest } from '../src/services/featureRequestService';
import { createFeature, listFeatures } from '../src/services/featureService';
import {
  createFeedback,
  listFeedback,
  getFeedbackById,
  VALID_FEEDBACK_TYPES,
  FEEDBACK_CONTENT_MAX_LENGTH,
} from '../src/services/feedbackService';
import { createPipelineRun, completeStageAction, startStage } from '../src/services/pipelineService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function seedTriagedBug(db: Database.Database, title = 'Critical Bug', severity = 'critical') {
  const bug = createBug(db, { title, description: 'desc', severity });
  db.prepare(`UPDATE bugs SET status = 'triaged' WHERE id = ?`).run(bug.id);
  return bug;
}

function seedApprovedFR(db: Database.Database, title = 'Approved Feature', priority = 'medium') {
  const fr = createFeatureRequest(db, { title, description: 'desc', priority });
  db.prepare(`UPDATE feature_requests SET status = 'approved' WHERE id = ?`).run(fr.id);
  return fr;
}

function seedCycleWithTickets(db: Database.Database) {
  seedApprovedFR(db);
  const cycle = createCycle(db);
  const ticket = createTicket(db, cycle.id, { title: 'Ticket 1', description: 'desc' });
  // Advance ticket to done
  updateTicket(db, cycle.id, ticket.id, { status: 'in_progress' });
  updateTicket(db, cycle.id, ticket.id, { status: 'code_review' });
  updateTicket(db, cycle.id, ticket.id, { status: 'testing' });
  updateTicket(db, cycle.id, ticket.id, { status: 'security_review' });
  updateTicket(db, cycle.id, ticket.id, { status: 'done' });
  return { cycle: getCycleById(db, cycle.id)!, ticket };
}

// --- FR-052: Schema migration tests ---
describe('FR-052: Schema migrations for traceability', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should create cycle_feedback table', () => {
    // Verifies: FR-052
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='cycle_feedback'`).all();
    expect(tables).toHaveLength(1);
  });

  it('should add related_work_item_id, related_work_item_type, related_cycle_id to bugs', () => {
    // Verifies: FR-052
    const cols = db.prepare(`PRAGMA table_info(bugs)`).all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('related_work_item_id');
    expect(colNames).toContain('related_work_item_type');
    expect(colNames).toContain('related_cycle_id');
  });

  it('should add work_item_ref, issue_description, considered_fixes to tickets', () => {
    // Verifies: FR-052
    const cols = db.prepare(`PRAGMA table_info(tickets)`).all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('work_item_ref');
    expect(colNames).toContain('issue_description');
    expect(colNames).toContain('considered_fixes');
  });

  it('should add cycle_id and traceability_report to features', () => {
    // Verifies: FR-052
    const cols = db.prepare(`PRAGMA table_info(features)`).all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('cycle_id');
    expect(colNames).toContain('traceability_report');
  });

  it('should be idempotent — running migrations twice succeeds', () => {
    // Verifies: FR-052
    expect(() => runMigrations(db)).not.toThrow();
  });
});

// --- FR-053: Feedback service tests ---
describe('FR-053: Feedback service', () => {
  let db: Database.Database;
  let cycleId: string;
  let ticketId: string;

  beforeEach(() => {
    db = createTestDb();
    seedApprovedFR(db);
    const cycle = createCycle(db);
    cycleId = cycle.id;
    const ticket = createTicket(db, cycleId, { title: 'Test Ticket', description: 'desc' });
    ticketId = ticket.id;
  });
  afterEach(() => { db.close(); });

  it('should create feedback with CFBK-XXXX ID', () => {
    // Verifies: FR-053
    const fb = createFeedback(db, cycleId, {
      agent_role: 'security-qa',
      feedback_type: 'finding',
      content: 'Found SQL injection risk',
    });
    expect(fb.id).toMatch(/^CFBK-\d{4}$/);
    expect(fb.cycle_id).toBe(cycleId);
    expect(fb.ticket_id).toBeNull();
    expect(fb.agent_role).toBe('security-qa');
    expect(fb.team).toBe('TheATeam');
    expect(fb.feedback_type).toBe('finding');
    expect(fb.content).toBe('Found SQL injection risk');
    expect(fb.created_at).toBeTruthy();
  });

  it('should create feedback with ticket_id', () => {
    // Verifies: FR-053
    const fb = createFeedback(db, cycleId, {
      ticket_id: ticketId,
      agent_role: 'qa-review',
      feedback_type: 'rejection',
      content: 'Test coverage insufficient',
    });
    expect(fb.ticket_id).toBe(ticketId);
  });

  it('should create feedback with custom team name', () => {
    // Verifies: FR-053
    const fb = createFeedback(db, cycleId, {
      agent_role: 'reviewer',
      team: 'TheBTeam',
      feedback_type: 'suggestion',
      content: 'Consider caching',
    });
    expect(fb.team).toBe('TheBTeam');
  });

  it('should reject invalid feedback_type', () => {
    // Verifies: FR-053
    expect(() => createFeedback(db, cycleId, {
      agent_role: 'test',
      feedback_type: 'invalid',
      content: 'test',
    })).toThrow(/Invalid feedback_type/);
  });

  it('should reject missing content', () => {
    // Verifies: FR-053
    expect(() => createFeedback(db, cycleId, {
      agent_role: 'test',
      feedback_type: 'finding',
      content: '',
    })).toThrow(/content is required/);
  });

  it('should reject missing agent_role', () => {
    // Verifies: FR-053
    expect(() => createFeedback(db, cycleId, {
      agent_role: '',
      feedback_type: 'finding',
      content: 'test',
    })).toThrow(/agent_role is required/);
  });

  it('should reject content exceeding max length', () => {
    // Verifies: FR-053
    const longContent = 'x'.repeat(FEEDBACK_CONTENT_MAX_LENGTH + 1);
    expect(() => createFeedback(db, cycleId, {
      agent_role: 'test',
      feedback_type: 'finding',
      content: longContent,
    })).toThrow(/content must be at most/);
  });

  it('should reject unknown cycle', () => {
    // Verifies: FR-053
    expect(() => createFeedback(db, 'CYCLE-9999', {
      agent_role: 'test',
      feedback_type: 'finding',
      content: 'test',
    })).toThrow(/Cycle CYCLE-9999 not found/);
  });

  it('should reject unknown ticket_id', () => {
    // Verifies: FR-053
    expect(() => createFeedback(db, cycleId, {
      ticket_id: 'TKT-9999',
      agent_role: 'test',
      feedback_type: 'finding',
      content: 'test',
    })).toThrow(/Ticket TKT-9999 not found in cycle/);
  });

  it('should list feedback with filters', () => {
    // Verifies: FR-053
    createFeedback(db, cycleId, { agent_role: 'security-qa', feedback_type: 'finding', content: 'finding 1' });
    createFeedback(db, cycleId, { agent_role: 'qa-review', feedback_type: 'rejection', content: 'rejection 1' });
    createFeedback(db, cycleId, { agent_role: 'security-qa', feedback_type: 'suggestion', content: 'suggestion 1' });

    const all = listFeedback(db, cycleId);
    expect(all).toHaveLength(3);

    const byRole = listFeedback(db, cycleId, { agent_role: 'security-qa' });
    expect(byRole).toHaveLength(2);

    const byType = listFeedback(db, cycleId, { feedback_type: 'rejection' });
    expect(byType).toHaveLength(1);
    expect(byType[0].agent_role).toBe('qa-review');
  });

  it('should get feedback by ID', () => {
    // Verifies: FR-053
    const fb = createFeedback(db, cycleId, { agent_role: 'test', feedback_type: 'approval', content: 'Looks good' });
    const retrieved = getFeedbackById(db, fb.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(fb.id);
  });

  it('should return null for unknown feedback ID', () => {
    // Verifies: FR-053
    expect(getFeedbackById(db, 'CFBK-9999')).toBeNull();
  });

  it('should generate sequential IDs', () => {
    // Verifies: FR-053
    const fb1 = createFeedback(db, cycleId, { agent_role: 'a', feedback_type: 'finding', content: 'c1' });
    const fb2 = createFeedback(db, cycleId, { agent_role: 'b', feedback_type: 'finding', content: 'c2' });
    expect(fb1.id).toBe('CFBK-0001');
    expect(fb2.id).toBe('CFBK-0002');
  });
});

// --- FR-054: Bug service traceability fields ---
describe('FR-054: Bug service related work item fields', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should create bug with related work item fields', () => {
    // Verifies: FR-054
    const bug = createBug(db, {
      title: 'Deploy failure',
      description: 'Broken deploy',
      severity: 'high',
      related_work_item_id: 'FR-0001',
      related_work_item_type: 'feature_request',
      related_cycle_id: 'CYCLE-0001',
    });
    expect(bug.related_work_item_id).toBe('FR-0001');
    expect(bug.related_work_item_type).toBe('feature_request');
    expect(bug.related_cycle_id).toBe('CYCLE-0001');
  });

  it('should create bug without related fields (backwards compat)', () => {
    // Verifies: FR-054
    const bug = createBug(db, { title: 'Manual bug', description: 'desc', severity: 'low' });
    expect(bug.related_work_item_id).toBeNull();
    expect(bug.related_work_item_type).toBeNull();
    expect(bug.related_cycle_id).toBeNull();
  });

  it('should return related fields in getBugById', () => {
    // Verifies: FR-054
    const bug = createBug(db, {
      title: 'Bug with ref',
      description: 'desc',
      severity: 'medium',
      related_work_item_id: 'BUG-0001',
      related_work_item_type: 'bug',
      related_cycle_id: 'CYCLE-0002',
    });
    const retrieved = getBugById(db, bug.id);
    expect(retrieved!.related_work_item_id).toBe('BUG-0001');
    expect(retrieved!.related_work_item_type).toBe('bug');
    expect(retrieved!.related_cycle_id).toBe('CYCLE-0002');
  });

  it('should return related fields in listBugs', () => {
    // Verifies: FR-054
    createBug(db, {
      title: 'Bug with ref',
      description: 'desc',
      severity: 'medium',
      related_work_item_id: 'FR-0005',
      related_work_item_type: 'feature_request',
      related_cycle_id: 'CYCLE-0003',
    });
    const bugs = listBugs(db);
    expect(bugs[0].related_work_item_id).toBe('FR-0005');
  });
});

// --- FR-055: Ticket traceability fields ---
describe('FR-055: Ticket work_item_ref and considered_fixes', () => {
  let db: Database.Database;
  let cycleId: string;

  beforeEach(() => {
    db = createTestDb();
    seedApprovedFR(db);
    const cycle = createCycle(db);
    cycleId = cycle.id;
  });
  afterEach(() => { db.close(); });

  it('should create ticket with work_item_ref and issue_description', () => {
    // Verifies: FR-055
    const ticket = createTicket(db, cycleId, {
      title: 'Fix auth',
      description: 'Auth is broken',
      work_item_ref: 'FR-0001',
      issue_description: 'JWT tokens not validated',
    });
    expect(ticket.work_item_ref).toBe('FR-0001');
    expect(ticket.issue_description).toBe('JWT tokens not validated');
  });

  it('should create ticket with considered_fixes JSON (DD-19)', () => {
    // Verifies: FR-055
    const fixes = [
      { description: 'Add JWT validation', rationale: 'Standard approach', selected: true },
      { description: 'Switch to session auth', rationale: 'Alternative', selected: false },
    ];
    const ticket = createTicket(db, cycleId, {
      title: 'Fix auth',
      description: 'desc',
      considered_fixes: fixes,
    });
    expect(ticket.considered_fixes).toEqual(fixes);
    expect(ticket.considered_fixes![0].selected).toBe(true);
    expect(ticket.considered_fixes![1].selected).toBe(false);
  });

  it('should round-trip considered_fixes through DB', () => {
    // Verifies: FR-055
    const fixes = [
      { description: 'Fix A', rationale: 'Why A', selected: true },
    ];
    const ticket = createTicket(db, cycleId, {
      title: 'Test round-trip',
      description: 'desc',
      considered_fixes: fixes,
    });
    const cycle = getCycleById(db, cycleId)!;
    const found = cycle.tickets.find(t => t.id === ticket.id)!;
    expect(found.considered_fixes).toEqual(fixes);
  });

  it('should create ticket without new fields (backwards compat)', () => {
    // Verifies: FR-055
    const ticket = createTicket(db, cycleId, { title: 'Simple', description: 'desc' });
    expect(ticket.work_item_ref).toBeNull();
    expect(ticket.issue_description).toBeNull();
    expect(ticket.considered_fixes).toBeNull();
  });
});

// --- FR-056: completeCycle traceability ---
describe('FR-056: completeCycle passes cycle_id and related fields', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should set cycle_id on Feature record (DD-22)', () => {
    // Verifies: FR-056
    const { cycle } = seedCycleWithTickets(db);
    completeCycle(db, cycle.id, { random: () => 0.5 }); // no deployment failure

    const features = listFeatures(db);
    expect(features).toHaveLength(1);
    expect(features[0].cycle_id).toBe(cycle.id);
  });

  it('should set related fields on deployment-failure bug (DD-18)', () => {
    // Verifies: FR-056
    const { cycle } = seedCycleWithTickets(db);
    completeCycle(db, cycle.id, { random: () => 0.05 }); // force deployment failure

    const bugs = listBugs(db, { status: 'reported' });
    const deployBug = bugs.find(b => b.title.includes('Deployment failure'));
    expect(deployBug).toBeDefined();
    expect(deployBug!.related_work_item_id).toBe(cycle.work_item_id);
    expect(deployBug!.related_work_item_type).toBe(cycle.work_item_type);
    expect(deployBug!.related_cycle_id).toBe(cycle.id);
  });
});

// --- FR-057: Feature service traceability ---
describe('FR-057: Feature service cycle_id and traceability_report', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should create feature with cycle_id and traceability_report', () => {
    // Verifies: FR-057
    const report = JSON.stringify({ frs_covered: 10, frs_total: 10 });
    const feature = createFeature(db, {
      title: 'New Feature',
      description: 'desc',
      source_work_item_id: 'FR-0001',
      cycle_id: 'CYCLE-0001',
      traceability_report: report,
    });
    expect(feature.cycle_id).toBe('CYCLE-0001');
    expect(feature.traceability_report).toBe(report);
  });

  it('should create feature without new fields (backwards compat)', () => {
    // Verifies: FR-057
    const feature = createFeature(db, {
      title: 'Simple',
      description: 'desc',
      source_work_item_id: 'FR-0001',
    });
    expect(feature.cycle_id).toBeNull();
    expect(feature.traceability_report).toBeNull();
  });

  it('should return new fields in listFeatures', () => {
    // Verifies: FR-057
    createFeature(db, {
      title: 'Feat',
      description: 'desc',
      source_work_item_id: 'FR-0001',
      cycle_id: 'CYCLE-0001',
    });
    const features = listFeatures(db);
    expect(features[0].cycle_id).toBe('CYCLE-0001');
  });
});

// --- FR-058: getCycleById hydration ---
describe('FR-058: getCycleById hydrates feedback[] and team_name', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('should hydrate empty feedback for cycle without feedback', () => {
    // Verifies: FR-058
    seedApprovedFR(db);
    const cycle = createCycle(db);
    const retrieved = getCycleById(db, cycle.id)!;
    expect(retrieved.feedback).toEqual([]);
  });

  it('should hydrate feedback entries', () => {
    // Verifies: FR-058
    seedApprovedFR(db);
    const cycle = createCycle(db);
    createFeedback(db, cycle.id, { agent_role: 'qa', feedback_type: 'finding', content: 'found issue' });
    createFeedback(db, cycle.id, { agent_role: 'sec', feedback_type: 'approval', content: 'looks good' });

    const retrieved = getCycleById(db, cycle.id)!;
    expect(retrieved.feedback).toHaveLength(2);
    expect(retrieved.feedback[0].agent_role).toBe('qa');
  });

  it('should hydrate team_name from pipeline_run', () => {
    // Verifies: FR-058
    seedApprovedFR(db);
    const cycle = createCycle(db);
    createPipelineRun(db, cycle.id);

    const retrieved = getCycleById(db, cycle.id)!;
    expect(retrieved.team_name).toBe('TheATeam');
  });

  it('should return null team_name for cycle without pipeline', () => {
    // Verifies: FR-058
    seedApprovedFR(db);
    // Create cycle without pipeline run
    const id = 'CYCLE-TEST';
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO cycles (id, work_item_id, work_item_type, status, created_at) VALUES (?, 'FR-0001', 'feature_request', 'spec_changes', ?)`).run(id, now);

    const retrieved = getCycleById(db, id)!;
    expect(retrieved.team_name).toBeNull();
  });
});

// --- FR-059: Feedback route tests ---
describe('FR-059: Feedback routes', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let cycleId: string;
  let ticketId: string;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    app = createApp();
    seedApprovedFR(db);
    const cycle = createCycle(db);
    cycleId = cycle.id;
    const ticket = createTicket(db, cycleId, { title: 'T1', description: 'd' });
    ticketId = ticket.id;
  });
  afterEach(() => { db.close(); });

  it('POST /api/cycles/:id/feedback creates feedback', async () => {
    // Verifies: FR-059
    const res = await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'security-qa', feedback_type: 'finding', content: 'XSS risk' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^CFBK-/);
    expect(res.body.cycle_id).toBe(cycleId);
    expect(res.body.agent_role).toBe('security-qa');
    expect(res.body.feedback_type).toBe('finding');
  });

  it('POST /api/cycles/:id/feedback with ticket_id', async () => {
    // Verifies: FR-059
    const res = await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ ticket_id: ticketId, agent_role: 'qa', feedback_type: 'rejection', content: 'Tests fail' });

    expect(res.status).toBe(201);
    expect(res.body.ticket_id).toBe(ticketId);
  });

  it('POST /api/cycles/:id/feedback returns 404 for unknown cycle', async () => {
    // Verifies: FR-059
    const res = await supertest(app)
      .post('/api/cycles/CYCLE-9999/feedback')
      .send({ agent_role: 'qa', feedback_type: 'finding', content: 'test' });

    expect(res.status).toBe(404);
  });

  it('POST /api/cycles/:id/feedback returns 400 for missing fields', async () => {
    // Verifies: FR-059
    const res = await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ feedback_type: 'finding' }); // missing agent_role and content

    expect(res.status).toBe(400);
  });

  it('GET /api/cycles/:id/feedback lists feedback', async () => {
    // Verifies: FR-059
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'qa', feedback_type: 'finding', content: 'issue 1' });
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'sec', feedback_type: 'approval', content: 'OK' });

    const res = await supertest(app).get(`/api/cycles/${cycleId}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /api/cycles/:id/feedback filters by agent_role', async () => {
    // Verifies: FR-059
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'qa', feedback_type: 'finding', content: 'a' });
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'sec', feedback_type: 'finding', content: 'b' });

    const res = await supertest(app).get(`/api/cycles/${cycleId}/feedback?agent_role=qa`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].agent_role).toBe('qa');
  });

  it('GET /api/cycles/:id/feedback filters by feedback_type', async () => {
    // Verifies: FR-059
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'qa', feedback_type: 'finding', content: 'a' });
    await supertest(app)
      .post(`/api/cycles/${cycleId}/feedback`)
      .send({ agent_role: 'qa', feedback_type: 'approval', content: 'b' });

    const res = await supertest(app).get(`/api/cycles/${cycleId}/feedback?feedback_type=approval`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].feedback_type).toBe('approval');
  });

  it('GET /api/cycles/:id/feedback returns 404 for unknown cycle', async () => {
    // Verifies: FR-059
    const res = await supertest(app).get('/api/cycles/CYCLE-9999/feedback');
    expect(res.status).toBe(404);
  });
});

// --- FR-060: Pipeline stage feedback ---
describe('FR-060: completeStageAction with feedback', () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  function setupPipeline(db: Database.Database) {
    seedApprovedFR(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);
    return { cycle, run };
  }

  it('should store feedback entries when completing a stage', () => {
    // Verifies: FR-060
    const { run } = setupPipeline(db);

    completeStageAction(db, run.id, 1, 'approved', {
      feedback: [
        { agent_role: 'requirements-reviewer', feedback_type: 'approval', content: 'Requirements look good' },
        { agent_role: 'requirements-reviewer', feedback_type: 'suggestion', content: 'Consider adding edge cases' },
      ],
    });

    const feedback = listFeedback(db, run.cycle_id);
    expect(feedback).toHaveLength(2);
    expect(feedback[0].team).toBe('TheATeam');
    expect(feedback[0].feedback_type).toBe('approval');
    expect(feedback[1].feedback_type).toBe('suggestion');
  });

  it('should store feedback even on rejected verdict', () => {
    // Verifies: FR-060
    const { run } = setupPipeline(db);

    completeStageAction(db, run.id, 1, 'rejected', {
      feedback: [
        { agent_role: 'requirements-reviewer', feedback_type: 'rejection', content: 'Missing requirements' },
      ],
    });

    const feedback = listFeedback(db, run.cycle_id);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].feedback_type).toBe('rejection');
  });

  it('should work without feedback (backwards compat)', () => {
    // Verifies: FR-060
    const { run } = setupPipeline(db);

    // No feedback in opts
    completeStageAction(db, run.id, 1, 'approved');

    const feedback = listFeedback(db, run.cycle_id);
    expect(feedback).toHaveLength(0);
  });

  it('should link feedback to correct cycle from pipeline run', () => {
    // Verifies: FR-060
    const { cycle, run } = setupPipeline(db);

    completeStageAction(db, run.id, 1, 'approved', {
      feedback: [
        { agent_role: 'test', feedback_type: 'finding', content: 'Found issue' },
      ],
    });

    const feedback = listFeedback(db, cycle.id);
    expect(feedback).toHaveLength(1);
    expect(feedback[0].cycle_id).toBe(cycle.id);
  });
});

// --- FR-050/FR-051: Shared types compile correctly ---
describe('FR-050/FR-051: Shared types', () => {
  it('should import CycleFeedback and ConsideredFix types from Shared/', () => {
    // Verifies: FR-050
    // TypeScript compilation validates these types exist
    const feedback: import('../../../Shared/types').CycleFeedback = {
      id: 'CFBK-0001',
      cycle_id: 'CYCLE-0001',
      ticket_id: null,
      agent_role: 'test',
      team: 'TheATeam',
      feedback_type: 'finding',
      content: 'test',
      created_at: new Date().toISOString(),
    };
    expect(feedback.id).toBe('CFBK-0001');

    const fix: import('../../../Shared/types').ConsideredFix = {
      description: 'Fix it',
      rationale: 'Because',
      selected: true,
    };
    expect(fix.selected).toBe(true);
  });

  it('should have CreateCycleFeedbackInput in api types', () => {
    // Verifies: FR-051
    const input: import('../../../Shared/api').CreateCycleFeedbackInput = {
      agent_role: 'test',
      feedback_type: 'finding',
      content: 'test content',
    };
    expect(input.agent_role).toBe('test');
  });
});

// --- FR-054 route-level: POST /api/bugs with related fields ---
describe('FR-054: POST /api/bugs with related fields (route)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    app = createApp();
  });
  afterEach(() => { db.close(); });

  it('should create bug with related_work_item_id via API', async () => {
    // Verifies: FR-054
    const res = await supertest(app)
      .post('/api/bugs')
      .send({
        title: 'Deploy failure',
        description: 'Broken deploy',
        severity: 'high',
        related_work_item_id: 'FR-0001',
        related_work_item_type: 'feature_request',
        related_cycle_id: 'CYCLE-0001',
      });

    expect(res.status).toBe(201);
    expect(res.body.related_work_item_id).toBe('FR-0001');
    expect(res.body.related_work_item_type).toBe('feature_request');
    expect(res.body.related_cycle_id).toBe('CYCLE-0001');
  });

  it('should return related fields in GET /api/bugs/:id', async () => {
    // Verifies: FR-054
    const createRes = await supertest(app)
      .post('/api/bugs')
      .send({
        title: 'Bug',
        description: 'desc',
        severity: 'medium',
        related_work_item_id: 'BUG-0001',
        related_work_item_type: 'bug',
        related_cycle_id: 'CYCLE-0002',
      });

    const getRes = await supertest(app).get(`/api/bugs/${createRes.body.id}`);
    expect(getRes.body.related_work_item_id).toBe('BUG-0001');
  });
});

// --- FR-055 route-level: POST /api/cycles/:id/tickets with new fields ---
describe('FR-055: POST /api/cycles/:id/tickets with traceability fields (route)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let cycleId: string;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    app = createApp();
    seedApprovedFR(db);
    const cycle = createCycle(db);
    cycleId = cycle.id;
  });
  afterEach(() => { db.close(); });

  it('should create ticket with work_item_ref and considered_fixes via API', async () => {
    // Verifies: FR-055
    const fixes = [
      { description: 'Fix A', rationale: 'Reason A', selected: true },
      { description: 'Fix B', rationale: 'Reason B', selected: false },
    ];
    const res = await supertest(app)
      .post(`/api/cycles/${cycleId}/tickets`)
      .send({
        title: 'Fix auth',
        description: 'Auth is broken',
        work_item_ref: 'FR-0001',
        issue_description: 'JWT validation missing',
        considered_fixes: fixes,
      });

    expect(res.status).toBe(201);
    expect(res.body.work_item_ref).toBe('FR-0001');
    expect(res.body.issue_description).toBe('JWT validation missing');
    expect(res.body.considered_fixes).toEqual(fixes);
  });
});

// --- FR-060 route-level: POST /api/pipeline-runs/:id/stages/:num/complete with feedback ---
describe('FR-060: Pipeline stage completion with feedback (route)', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    app = createApp();
  });
  afterEach(() => { db.close(); });

  it('should accept feedback array in stage completion', async () => {
    // Verifies: FR-060
    seedApprovedFR(db);
    const cycle = createCycle(db);
    const run = createPipelineRun(db, cycle.id);

    const res = await supertest(app)
      .post(`/api/pipeline-runs/${run.id}/stages/1/complete`)
      .send({
        verdict: 'approved',
        feedback: [
          { agent_role: 'reviewer', feedback_type: 'approval', content: 'Approved' },
        ],
      });

    expect(res.status).toBe(200);

    // Verify feedback was stored
    const fbRes = await supertest(app).get(`/api/cycles/${cycle.id}/feedback`);
    expect(fbRes.body.data).toHaveLength(1);
    expect(fbRes.body.data[0].agent_role).toBe('reviewer');
  });
});
