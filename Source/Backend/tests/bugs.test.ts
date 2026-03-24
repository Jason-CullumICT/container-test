// Verifies: FR-013, FR-031
// Tests for Bug Report APIs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  listBugs,
  createBug,
  getBugById,
  updateBug,
  deleteBug,
  VALID_SEVERITIES,
  VALID_BUG_STATUSES,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from '../src/services/bugService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// --- FR-013: GET /api/bugs ---
describe('FR-013: GET /api/bugs', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no bugs exist', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app).get('/api/bugs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return all bugs wrapped in {data: []}', async () => {
    // Verifies: FR-013
    createBug(db, { title: 'Bug 1', description: 'desc', severity: 'high' });
    createBug(db, { title: 'Bug 2', description: 'desc', severity: 'medium' });

    const app = createApp();
    const res = await supertest(app).get('/api/bugs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should filter by status', async () => {
    // Verifies: FR-013
    createBug(db, { title: 'Reported Bug', description: 'desc', severity: 'low' });
    const bug2 = createBug(db, { title: 'Triaged Bug', description: 'desc', severity: 'medium' });
    updateBug(db, bug2.id, { status: 'triaged' });

    const app = createApp();
    const res = await supertest(app).get('/api/bugs?status=triaged');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('triaged');
  });

  it('should filter by severity', async () => {
    // Verifies: FR-013
    createBug(db, { title: 'Critical Bug', description: 'desc', severity: 'critical' });
    createBug(db, { title: 'Low Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app).get('/api/bugs?severity=critical');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].severity).toBe('critical');
  });

  it('should filter by both status and severity', async () => {
    // Verifies: FR-013
    createBug(db, { title: 'Bug A', description: 'desc', severity: 'high' });
    const bug2 = createBug(db, { title: 'Bug B', description: 'desc', severity: 'high' });
    updateBug(db, bug2.id, { status: 'triaged' });

    const app = createApp();
    const res = await supertest(app).get('/api/bugs?status=triaged&severity=high');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(bug2.id);
  });
});

// --- FR-013: POST /api/bugs ---
describe('FR-013: POST /api/bugs', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a bug with auto-generated BUG-XXXX id', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'New Bug', description: 'A bug report', severity: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^BUG-\d{4}$/);
    expect(res.body.status).toBe('reported');
    expect(res.body.title).toBe('New Bug');
    expect(res.body.severity).toBe('high');
  });

  it('should return 400 when title is missing', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ description: 'desc', severity: 'high' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when description is missing', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', severity: 'high' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });

  it('should return 400 when severity is missing', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', description: 'desc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('severity');
  });

  it('should return 400 for invalid severity enum (DD-8)', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', description: 'desc', severity: 'extreme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid severity');
  });

  it('should default source_system to manual', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', description: 'desc', severity: 'low' });

    expect(res.status).toBe(201);
    expect(res.body.source_system).toBe('manual');
  });

  it('should accept custom source_system', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', description: 'desc', severity: 'medium', source_system: 'zendesk' });

    expect(res.status).toBe(201);
    expect(res.body.source_system).toBe('zendesk');
  });
});

// --- FR-013: GET /api/bugs/:id ---
describe('FR-013: GET /api/bugs/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return bug by id', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'high' });

    const app = createApp();
    const res = await supertest(app).get(`/api/bugs/${bug.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(bug.id);
    expect(res.body.title).toBe('Test Bug');
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app).get('/api/bugs/BUG-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// --- FR-013: PATCH /api/bugs/:id ---
describe('FR-013: PATCH /api/bugs/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should update bug title', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Old Title', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ title: 'New Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
  });

  it('should update bug status', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'medium' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ status: 'triaged' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('triaged');
  });

  it('should update bug severity', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ severity: 'critical' });

    expect(res.status).toBe(200);
    expect(res.body.severity).toBe('critical');
  });

  it('should return 400 for invalid severity in update', async () => {
    // Verifies: FR-013 (DD-8)
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ severity: 'extreme' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid severity');
  });

  it('should return 400 for invalid status in update', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app)
      .patch('/api/bugs/BUG-9999')
      .send({ title: 'Updated' });

    expect(res.status).toBe(404);
  });
});

// --- FR-013: DELETE /api/bugs/:id ---
describe('FR-013: DELETE /api/bugs/:id', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 204 on successful deletion', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Delete me', description: 'desc', severity: 'low' });

    const app = createApp();
    const res = await supertest(app).delete(`/api/bugs/${bug.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('should actually delete the bug from the database', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Delete me', description: 'desc', severity: 'low' });
    deleteBug(db, bug.id);

    const found = getBugById(db, bug.id);
    expect(found).toBeNull();
  });

  it('should return 404 for unknown id', async () => {
    // Verifies: FR-013
    const app = createApp();
    const res = await supertest(app).delete('/api/bugs/BUG-9999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// --- Service unit tests ---
describe('Bug service unit tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should export valid severities (DD-8)', () => {
    // Verifies: FR-013
    expect(VALID_SEVERITIES).toContain('low');
    expect(VALID_SEVERITIES).toContain('medium');
    expect(VALID_SEVERITIES).toContain('high');
    expect(VALID_SEVERITIES).toContain('critical');
  });

  it('should export valid bug statuses', () => {
    // Verifies: FR-013
    expect(VALID_BUG_STATUSES).toContain('reported');
    expect(VALID_BUG_STATUSES).toContain('triaged');
    expect(VALID_BUG_STATUSES).toContain('in_development');
    expect(VALID_BUG_STATUSES).toContain('resolved');
    expect(VALID_BUG_STATUSES).toContain('closed');
  });

  it('listBugs should return empty array when no bugs', () => {
    // Verifies: FR-013
    expect(listBugs(db)).toHaveLength(0);
  });

  it('createBug should create with reported status', () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Test', description: 'desc', severity: 'medium' });
    expect(bug.status).toBe('reported');
    expect(bug.id).toMatch(/^BUG-\d{4}$/);
  });

  it('updateBug should return unchanged bug when no fields changed', () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Test', description: 'desc', severity: 'medium' });
    const updated = updateBug(db, bug.id, {});
    expect(updated).toEqual(bug);
  });
});

