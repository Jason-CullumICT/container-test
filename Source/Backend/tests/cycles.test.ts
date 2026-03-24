// Verifies: FR-014, FR-015, FR-016, FR-031
// Tests for Development Cycle APIs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  listCycles,
  createCycle,
  getCycleById,
  updateCycle,
  createTicket,
  updateTicket,
  completeCycle,
  TICKET_TITLE_MAX_LENGTH,
  TICKET_DESCRIPTION_MAX_LENGTH,
} from '../src/services/cycleService';
import { createBug, updateBug } from '../src/services/bugService';
import { createFeatureRequest } from '../src/services/featureRequestService';

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
  // Manually set to approved
  db.prepare(`UPDATE feature_requests SET status = 'approved' WHERE id = ?`).run(fr.id);
  return fr;
}

// --- FR-014: GET /api/cycles ---
describe('FR-014: GET /api/cycles', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no cycles exist', async () => {
    // Verifies: FR-014
    const app = createApp();
    const res = await supertest(app).get('/api/cycles');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return cycles wrapped in {data: []}', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);
    createCycle(db);

    const app = createApp();
    const res = await supertest(app).get('/api/cycles');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// --- FR-014: POST /api/cycles ---
describe('FR-014: POST /api/cycles', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create cycle with triaged bug (bugs preferred over FRs)', async () => {
    // Verifies: FR-014
    seedApprovedFR(db, 'Approved Feature', 'critical');
    seedTriagedBug(db, 'Triaged Bug', 'low');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.work_item_type).toBe('bug');
  });

  it('should create cycle with highest-severity bug first', async () => {
    // Verifies: FR-014
    seedTriagedBug(db, 'Low Bug', 'low');
    seedTriagedBug(db, 'Critical Bug', 'critical');
    seedTriagedBug(db, 'High Bug', 'high');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.work_item_type).toBe('bug');
    const bug = db.prepare(`SELECT severity FROM bugs WHERE id = ?`).get(res.body.work_item_id) as { severity: string };
    expect(bug.severity).toBe('critical');
  });

  it('should create cycle with approved FR when no bugs', async () => {
    // Verifies: FR-014
    seedApprovedFR(db, 'Approved Feature');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.work_item_type).toBe('feature_request');
  });

  it('should create cycle with highest-priority FR', async () => {
    // Verifies: FR-014
    seedApprovedFR(db, 'Low Priority FR', 'low');
    seedApprovedFR(db, 'Critical Priority FR', 'critical');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    const fr = db.prepare(`SELECT priority FROM feature_requests WHERE id = ?`).get(res.body.work_item_id) as { priority: string };
    expect(fr.priority).toBe('critical');
  });

  it('should return 409 when active cycle already exists', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);
    createCycle(db);

    // Seed another bug since first is now in_development
    seedTriagedBug(db, 'Another Bug');

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('active');
  });

  it('should return 404 when no work items available', async () => {
    // Verifies: FR-014
    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should start cycle in spec_changes status', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);

    const app = createApp();
    const res = await supertest(app).post('/api/cycles');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('spec_changes');
    expect(res.body.id).toMatch(/^CYCLE-\d{4}$/);
  });

  it('should mark work item as in_development after cycle creation', () => {
    // Verifies: FR-014
    const bug = seedTriagedBug(db);
    createCycle(db);

    const updated = db.prepare(`SELECT status FROM bugs WHERE id = ?`).get(bug.id) as { status: string };
    expect(updated.status).toBe('in_development');
  });
});

