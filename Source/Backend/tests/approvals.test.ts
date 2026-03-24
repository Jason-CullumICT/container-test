// Verifies: FR-011, FR-012, FR-031
// Tests for approve and deny feature request endpoints.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  createFeatureRequest,
  voteOnFeatureRequest,
  approveFeatureRequest,
  denyFeatureRequest,
} from '../src/services/featureRequestService';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// --- FR-011: POST /api/feature-requests/:id/approve ---
describe('FR-011: POST /api/feature-requests/:id/approve', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should approve a FR in voting status with majority approve votes', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'Approvable FR', description: 'desc' });
    // Use fixed random so all votes approve
    voteOnFeatureRequest(db, fr.id, { random: () => 0.01 });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.human_approval_approved_at).not.toBeNull();
  });

  it('should return 409 when FR is not in voting status', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'Potential FR', description: 'desc' });
    // FR is in 'potential' status — not voting

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('voting');
  });

  it('should return 409 when majority vote is deny', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'Deny-majority FR', description: 'desc' });
    // Use fixed random so all votes deny
    voteOnFeatureRequest(db, fr.id, { random: () => 0.99 });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('majority vote is not');
  });

  it('should return 409 when FR has no votes', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'No votes FR', description: 'desc' });
    // Manually set status to voting without votes
    db.prepare(`UPDATE feature_requests SET status = 'voting' WHERE id = ?`).run(fr.id);

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 404 for unknown FR id', async () => {
    // Verifies: FR-011
    const app = createApp();
    const res = await supertest(app).post('/api/feature-requests/FR-9999/approve');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should set human_approval_approved_at on approval', () => {
    // Verifies: FR-011 (DD-2)
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.01 });

    const approved = approveFeatureRequest(db, fr.id);
    expect(approved.human_approval_approved_at).not.toBeNull();
    expect(typeof approved.human_approval_approved_at).toBe('string');
    // Should be a valid ISO timestamp
    expect(() => new Date(approved.human_approval_approved_at!)).not.toThrow();
  });

  it('should not approve an already approved FR', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'Approved FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.01 });
    approveFeatureRequest(db, fr.id);

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(409);
  });

  it('should return FR with votes in response', async () => {
    // Verifies: FR-011
    const fr = createFeatureRequest(db, { title: 'Approvable FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.01 });

    const app = createApp();
    const res = await supertest(app).post(`/api/feature-requests/${fr.id}/approve`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.votes)).toBe(true);
    expect(res.body.votes.length).toBeGreaterThanOrEqual(3);
  });
});

// --- FR-012: POST /api/feature-requests/:id/deny ---
describe('FR-012: POST /api/feature-requests/:id/deny', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should deny a FR in potential status with a comment', async () => {
    // Verifies: FR-012
    const fr = createFeatureRequest(db, { title: 'Deniable FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: 'Not aligned with roadmap' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('denied');
    expect(res.body.human_approval_comment).toBe('Not aligned with roadmap');
  });

  it('should deny a FR in voting status with a comment', async () => {
    // Verifies: FR-012
    const fr = createFeatureRequest(db, { title: 'Voting FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.5 });

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: 'Rejected after voting' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('denied');
    expect(res.body.human_approval_comment).toBe('Rejected after voting');
  });

  it('should return 409 when trying to deny an approved FR', async () => {
    // Verifies: FR-012 (DD-5)
    const fr = createFeatureRequest(db, { title: 'Approved FR', description: 'desc' });
    voteOnFeatureRequest(db, fr.id, { random: () => 0.01 });
    approveFeatureRequest(db, fr.id);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: 'Trying to deny' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('approved');
  });

  it('should return 409 when trying to deny an in_development FR', async () => {
    // Verifies: FR-012 (DD-5)
    const fr = createFeatureRequest(db, { title: 'In dev FR', description: 'desc' });
    // Manually put in in_development
    db.prepare(`UPDATE feature_requests SET status = 'in_development' WHERE id = ?`).run(fr.id);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: 'Trying to deny' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('in_development');
  });

  it('should return 409 when trying to deny a completed FR', async () => {
    // Verifies: FR-012 (DD-5)
    const fr = createFeatureRequest(db, { title: 'Completed FR', description: 'desc' });
    db.prepare(`UPDATE feature_requests SET status = 'completed' WHERE id = ?`).run(fr.id);

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: 'Trying to deny' });

    expect(res.status).toBe(409);
  });

  it('should return 400 when comment is missing', async () => {
    // Verifies: FR-012
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('comment');
  });

  it('should return 400 when comment is empty string', async () => {
    // Verifies: FR-012
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });

    const app = createApp();
    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/deny`)
      .send({ comment: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('comment');
  });

  it('should return 404 for unknown FR id', async () => {
    // Verifies: FR-012
    const app = createApp();
    const res = await supertest(app)
      .post('/api/feature-requests/FR-9999/deny')
      .send({ comment: 'Not found' });

    expect(res.status).toBe(404);
  });

  it('should store denial comment in human_approval_comment column', () => {
    // Verifies: FR-012
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const denied = denyFeatureRequest(db, fr.id, 'The reason for denial');

    expect(denied.human_approval_comment).toBe('The reason for denial');
    expect(denied.status).toBe('denied');
  });
});
