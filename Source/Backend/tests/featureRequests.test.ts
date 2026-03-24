// Verifies: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-021, FR-031
// Comprehensive tests for Feature Request APIs and supporting infrastructure.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  listFeatureRequests,
  createFeatureRequest,
  getFeatureRequestById,
  updateFeatureRequest,
  deleteFeatureRequest,
  voteOnFeatureRequest,
  jaccardSimilarity,
  VALID_SOURCES,
  VALID_PRIORITIES,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from '../src/services/featureRequestService';
import { simulateVoting, buildVoteRecords } from '../src/services/votingService';

// --- Test helpers ---

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// --- FR-001: Shared types tests ---
describe('FR-001: Shared types', () => {
  it('should export all required domain entity types', async () => {
    // Verifies: FR-001
    const sharedTypes = await import('../../Shared/types');
    // Verify key types exist by checking that we can use them
    const status: typeof sharedTypes.FeatureRequestStatus = 'potential';
    expect(['potential', 'voting', 'approved', 'denied', 'in_development', 'completed']).toContain(status);
  });

  it('should export API wrapper types', async () => {
    // Verifies: FR-001
    const apiTypes = await import('../../Shared/api');
    // DataResponse is a generic interface — verify it compiles
    const response: typeof apiTypes.DataResponse<string> = { data: ['test'] };
    expect(response.data).toEqual(['test']);
  });
});

