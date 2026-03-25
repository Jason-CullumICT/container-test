// Verifies: FR-075, FR-076, FR-077, FR-088
// Tests for image upload/list/delete routes on feature requests and bugs.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import path from 'path';
import fs from 'fs';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import { createFeatureRequest } from '../src/services/featureRequestService';
import { createBug } from '../src/services/bugService';
import { UPLOAD_DIR } from '../src/middleware/upload';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// Create a small valid PNG buffer (1x1 pixel)
function createSmallPng(): Buffer {
  // Minimal valid PNG: 1x1 pixel, RGBA
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
    'hex'
  );
}

// Create a small valid JPEG buffer
function createSmallJpeg(): Buffer {
  // Minimal JPEG (not a real image but has valid JPEG header for MIME detection)
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

describe('FR-075: POST /api/feature-requests/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    // Ensure uploads directory exists for multer
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should upload an image for a feature request and return 201', async () => {
    // Verifies: FR-075
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', createSmallPng(), 'screenshot.png');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toHaveProperty('id');
    expect(res.body.data[0].entity_id).toBe(fr.id);
    expect(res.body.data[0].entity_type).toBe('feature_request');
    expect(res.body.data[0].original_name).toBe('screenshot.png');
    expect(res.body.data[0].mime_type).toBe('image/png');

    // Clean up uploaded file
    const filename = res.body.data[0].filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('should return 404 for non-existent feature request', async () => {
    // Verifies: FR-075
    const app = createApp();

    const res = await supertest(app)
      .post('/api/feature-requests/FR-9999/images')
      .attach('images', createSmallPng(), 'screenshot.png');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Feature request not found');
  });

  it('should return 400 when no files uploaded', async () => {
    // Verifies: FR-075
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No files uploaded');
  });

  it('should reject invalid file types', async () => {
    // Verifies: FR-075
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', Buffer.from('not a real pdf'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid file type');
  });
});

describe('FR-076: POST /api/bugs/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should upload an image for a bug and return 201', async () => {
    // Verifies: FR-076
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'high' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .attach('images', createSmallPng(), 'bug-screenshot.png');

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].entity_id).toBe(bug.id);
    expect(res.body.data[0].entity_type).toBe('bug');

    // Clean up
    const filename = res.body.data[0].filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('should return 404 for non-existent bug', async () => {
    // Verifies: FR-076
    const app = createApp();

    const res = await supertest(app)
      .post('/api/bugs/BUG-9999/images')
      .attach('images', createSmallPng(), 'screenshot.png');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Bug not found');
  });

  it('should return 400 when no files uploaded', async () => {
    // Verifies: FR-076
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'high' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'No files uploaded');
  });
});

describe('FR-077: GET /api/feature-requests/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should return images for a feature request', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    // Upload an image first
    const uploadRes = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', createSmallPng(), 'test.png');
    expect(uploadRes.status).toBe(201);

    // List images
    const listRes = await supertest(app)
      .get(`/api/feature-requests/${fr.id}/images`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveProperty('data');
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].entity_id).toBe(fr.id);

    // Clean up
    const filename = uploadRes.body.data[0].filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('should return empty array for FR with no images', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .get(`/api/feature-requests/${fr.id}/images`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('should return 404 for non-existent feature request', async () => {
    // Verifies: FR-077
    const app = createApp();

    const res = await supertest(app)
      .get('/api/feature-requests/FR-9999/images');

    expect(res.status).toBe(404);
  });
});

describe('FR-077: GET /api/bugs/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should return images for a bug report', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'medium' });
    const app = createApp();

    // Upload first
    const uploadRes = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .attach('images', createSmallPng(), 'bug-img.png');
    expect(uploadRes.status).toBe(201);

    const listRes = await supertest(app)
      .get(`/api/bugs/${bug.id}/images`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].entity_id).toBe(bug.id);

    // Clean up
    const filename = uploadRes.body.data[0].filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('should return 404 for non-existent bug', async () => {
    // Verifies: FR-077
    const app = createApp();

    const res = await supertest(app)
      .get('/api/bugs/BUG-9999/images');

    expect(res.status).toBe(404);
  });
});

describe('FR-077: DELETE /api/feature-requests/:id/images/:imageId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should delete an image and return 204', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const uploadRes = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', createSmallPng(), 'test.png');
    const imageId = uploadRes.body.data[0].id;
    const filename = uploadRes.body.data[0].filename;

    const deleteRes = await supertest(app)
      .delete(`/api/feature-requests/${fr.id}/images/${imageId}`);

    expect(deleteRes.status).toBe(204);

    // Verify image is gone
    const listRes = await supertest(app)
      .get(`/api/feature-requests/${fr.id}/images`);
    expect(listRes.body.data).toHaveLength(0);
  });

  it('should return 404 for non-existent image', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .delete(`/api/feature-requests/${fr.id}/images/IMG-9999`);

    expect(res.status).toBe(404);
  });
});

describe('FR-077: DELETE /api/bugs/:id/images/:imageId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('should delete an image from a bug and return 204', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'low' });
    const app = createApp();

    const uploadRes = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .attach('images', createSmallPng(), 'test.png');
    const imageId = uploadRes.body.data[0].id;

    const deleteRes = await supertest(app)
      .delete(`/api/bugs/${bug.id}/images/${imageId}`);

    expect(deleteRes.status).toBe(204);
  });

  it('should return 404 for non-existent image on bug', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'low' });
    const app = createApp();

    const res = await supertest(app)
      .delete(`/api/bugs/${bug.id}/images/IMG-9999`);

    expect(res.status).toBe(404);
  });
});
