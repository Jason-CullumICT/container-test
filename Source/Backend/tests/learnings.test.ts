// Verifies: FR-019, FR-031
// Tests for Learnings API endpoints.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  listLearnings,
  createLearning,
  VALID_LEARNING_CATEGORIES,
  CONTENT_MAX_LENGTH,
} from '../src/services/learningService';
import { createBug, updateBug } from '../src/services/bugService';
import { createCycle } from '../src/services/cycleService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function seedCycle(db: Database.Database) {
  const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'high' });
  updateBug(db, bug.id, { status: 'triaged' });
  return createCycle(db);
}

// --- FR-019: GET /api/learnings ---
describe('FR-019: GET /api/learnings', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no learnings exist', async () => {
    // Verifies: FR-019
    const app = createApp();
    const res = await supertest(app).get('/api/learnings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return all learnings in {data: []}', async () => {
    // Verifies: FR-019
    const cycle = seedCycle(db);
    createLearning(db, { cycle_id: cycle.id, content: 'Learning 1', category: 'process' });
    createLearning(db, { cycle_id: cycle.id, content: 'Learning 2', category: 'technical' });

    const app = createApp();
    const res = await supertest(app).get('/api/learnings');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should filter by category', async () => {
    // Verifies: FR-019
    const cycle = seedCycle(db);
    createLearning(db, { cycle_id: cycle.id, content: 'Process learning', category: 'process' });
    createLearning(db, { cycle_id: cycle.id, content: 'Tech learning', category: 'technical' });

    const app = createApp();
    const res = await supertest(app).get('/api/learnings?category=process');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('process');
  });

  it('should filter by cycle_id', async () => {
    // Verifies: FR-019
    const cycle1 = seedCycle(db);
    createLearning(db, { cycle_id: cycle1.id, content: 'L1', category: 'process' });

    // Create a second cycle with its own learning
    const bug2 = createBug(db, { title: 'Bug2', description: 'desc', severity: 'low' });
    updateBug(db, bug2.id, { status: 'triaged' });
    // Complete cycle1 first so we can create cycle2
    db.prepare(`UPDATE cycles SET status = 'complete' WHERE id = ?`).run(cycle1.id);
    const cycle2 = createCycle(db);
    createLearning(db, { cycle_id: cycle2.id, content: 'L2', category: 'domain' });

    const app = createApp();
    const res = await supertest(app).get(`/api/learnings?cycle_id=${cycle1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].cycle_id).toBe(cycle1.id);
  });

  it('should filter by both category and cycle_id', async () => {
    // Verifies: FR-019
    const cycle = seedCycle(db);
    createLearning(db, { cycle_id: cycle.id, content: 'Process', category: 'process' });
    createLearning(db, { cycle_id: cycle.id, content: 'Domain', category: 'domain' });

    const app = createApp();
    const res = await supertest(app).get(`/api/learnings?category=domain&cycle_id=${cycle.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].category).toBe('domain');
  });
});

// --- FR-019: POST /api/learnings ---
describe('FR-019: POST /api/learnings', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a learning with valid input', async () => {
    // Verifies: FR-019
    const cycle = seedCycle(db);

    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ cycle_id: cycle.id, content: 'We learned something', category: 'technical' });

    expect(res.status).toBe(201);
    expect(res.body.cycle_id).toBe(cycle.id);
    expect(res.body.content).toBe('We learned something');
    expect(res.body.category).toBe('technical');
  });

  it('should return 400 when cycle_id is missing', async () => {
    // Verifies: FR-019
    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ content: 'Learning', category: 'process' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cycle_id');
  });

  it('should return 400 when content is missing', async () => {
    // Verifies: FR-019
    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ cycle_id: 'CYCLE-0001', category: 'process' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('content');
  });

  it('should return 400 when category is missing', async () => {
    // Verifies: FR-019
    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ cycle_id: 'CYCLE-0001', content: 'Something' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('category');
  });

  it('should return 400 for invalid category enum (DD-8)', async () => {
    // Verifies: FR-019
    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ cycle_id: 'CYCLE-0001', content: 'Something', category: 'invalid_category' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid category');
  });

  it('should accept all valid categories', () => {
    // Verifies: FR-019 (DD-8)
    expect(VALID_LEARNING_CATEGORIES).toContain('process');
    expect(VALID_LEARNING_CATEGORIES).toContain('technical');
    expect(VALID_LEARNING_CATEGORIES).toContain('domain');
  });
});

// --- Service unit tests ---
describe('Learning service unit tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should create learning with correct fields', () => {
    // Verifies: FR-019
    const bug = createBug(db, { title: 'B', description: 'd', severity: 'low' });
    updateBug(db, bug.id, { status: 'triaged' });
    const cycle = createCycle(db);

    const learning = createLearning(db, { cycle_id: cycle.id, content: 'Test content', category: 'domain' });
    expect(learning.cycle_id).toBe(cycle.id);
    expect(learning.content).toBe('Test content');
    expect(learning.category).toBe('domain');
    expect(learning.id).toBeTruthy();
    expect(learning.created_at).toBeTruthy();
  });

  it('listLearnings should return empty array when none exist', () => {
    // Verifies: FR-019
    expect(listLearnings(db)).toHaveLength(0);
  });
});

// --- DD-11/DD-12: Input length validation for learnings ---
describe('Learning input length validation (DD-11, M-04)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return 400 when content exceeds max length on create', async () => {
    // Verifies: FR-019
    const cycle = seedCycle(db);
    const longContent = 'A'.repeat(CONTENT_MAX_LENGTH + 1);

    const app = createApp();
    const res = await supertest(app)
      .post('/api/learnings')
      .send({ cycle_id: cycle.id, content: longContent, category: 'process' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('content');
  });

  it('should accept content at exactly max length', () => {
    // Verifies: FR-019
    const bug = createBug(db, { title: 'B', description: 'd', severity: 'low' });
    updateBug(db, bug.id, { status: 'triaged' });
    const cycle = createCycle(db);

    const learning = createLearning(db, {
      cycle_id: cycle.id,
      content: 'A'.repeat(CONTENT_MAX_LENGTH),
      category: 'technical',
    });
    expect(learning.content).toHaveLength(CONTENT_MAX_LENGTH);
  });
});