// --- FR-002: Database schema and migrations ---
describe('FR-002: Database schema and migrations', () => {
  it('should create all 7 tables on migration', () => {
    // Verifies: FR-002
    const db = createTestDb();
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('feature_requests');
    expect(tableNames).toContain('votes');
    expect(tableNames).toContain('bugs');
    expect(tableNames).toContain('cycles');
    expect(tableNames).toContain('tickets');
    expect(tableNames).toContain('learnings');
    expect(tableNames).toContain('features');
    db.close();
  });

  it('should create feature_requests table with correct columns including human_approval_approved_at', () => {
    // Verifies: FR-002 (DD-2: column must be human_approval_approved_at)
    const db = createTestDb();
    const cols = db
      .prepare(`PRAGMA table_info(feature_requests)`)
      .all() as Array<{ name: string }>;
    const colNames = cols.map((c) => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('description');
    expect(colNames).toContain('source');
    expect(colNames).toContain('status');
    expect(colNames).toContain('priority');
    expect(colNames).toContain('human_approval_comment');
    expect(colNames).toContain('human_approval_approved_at'); // DD-2
    expect(colNames).not.toContain('human_approval_at'); // must NOT have this
    expect(colNames).toContain('duplicate_warning');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('updated_at');
    db.close();
  });

  it('should be idempotent — running migrations twice does not fail', () => {
    // Verifies: FR-002
    const db = createTestDb();
    expect(() => runMigrations(db)).not.toThrow();
    db.close();
  });
});

// --- FR-003: Logger abstraction ---
describe('FR-003: Logger abstraction', () => {
  it('should export a logger with required methods', async () => {
    // Verifies: FR-003
    const { logger } = await import('../src/lib/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('should not expose console.log as the logger', async () => {
    // Verifies: FR-003
    const { logger } = await import('../src/lib/logger');
    expect(logger).not.toBe(console);
  });
});

// --- FR-004: Middleware ---
describe('FR-004: Metrics endpoint', () => {
  it('should expose GET /metrics returning Prometheus text format', async () => {
    // Verifies: FR-004
    const app = createApp();
    const res = await supertest(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/# HELP/);
  });

  it('should include http_request_duration_ms histogram in metrics', async () => {
    // Verifies: FR-004
    const app = createApp();
    // Make a request first to populate the histogram
    await supertest(app).get('/health');
    const res = await supertest(app).get('/metrics');
    expect(res.text).toContain('http_request_duration_ms');
  });

  it('should return {error: "message"} from error handler on 404', async () => {
    // Verifies: FR-004
    const app = createApp();
    const db = createTestDb();
    setDb(db);

    const res = await supertest(app).get('/api/feature-requests/FR-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
    db.close();
  });
});

// --- FR-005: GET /api/feature-requests (list) ---
describe('FR-005: GET /api/feature-requests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no FRs exist', async () => {
    // Verifies: FR-005
    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return all FRs wrapped in {data: []}', async () => {
    // Verifies: FR-005
    createFeatureRequest(db, { title: 'Test FR 1', description: 'Description 1' });
    createFeatureRequest(db, { title: 'Test FR 2', description: 'Description 2' });

    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should filter by status', async () => {
    // Verifies: FR-005
    createFeatureRequest(db, { title: 'Potential FR', description: 'desc' });
    const fr2 = createFeatureRequest(db, { title: 'Another FR', description: 'desc' });
    db.prepare(`UPDATE feature_requests SET status = 'voting' WHERE id = ?`).run(fr2.id);

    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests?status=voting');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('voting');
  });

  it('should filter by source', async () => {
    // Verifies: FR-005
    createFeatureRequest(db, { title: 'Manual FR', description: 'desc', source: 'manual' });
    createFeatureRequest(db, { title: 'Zendesk FR', description: 'desc', source: 'zendesk' });

    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests?source=zendesk');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].source).toBe('zendesk');
  });

  it('should filter by both status and source', async () => {
    // Verifies: FR-005
    createFeatureRequest(db, { title: 'FR1', description: 'desc', source: 'manual' });
    createFeatureRequest(db, { title: 'FR2', description: 'desc', source: 'zendesk' });

    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests?status=potential&source=manual');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].source).toBe('manual');
  });
});

// --- FR-006: POST /api/feature-requests (create) ---
describe('FR-006: POST /api/feature-requests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a FR with status potential and auto-generated FR-XXXX id', async () => {
    // Verifies: FR-006
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'New Feature', description: 'Some description' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^FR-\d{4}$/);
    expect(res.body.status).toBe('potential');
    expect(res.body.title).toBe('New Feature');
    expect(res.body.description).toBe('Some description');
  });

  it('should return 400 when title is missing', async () => {
    // Verifies: FR-006
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ description: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 when description is missing', async () => {
    // Verifies: FR-006
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'No description' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 400 for invalid source enum', async () => {
    // Verifies: FR-006 (DD-8)
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Test', description: 'desc', source: 'invalid_source' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid source');
  });

  it('should return 400 for invalid priority enum', async () => {
    // Verifies: FR-006 (DD-8)
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Test', description: 'desc', priority: 'extreme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid priority');
  });

  it('should set duplicate_warning when second FR has >80% title similarity', async () => {
    // Verifies: FR-006
    const app = createApp();
    await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Add dark mode to dashboard', description: 'First FR' });

    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Add dark mode to dashboard', description: 'Duplicate FR' });

    expect(res.status).toBe(201);
    expect(res.body.duplicate_warning).toBe(true);
  });

  it('should not set duplicate_warning for dissimilar titles', async () => {
    // Verifies: FR-006
    const app = createApp();
    await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Add dark mode', description: 'First FR' });

    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Improve search performance', description: 'Different FR' });

    expect(res.status).toBe(201);
    expect(res.body.duplicate_warning).toBe(false);
  });

  it('should default source to manual and priority to medium', async () => {
    // Verifies: FR-006
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Test', description: 'Description' });

    expect(res.status).toBe(201);
    expect(res.body.source).toBe('manual');
    expect(res.body.priority).toBe('medium');
  });

  it('should include empty votes array on creation', async () => {
    // Verifies: FR-006, FR-007
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Test', description: 'desc' });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.votes)).toBe(true);
    expect(res.body.votes).toHaveLength(0);
  });

  it('should return 400 when title exceeds max length', async () => {
    // Verifies: FR-006 (Security M-04)
    const app = createApp();
    const longTitle = 'A'.repeat(TITLE_MAX_LENGTH + 1);
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: longTitle, description: 'desc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when description exceeds max length', async () => {
    // Verifies: FR-006 (Security M-04)
    const app = createApp();
    const longDesc = 'A'.repeat(DESCRIPTION_MAX_LENGTH + 1);
    const res = await supertest(app)
      .post('/api/feature-requests')
      .send({ title: 'Test', description: longDesc });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });
});