// --- FR-014: GET /api/cycles/:id ---
describe('FR-014: GET /api/cycles/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return cycle with tickets array', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);
    const cycle = createCycle(db);
    createTicket(db, cycle.id, { title: 'Ticket 1', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).get(`/api/cycles/${cycle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cycle.id);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.tickets).toHaveLength(1);
  });

  it('should return 404 for unknown cycle id', async () => {
    // Verifies: FR-014
    const app = createApp();
    const res = await supertest(app).get('/api/cycles/CYCLE-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// --- FR-014: PATCH /api/cycles/:id ---
describe('FR-014: PATCH /api/cycles/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should allow linear transition spec_changes → ticket_breakdown', async () => {
    // Verifies: FR-014 (DD-4)
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}`)
      .send({ status: 'ticket_breakdown' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ticket_breakdown');
  });

  it('should enforce linear transitions (no skipping phases)', async () => {
    // Verifies: FR-014 (DD-4)
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    // Try to skip to implementation directly from spec_changes
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}`)
      .send({ status: 'implementation' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('ticket_breakdown');
  });

  it('should enforce all linear transitions up to smoke_test', () => {
    // Verifies: FR-014 (DD-4)
    const db2 = createTestDb();
    seedTriagedBug(db2, 'Bug A');
    const cycle = createCycle(db2);

    // spec_changes → ticket_breakdown
    updateCycle(db2, cycle.id, { status: 'ticket_breakdown' });
    const c1 = getCycleById(db2, cycle.id)!;
    expect(c1.status).toBe('ticket_breakdown');

    // ticket_breakdown → implementation
    updateCycle(db2, cycle.id, { status: 'implementation' });
    const c2 = getCycleById(db2, cycle.id)!;
    expect(c2.status).toBe('implementation');

    // implementation → review
    updateCycle(db2, cycle.id, { status: 'review' });
    const c3 = getCycleById(db2, cycle.id)!;
    expect(c3.status).toBe('review');

    // review → smoke_test
    updateCycle(db2, cycle.id, { status: 'smoke_test' });
    const c4 = getCycleById(db2, cycle.id)!;
    expect(c4.status).toBe('smoke_test');

    // smoke_test → complete must go via completeCycle (NEW-BLOCKER-1)
    expect(() => updateCycle(db2, cycle.id, { status: 'complete' })).toThrow(
      'Use POST /api/cycles/:id/complete to complete a cycle'
    );

    db2.close();
  });

  it('should return 400 when PATCH tries to set status=complete (NEW-BLOCKER-1)', async () => {
    // Verifies: FR-014 (NEW-BLOCKER-1)
    seedTriagedBug(db);
    const cycle = createCycle(db);
    // Advance to smoke_test
    updateCycle(db, cycle.id, { status: 'ticket_breakdown' });
    updateCycle(db, cycle.id, { status: 'implementation' });
    updateCycle(db, cycle.id, { status: 'review' });
    updateCycle(db, cycle.id, { status: 'smoke_test' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}`)
      .send({ status: 'complete' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('POST /api/cycles/:id/complete');
  });

  it('should allow updating spec_changes text', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}`)
      .send({ spec_changes: 'Updated spec text' });

    expect(res.status).toBe(200);
    expect(res.body.spec_changes).toBe('Updated spec text');
  });

  it('should return 400 for invalid status', async () => {
    // Verifies: FR-014
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown cycle id', async () => {
    // Verifies: FR-014
    const app = createApp();
    const res = await supertest(app)
      .patch('/api/cycles/CYCLE-9999')
      .send({ spec_changes: 'text' });

    expect(res.status).toBe(404);
  });
});

// --- FR-015: POST /api/cycles/:id/tickets ---
describe('FR-015: POST /api/cycles/:id/tickets', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a ticket with auto-generated TKT-XXXX id', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ title: 'Implement feature', description: 'Details here' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^TKT-\d{4}$/);
    expect(res.body.status).toBe('pending');
    expect(res.body.cycle_id).toBe(cycle.id);
  });

  it('should return 400 when title is missing', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ description: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when description is missing', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ title: 'No description' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });

  it('should return 404 when cycle does not exist', async () => {
    // Verifies: FR-015
    const app = createApp();
    const res = await supertest(app)
      .post('/api/cycles/CYCLE-9999/tickets')
      .send({ title: 'T', description: 'D' });

    expect(res.status).toBe(404);
  });

  it('should create ticket with optional assignee', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ title: 'Task', description: 'desc', assignee: 'agent-1' });

    expect(res.status).toBe(201);
    expect(res.body.assignee).toBe('agent-1');
  });
});

// --- FR-015: PATCH /api/cycles/:id/tickets/:ticketId ---
describe('FR-015: PATCH /api/cycles/:id/tickets/:ticketId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should allow valid ticket transition pending → in_progress', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'Ticket', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}/tickets/${ticket.id}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });

  it('should return 400 for invalid ticket state transition', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'Ticket', description: 'desc' });

    const app = createApp();
    // Skip from pending to done
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}/tickets/${ticket.id}`)
      .send({ status: 'done' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Invalid ticket status transition');
  });

  it('should enforce all ticket state transitions', () => {
    // Verifies: FR-015
    const db2 = createTestDb();
    seedTriagedBug(db2, 'Bug X');
    const cycle = createCycle(db2);
    const ticket = createTicket(db2, cycle.id, { title: 'Ticket', description: 'desc' });

    // pending → in_progress
    updateTicket(db2, cycle.id, ticket.id, { status: 'in_progress' });
    // in_progress → code_review
    updateTicket(db2, cycle.id, ticket.id, { status: 'code_review' });
    // code_review → testing
    updateTicket(db2, cycle.id, ticket.id, { status: 'testing' });
    // testing → security_review
    updateTicket(db2, cycle.id, ticket.id, { status: 'security_review' });
    // security_review → done
    updateTicket(db2, cycle.id, ticket.id, { status: 'done' });

    const done = db2.prepare(`SELECT status FROM tickets WHERE id = ?`).get(ticket.id) as { status: string };
    expect(done.status).toBe('done');

    db2.close();
  });

  it('should return 404 when cycle does not exist', async () => {
    // Verifies: FR-015
    const app = createApp();
    const res = await supertest(app)
      .patch('/api/cycles/CYCLE-9999/tickets/TKT-0001')
      .send({ status: 'in_progress' });

    expect(res.status).toBe(404);
  });

  it('should return 404 when ticket does not exist', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}/tickets/TKT-9999`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(404);
  });

  it('should update ticket title and description', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'Old', description: 'old desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/cycles/${cycle.id}/tickets/${ticket.id}`)
      .send({ title: 'New Title', description: 'new desc' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.description).toBe('new desc');
  });
});