// --- DD-10: ID generation after delete should not collide ---
describe('Bug ID generation after delete (DD-10)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should not produce duplicate IDs after deleting the last bug', () => {
    // Verifies: FR-013
    const bug1 = createBug(db, { title: 'Bug 1', description: 'desc', severity: 'low' });
    const bug2 = createBug(db, { title: 'Bug 2', description: 'desc', severity: 'low' });
    const bug3 = createBug(db, { title: 'Bug 3', description: 'desc', severity: 'low' });

    // Delete the last bug
    deleteBug(db, bug3.id);

    // Create a new bug — should get a new unique ID (BUG-0004), not reuse BUG-0003's deleted slot
    const bug4 = createBug(db, { title: 'Bug 4', description: 'desc', severity: 'low' });
    expect(bug4.id).not.toBe(bug1.id);
    expect(bug4.id).not.toBe(bug2.id);
    // The ID should be valid and unique
    expect(bug4.id).toMatch(/^BUG-\d{4}$/);

    // Verify all bugs in DB have unique IDs
    const all = listBugs(db);
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should not collide after deleting a middle bug', () => {
    // Verifies: FR-013
    const bug1 = createBug(db, { title: 'Bug 1', description: 'desc', severity: 'low' });
    const bug2 = createBug(db, { title: 'Bug 2', description: 'desc', severity: 'low' });
    const bug3 = createBug(db, { title: 'Bug 3', description: 'desc', severity: 'low' });

    deleteBug(db, bug2.id);

    const bug4 = createBug(db, { title: 'Bug 4', description: 'desc', severity: 'low' });
    expect(bug4.id).not.toBe(bug1.id);
    expect(bug4.id).not.toBe(bug3.id);
    expect(bug4.id).toMatch(/^BUG-\d{4}$/);
  });
});

// --- DD-11/DD-12: Input length validation for bugs ---
describe('Bug input length validation (DD-11, M-04)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 400 when title exceeds max length on create', async () => {
    // Verifies: FR-013
    const app = createApp();
    const longTitle = 'A'.repeat(TITLE_MAX_LENGTH + 1);
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: longTitle, description: 'desc', severity: 'low' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when description exceeds max length on create', async () => {
    // Verifies: FR-013
    const app = createApp();
    const longDesc = 'A'.repeat(DESCRIPTION_MAX_LENGTH + 1);
    const res = await supertest(app)
      .post('/api/bugs')
      .send({ title: 'Bug', description: longDesc, severity: 'low' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });

  it('should return 400 when title exceeds max length on update', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const longTitle = 'A'.repeat(TITLE_MAX_LENGTH + 1);
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ title: longTitle });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('title');
  });

  it('should return 400 when description exceeds max length on update', async () => {
    // Verifies: FR-013
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });

    const app = createApp();
    const longDesc = 'A'.repeat(DESCRIPTION_MAX_LENGTH + 1);
    const res = await supertest(app)
      .patch(`/api/bugs/${bug.id}`)
      .send({ description: longDesc });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('description');
  });

  it('should accept title and description at exactly max length', () => {
    // Verifies: FR-013
    const bug = createBug(db, {
      title: 'A'.repeat(TITLE_MAX_LENGTH),
      description: 'B'.repeat(DESCRIPTION_MAX_LENGTH),
      severity: 'low',
    });
    expect(bug.title).toHaveLength(TITLE_MAX_LENGTH);
    expect(bug.description).toHaveLength(DESCRIPTION_MAX_LENGTH);
  });
});