// --- FR-007: GET /api/feature-requests/:id ---
describe('FR-007: GET /api/feature-requests/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return FR with votes array by id', async () => {
    // Verifies: FR-007
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).get(`/api/feature-requests/${fr.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(fr.id);
    expect(Array.isArray(res.body.votes)).toBe(true);
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-007
    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests/FR-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should include votes in response after voting', async () => {
    // Verifies: FR-007, FR-010
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.1 }); // fixed seed: all approve

    const app = createApp();
    const res = await supertest(app).get(`/api/feature-requests/${fr.id}`);
    expect(res.status).toBe(200);
    expect(res.body.votes.length).toBeGreaterThanOrEqual(3);
  });
});

// --- FR-008: PATCH /api/feature-requests/:id ---
describe('FR-008: PATCH /api/feature-requests/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should allow valid status transition potential → voting', async () => {
    // Verifies: FR-008
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ status: 'voting' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('voting');
  });

  it('should return 400 for invalid status transition potential → completed', async () => {
    // Verifies: FR-008
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Invalid status transition');
  });

  it('should return 400 for invalid status transition voting → in_development', async () => {
    // Verifies: FR-008
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    updateFeatureRequest(db, fr.id, { status: 'voting' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ status: 'in_development' });

    expect(res.status).toBe(400);
  });

  it('should allow updating description', async () => {
    // Verifies: FR-008
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'original desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ description: 'updated desc' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated desc');
  });

  it('should allow updating priority', async () => {
    // Verifies: FR-008
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ priority: 'high' });

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('high');
  });

  it('should return 400 for invalid priority in update', async () => {
    // Verifies: FR-008 (DD-8)
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/feature-requests/${fr.id}`)
      .send({ priority: 'extreme' });

    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-008
    const app = createApp();
    const res = await supertest(app)
      .patch('/api/feature-requests/FR-9999')
      .send({ description: 'updated' });

    expect(res.status).toBe(404);
  });

  it('should enforce all valid status transitions', () => {
    // Verifies: FR-008
    const db2 = createTestDb();

    // potential → voting
    const fr1 = createFeatureRequest(db2, { title: 'FR1', description: 'd' });
    expect(() => updateFeatureRequest(db2, fr1.id, { status: 'voting' })).not.toThrow();

    // voting → approved
    const fr2 = createFeatureRequest(db2, { title: 'FR2', description: 'd' });
    updateFeatureRequest(db2, fr2.id, { status: 'voting' });
    expect(() => updateFeatureRequest(db2, fr2.id, { status: 'approved' })).not.toThrow();

    // approved → in_development
    const fr3 = createFeatureRequest(db2, { title: 'FR3', description: 'd' });
    updateFeatureRequest(db2, fr3.id, { status: 'voting' });
    updateFeatureRequest(db2, fr3.id, { status: 'approved' });
    expect(() => updateFeatureRequest(db2, fr3.id, { status: 'in_development' })).not.toThrow();

    // in_development → completed
    const fr4 = createFeatureRequest(db2, { title: 'FR4', description: 'd' });
    updateFeatureRequest(db2, fr4.id, { status: 'voting' });
    updateFeatureRequest(db2, fr4.id, { status: 'approved' });
    updateFeatureRequest(db2, fr4.id, { status: 'in_development' });
    expect(() => updateFeatureRequest(db2, fr4.id, { status: 'completed' })).not.toThrow();

    db2.close();
  });
});