// --- FR-016: POST /api/cycles/:id/complete ---
describe('FR-016: POST /api/cycles/:id/complete', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  function advanceTicketToDone(db: Database.Database, cycleId: string, ticketId: string) {
    updateTicket(db, cycleId, ticketId, { status: 'in_progress' });
    updateTicket(db, cycleId, ticketId, { status: 'code_review' });
    updateTicket(db, cycleId, ticketId, { status: 'testing' });
    updateTicket(db, cycleId, ticketId, { status: 'security_review' });
    updateTicket(db, cycleId, ticketId, { status: 'done' });
  }

  it('should complete cycle successfully when all tickets done', async () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T1', description: 'desc' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    const app = createApp();
    const res = await supertest(app).post(`/api/cycles/${cycle.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('complete');
    expect(res.body.completed_at).not.toBeNull();
  });

  it('should return 409 when not all tickets are done', async () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    createTicket(db, cycle.id, { title: 'Incomplete Ticket', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).post(`/api/cycles/${cycle.id}/complete`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('not done');
  });

  it('should create Feature record on completion', () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    // Always succeed (never fail deployment)
    completeCycle(db, cycle.id, { random: () => 0.5 });

    const features = db.prepare(`SELECT * FROM features`).all() as Array<{ source_work_item_id: string }>;
    expect(features).toHaveLength(1);
    expect(features[0].source_work_item_id).toBe(cycle.work_item_id);
  });

  it('should create Learning record on completion', () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    completeCycle(db, cycle.id, { random: () => 0.5 });

    const learnings = db.prepare(`SELECT * FROM learnings WHERE cycle_id = ?`).all(cycle.id) as Array<{ cycle_id: string }>;
    expect(learnings).toHaveLength(1);
  });

  it('should create BugReport on simulated deployment failure (10% chance)', () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    // Force deployment failure (random < 0.1)
    completeCycle(db, cycle.id, { random: () => 0.05 });

    const bugs = db.prepare(`SELECT * FROM bugs WHERE title LIKE '%Deployment failure%'`).all();
    expect(bugs).toHaveLength(1);
  });

  it('should NOT create BugReport on successful deployment', () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);

    // Force success (random >= 0.1)
    completeCycle(db, cycle.id, { random: () => 0.5 });

    const bugs = db.prepare(`SELECT * FROM bugs WHERE title LIKE '%Deployment failure%'`).all();
    expect(bugs).toHaveLength(0);
  });

  it('should mark bug as resolved on cycle completion', () => {
    // Verifies: FR-016
    const bug = seedTriagedBug(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);
    completeCycle(db, cycle.id, { random: () => 0.5 });

    const updatedBug = db.prepare(`SELECT status FROM bugs WHERE id = ?`).get(bug.id) as { status: string };
    expect(updatedBug.status).toBe('resolved');
  });

  it('should mark FR as completed on cycle completion', () => {
    // Verifies: FR-016
    const fr = seedApprovedFR(db);
    const cycle = createCycle(db);
    const ticket = createTicket(db, cycle.id, { title: 'T', description: 'd' });
    advanceTicketToDone(db, cycle.id, ticket.id);
    completeCycle(db, cycle.id, { random: () => 0.5 });

    const updatedFR = db.prepare(`SELECT status FROM feature_requests WHERE id = ?`).get(fr.id) as { status: string };
    expect(updatedFR.status).toBe('completed');
  });

  it('should return 404 for unknown cycle id', async () => {
    // Verifies: FR-016
    const app = createApp();
    const res = await supertest(app).post('/api/cycles/CYCLE-9999/complete');
    expect(res.status).toBe(404);
  });

  it('should allow completion with no tickets (edge case — all done vacuously)', () => {
    // Verifies: FR-016
    seedTriagedBug(db);
    const cycle = createCycle(db);
    // No tickets — all "done" (vacuously true)
    expect(() => completeCycle(db, cycle.id, { random: () => 0.5 })).not.toThrow();
  });
});

// --- DD-11: Ticket input length validation ---
describe('Ticket input length validation (DD-11, M-04)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 400 when ticket title exceeds max length', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const longTitle = 'A'.repeat(TICKET_TITLE_MAX_LENGTH + 1);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ title: longTitle, description: 'desc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when ticket description exceeds max length', async () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);
    const longDesc = 'A'.repeat(TICKET_DESCRIPTION_MAX_LENGTH + 1);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/cycles/${cycle.id}/tickets`)
      .send({ title: 'Ticket', description: longDesc });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });

  it('should accept ticket title and description at exactly max length', () => {
    // Verifies: FR-015
    seedTriagedBug(db);
    const cycle = createCycle(db);

    const ticket = createTicket(db, cycle.id, {
      title: 'A'.repeat(TICKET_TITLE_MAX_LENGTH),
      description: 'B'.repeat(TICKET_DESCRIPTION_MAX_LENGTH),
    });
    expect(ticket.title).toHaveLength(TICKET_TITLE_MAX_LENGTH);
    expect(ticket.description).toHaveLength(TICKET_DESCRIPTION_MAX_LENGTH);
  });
});
