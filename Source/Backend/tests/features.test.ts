// Verifies: FR-020, FR-031
// Tests for Features API endpoint (searchable completed features catalog).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import { listFeatures, createFeature } from '../src/services/featureService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// --- FR-020: GET /api/features ---
describe('FR-020: GET /api/features', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty data array when no features exist', async () => {
    // Verifies: FR-020
    const app = createApp();
    const res = await supertest(app).get('/api/features');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return all features without search', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Dark Mode', description: 'Dashboard dark mode', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'Search Feature', description: 'Full text search', source_work_item_id: 'FR-0002' });

    const app = createApp();
    const res = await supertest(app).get('/api/features');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should search by title using ?q=', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Dark Mode', description: 'Adds dark mode to the app', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'Improved Search', description: 'Better search results', source_work_item_id: 'FR-0002' });

    const app = createApp();
    const res = await supertest(app).get('/api/features?q=Dark');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Dark Mode');
  });

  it('should search by description using ?q=', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Feature A', description: 'Contains the word search', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'Feature B', description: 'Different description', source_work_item_id: 'FR-0002' });

    const app = createApp();
    const res = await supertest(app).get('/api/features?q=search');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Feature A');
  });

  it('should return empty array when no features match search', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Feature A', description: 'Description A', source_work_item_id: 'FR-0001' });

    const app = createApp();
    const res = await supertest(app).get('/api/features?q=nonexistent_keyword_xyz');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return all features when q is empty string', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Feature A', description: 'desc', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'Feature B', description: 'desc', source_work_item_id: 'FR-0002' });

    const app = createApp();
    const res = await supertest(app).get('/api/features?q=');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('each feature should have required fields', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Dark Mode', description: 'desc', source_work_item_id: 'FR-0001' });

    const app = createApp();
    const res = await supertest(app).get('/api/features');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const feature = res.body.data[0];
    expect(feature).toHaveProperty('id');
    expect(feature).toHaveProperty('title');
    expect(feature).toHaveProperty('description');
    expect(feature).toHaveProperty('source_work_item_id');
    expect(feature).toHaveProperty('created_at');
    expect(feature.id).toMatch(/^FEAT-\d{4}$/);
  });

  it('should search case-insensitively in SQLite', async () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Dark Mode Feature', description: 'desc', source_work_item_id: 'FR-0001' });

    const app = createApp();
    const res = await supertest(app).get('/api/features?q=dark mode');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// --- Service unit tests ---
describe('Feature service unit tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('listFeatures should return empty array when no features', () => {
    // Verifies: FR-020
    expect(listFeatures(db)).toHaveLength(0);
  });

  it('createFeature should persist to database', () => {
    // Verifies: FR-020
    const feature = createFeature(db, {
      title: 'Test Feature',
      description: 'A test feature',
      source_work_item_id: 'FR-0001',
    });

    expect(feature.id).toBeTruthy();
    expect(feature.title).toBe('Test Feature');
    expect(feature.source_work_item_id).toBe('FR-0001');
    expect(feature.created_at).toBeTruthy();
  });

  it('listFeatures should filter by search query', () => {
    // Verifies: FR-020
    createFeature(db, { title: 'Feature Alpha', description: 'desc', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'Feature Beta', description: 'desc', source_work_item_id: 'FR-0002' });

    const results = listFeatures(db, { q: 'Alpha' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Feature Alpha');
  });

  it('listFeatures with no query returns all features', () => {
    // Verifies: FR-020
    createFeature(db, { title: 'F1', description: 'desc', source_work_item_id: 'FR-0001' });
    createFeature(db, { title: 'F2', description: 'desc', source_work_item_id: 'FR-0002' });
    createFeature(db, { title: 'F3', description: 'desc', source_work_item_id: 'FR-0003' });

    expect(listFeatures(db)).toHaveLength(3);
  });
});