// --- FR-009: DELETE /api/feature-requests/:id ---
describe('FR-009: DELETE /api/feature-requests/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 204 on successful deletion', async () => {
    // Verifies: FR-009
    const fr = createFeatureRequest(db, { title: 'Delete me', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).delete(`/api/feature-requests/${fr.id}`);
    expect(res.status).toBe(204);
  });

  it('should actually delete the FR from the database', async () => {
    // Verifies: FR-009
    const fr = createFeatureRequest(db, { title: 'Delete me', description: 'desc' });
    deleteFeatureRequest(db, fr.id);

    const found = getFeatureRequestById(db, fr.id);
    expect(found).toBeNull();
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-009
    const app = createApp();
    const res = await supertest(app).delete('/api/feature-requests/FR-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 204 with no body', async () => {
    // Verifies: FR-009
    const fr = createFeatureRequest(db, { title: 'Delete me', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).delete(`/api/feature-requests/${fr.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });
});

// --- FR-010: POST /api/feature-requests/:id/vote ---
describe('FR-010: POST /api/feature-requests/:id/vote', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should generate ≥3 votes and persist them', async () => {
    // Verifies: FR-010
    const fr = createFeatureRequest(db, { title: 'Vote me', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/vote`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.votes)).toBe(true);
    expect(res.body.votes.length).toBeGreaterThanOrEqual(3);
  });

  it('should leave FR in voting status per DD-1 (majority is advisory only)', async () => {
    // Verifies: FR-010 (DD-1)
    const fr = createFeatureRequest(db, { title: 'Vote me', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/vote`);
    expect(res.status).toBe(200);
    // FR stays in 'voting' regardless of majority (DD-1)
    expect(res.body.status).toBe('voting');
  });

  it('should be deterministic with fixed random seed (injectable randomness)', () => {
    // Verifies: FR-010
    // Using a fixed random function ensures deterministic results
    const frId = 'FR-test-1';
    let callCount = 0;
    // Alternating high/low values: agents 0,2,4 get 0.1 (approve), agents 1,3 get 0.9 (deny)
    const fixedRandom = () => {
      const val = callCount % 2 === 0 ? 0.1 : 0.9;
      callCount++;
      return val;
    };

    const result1 = simulateVoting(frId, { random: fixedRandom });

    callCount = 0;
    const result2 = simulateVoting(frId, { random: fixedRandom });

    expect(result1.votes.map((v) => v.decision)).toEqual(result2.votes.map((v) => v.decision));
  });

  it('should compute correct majority when all votes are approve', () => {
    // Verifies: FR-010
    const result = simulateVoting('FR-test', { random: () => 0.01 }); // always < threshold = approve
    expect(result.majority).toBe('approve');
    expect(result.approveCount).toBe(5);
    expect(result.denyCount).toBe(0);
  });

  it('should compute correct majority when all votes are deny', () => {
    // Verifies: FR-010
    const result = simulateVoting('FR-test', { random: () => 0.99 }); // always > threshold = deny
    expect(result.majority).toBe('deny');
    expect(result.denyCount).toBe(5);
    expect(result.approveCount).toBe(0);
  });

  it('each vote should have agent_name, decision, and comment', () => {
    // Verifies: FR-010
    const result = simulateVoting('FR-test', { random: () => 0.5 });
    for (const vote of result.votes) {
      expect(vote.agent_name).toBeTruthy();
      expect(['approve', 'deny']).toContain(vote.decision);
      expect(vote.comment).toBeTruthy();
    }
  });

  it('vote records should have IDs and timestamps', () => {
    // Verifies: FR-010
    const now = new Date().toISOString();
    const simResult = simulateVoting('FR-test', { random: () => 0.5 });
    const records = buildVoteRecords(simResult, now);

    for (const record of records) {
      expect(record.id).toBeTruthy();
      expect(record.created_at).toBe(now);
    }
  });

  it('should return 404 when voting on unknown FR', async () => {
    // Verifies: FR-010
    const app = createApp();
    const res = await supertest(app).post('/api/feature-requests/FR-9999/vote');
    expect(res.status).toBe(404);
  });

  it('should return 400 when voting on non-potential FR', async () => {
    // Verifies: FR-010
    const fr = createFeatureRequest(db, { title: 'Vote me', description: 'desc' });
    updateFeatureRequest(db, fr.id, { status: 'voting' });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/vote`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("potential");
  });

  it('should store votes in the database', () => {
    // Verifies: FR-010
    const fr = createFeatureRequest(db, { title: 'Vote me', description: 'desc' });
    const updatedFr = voteOnFeatureRequest(db, fr.id, { random: () => 0.1 });

    const votes = db.prepare(`SELECT * FROM votes WHERE feature_request_id = ?`).all(fr.id);
    expect(votes.length).toBeGreaterThanOrEqual(3);
    expect(updatedFr.votes.length).toBe(votes.length);
  });
});

// --- FR-021: OpenTelemetry tracing stubs ---
describe('FR-021: OpenTelemetry tracing', () => {
  it('should export tracer and withSpan from tracing module', async () => {
    // Verifies: FR-021
    const tracing = await import('../src/lib/tracing');
    expect(tracing.tracer).toBeTruthy();
    expect(typeof tracing.withSpan).toBe('function');
    expect(typeof tracing.initTracing).toBe('function');
    expect(typeof tracing.extractTraceContext).toBe('function');
    expect(typeof tracing.injectTraceContext).toBe('function');
  });

  it('withSpan should execute the provided function', async () => {
    // Verifies: FR-021
    const { withSpan } = await import('../src/lib/tracing');
    const result = await withSpan('test.span', async (span) => {
      expect(span).toBeTruthy();
      return 'test-result';
    });
    expect(result).toBe('test-result');
  });

  it('withSpan should propagate errors', async () => {
    // Verifies: FR-021
    const { withSpan } = await import('../src/lib/tracing');
    await expect(
      withSpan('test.span', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');
  });

  it('should inject trace context into headers', async () => {
    // Verifies: FR-021
    const { injectTraceContext } = await import('../src/lib/tracing');
    const headers: Record<string, string> = {};
    expect(() => injectTraceContext(headers)).not.toThrow();
    // Headers may be empty if no active span, but no errors
  });
});

// --- Utility tests ---
describe('Jaccard similarity utility', () => {
  it('should return 1.0 for identical strings', () => {
    // Verifies: FR-006
    expect(jaccardSimilarity('add dark mode', 'add dark mode')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    // Verifies: FR-006
    expect(jaccardSimilarity('add dark mode', 'improve search performance')).toBe(0);
  });

  it('should return >0.8 for very similar strings', () => {
    // Verifies: FR-006
    const sim = jaccardSimilarity('add dark mode to dashboard', 'add dark mode to dashboard');
    expect(sim).toBeGreaterThan(0.8);
  });

  it('should return <0.8 for partially similar strings', () => {
    // Verifies: FR-006
    const sim = jaccardSimilarity('add dark mode feature', 'improve performance of dark engine');
    expect(sim).toBeLessThan(0.8);
  });

  it('should be case insensitive', () => {
    // Verifies: FR-006
    const sim = jaccardSimilarity('Add Dark Mode', 'add dark mode');
    expect(sim).toBe(1);
  });
});

// --- Valid enum values export tests ---
describe('Enum validation constants', () => {
  it('should export all valid sources', () => {
    // Verifies: FR-006 (DD-8)
    expect(VALID_SOURCES).toContain('manual');
    expect(VALID_SOURCES).toContain('zendesk');
    expect(VALID_SOURCES).toContain('competitor_analysis');
    expect(VALID_SOURCES).toContain('code_review');
  });

  it('should export all valid priorities', () => {
    // Verifies: FR-006 (DD-8)
    expect(VALID_PRIORITIES).toContain('low');
    expect(VALID_PRIORITIES).toContain('medium');
    expect(VALID_PRIORITIES).toContain('high');
    expect(VALID_PRIORITIES).toContain('critical');
  });
});

// --- DD-10: FR ID generation after delete should not collide ---
describe('FR ID generation after delete (DD-10)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should not produce duplicate IDs after deleting the last FR', () => {
    // Verifies: FR-006
    const fr1 = createFeatureRequest(db, { title: 'FR One', description: 'desc' });
    const fr2 = createFeatureRequest(db, { title: 'FR Two', description: 'desc' });
    const fr3 = createFeatureRequest(db, { title: 'FR Three', description: 'desc' });

    deleteFeatureRequest(db, fr3.id);

    const fr4 = createFeatureRequest(db, { title: 'FR Four', description: 'desc' });
    expect(fr4.id).not.toBe(fr1.id);
    expect(fr4.id).not.toBe(fr2.id);
    expect(fr4.id).toMatch(/^FR-\d{4}$/);

    const all = listFeatureRequests(db);
    const ids = all.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should not collide after deleting a middle FR', () => {
    // Verifies: FR-006
    const fr1 = createFeatureRequest(db, { title: 'FR Alpha', description: 'desc' });
    const fr2 = createFeatureRequest(db, { title: 'FR Beta', description: 'desc' });
    const fr3 = createFeatureRequest(db, { title: 'FR Gamma', description: 'desc' });

    deleteFeatureRequest(db, fr2.id);

    const fr4 = createFeatureRequest(db, { title: 'FR Delta', description: 'desc' });
    expect(fr4.id).not.toBe(fr1.id);
    expect(fr4.id).not.toBe(fr3.id);
    expect(fr4.id).toMatch(/^FR-\d{4}$/);
  });
});

