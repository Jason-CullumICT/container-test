// Verifies: FR-017, FR-018, FR-031
// Tests for Dashboard API endpoints.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import { createBug, updateBug } from '../src/services/bugService';
import { createFeatureRequest } from '../src/services/featureRequestService';
import { createCycle } from '../src/services/cycleService';
import { getDashboardSummary, getDashboardActivity } from '../src/services/dashboardService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// --- FR-017: GET /api/dashboard/summary ---
describe('FR-017: GET /api/dashboard/summary', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return summary with all required fields', async () => {
    // Verifies: FR-017
    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/summary');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('feature_requests');
    expect(res.body).toHaveProperty('bugs');
    expect(res.body.bugs).toHaveProperty('by_status');
    expect(res.body.bugs).toHaveProperty('by_severity');
    expect(res.body).toHaveProperty('active_cycle');
  });

  it('should include FR counts per status', async () => {
    // Verifies: FR-017
    createFeatureRequest(db, { title: 'FR1', description: 'desc' });
    createFeatureRequest(db, { title: 'FR2', description: 'desc' });
    db.prepare(`UPDATE feature_requests SET status = 'voting' WHERE title = 'FR2'`).run();

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.feature_requests.potential).toBe(1);
    expect(res.body.feature_requests.voting).toBe(1);
  });

  it('should include bug counts by status and severity', async () => {
    // Verifies: FR-017
    createBug(db, { title: 'Bug A', description: 'desc', severity: 'critical' });
    createBug(db, { title: 'Bug B', description: 'desc', severity: 'high' });
    const bugC = createBug(db, { title: 'Bug C', description: 'desc', severity: 'critical' });
    updateBug(db, bugC.id, { status: 'triaged' });

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.bugs.by_severity.critical).toBe(2);
    expect(res.body.bugs.by_severity.high).toBe(1);
    expect(res.body.bugs.by_status.reported).toBe(2);
    expect(res.body.bugs.by_status.triaged).toBe(1);
  });

  it('should report active_cycle as null when no cycle exists', async () => {
    // Verifies: FR-017
    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.active_cycle).toBeNull();
  });

  it('should return active cycle when one is running', async () => {
    // Verifies: FR-017
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'high' });
    updateBug(db, bug.id, { status: 'triaged' });
    createCycle(db);

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.active_cycle).not.toBeNull();
    expect(res.body.active_cycle.status).toBe('spec_changes');
    expect(res.body.active_cycle.work_item_type).toBe('bug');
  });

  it('should include zeroes for all statuses even when empty', () => {
    // Verifies: FR-017
    const summary = getDashboardSummary(db);
    expect(summary.feature_requests.potential).toBe(0);
    expect(summary.feature_requests.voting).toBe(0);
    expect(summary.feature_requests.approved).toBe(0);
    expect(summary.bugs.by_status.reported).toBe(0);
    expect(summary.bugs.by_severity.critical).toBe(0);
  });
});

// --- FR-018: GET /api/dashboard/activity ---
describe('FR-018: GET /api/dashboard/activity', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return activity items in {data: []} wrapper', async () => {
    // Verifies: FR-018
    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should include activity items from feature requests', async () => {
    // Verifies: FR-018
    createFeatureRequest(db, { title: 'New FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity');
    expect(res.status).toBe(200);
    const frItems = res.body.data.filter((item: { type: string }) => item.type === 'feature_request');
    expect(frItems.length).toBeGreaterThan(0);
  });

  it('should include activity items from bug reports', async () => {
    // Verifies: FR-018
    createBug(db, { title: 'New Bug', description: 'desc', severity: 'high' });

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity');
    expect(res.status).toBe(200);
    const bugItems = res.body.data.filter((item: { type: string }) => item.type === 'bug');
    expect(bugItems.length).toBeGreaterThan(0);
  });

  it('should return max 200 items regardless of larger limit (DD-6)', async () => {
    // Verifies: FR-018 (DD-6)
    // Create enough items
    for (let i = 0; i < 10; i++) {
      createFeatureRequest(db, { title: `FR ${i}`, description: 'desc' });
    }

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity?limit=9999');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(200);
  });

  it('should default to 20 items when no limit specified', () => {
    // Verifies: FR-018
    // Create more than 20 FRs
    for (let i = 0; i < 25; i++) {
      createFeatureRequest(db, { title: `FR ${i}`, description: 'desc' });
    }

    const items = getDashboardActivity(db);
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it('should respect custom limit', async () => {
    // Verifies: FR-018
    for (let i = 0; i < 15; i++) {
      createFeatureRequest(db, { title: `FR ${i}`, description: 'desc' });
    }

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it('each activity item should have type, entity_id, description, and timestamp', async () => {
    // Verifies: FR-018
    createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const item of res.body.data) {
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('entity_id');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('timestamp');
      expect(typeof item.type).toBe('string');
      expect(typeof item.entity_id).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.timestamp).toBe('string');
    }
  });

  it('should return items sorted by timestamp descending', async () => {
    // Verifies: FR-018
    createFeatureRequest(db, { title: 'FR 1', description: 'desc' });
    createBug(db, { title: 'Bug 1', description: 'desc', severity: 'high' });

    const app = createApp();
    const res = await supertest(app).get('/api/dashboard/activity');
    expect(res.status).toBe(200);

    const timestamps = res.body.data.map((item: { timestamp: string }) => item.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1] >= timestamps[i]).toBe(true);
    }
  });

  it('service should cap at 200 even when requesting more', () => {
    // Verifies: FR-018 (DD-6)
    for (let i = 0; i < 50; i++) {
      createFeatureRequest(db, { title: `FR ${i}`, description: 'desc' });
    }

    const items = getDashboardActivity(db, 9999);
    expect(items.length).toBeLessThanOrEqual(200);
  });
});
