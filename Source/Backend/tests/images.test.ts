// Verifies: FR-072, FR-073, FR-074, FR-075, FR-076, FR-077, FR-079, FR-088
// Tests for Image Upload APIs — service functions and route handlers.

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
import { uploadImagesService, listImages, deleteImage, MulterFile } from '../src/services/imageService';
import { UPLOAD_DIR } from '../src/middleware/upload';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function makeMockFile(overrides: Partial<MulterFile> = {}): MulterFile {
  return {
    fieldname: 'images',
    originalname: 'test-screenshot.png',
    encoding: '7bit',
    mimetype: 'image/png',
    destination: UPLOAD_DIR,
    filename: `test-${Date.now()}.png`,
    path: path.join(UPLOAD_DIR, `test-${Date.now()}.png`),
    size: 1024,
    ...overrides,
  };
}

// --- FR-072: Schema migration ---
describe('FR-072: image_attachments table schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('should create image_attachments table with correct columns', () => {
    // Verifies: FR-072
    const columns = db.prepare('PRAGMA table_info(image_attachments)').all() as Array<{ name: string; type: string; notnull: number }>;
    const colNames = columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('entity_id');
    expect(colNames).toContain('entity_type');
    expect(colNames).toContain('filename');
    expect(colNames).toContain('original_name');
    expect(colNames).toContain('mime_type');
    expect(colNames).toContain('size_bytes');
    expect(colNames).toContain('created_at');
  });

  it('should have entity_type CHECK constraint for valid values', () => {
    // Verifies: FR-072
    expect(() => {
      db.prepare(
        `INSERT INTO image_attachments (id, entity_id, entity_type, filename, original_name, mime_type, size_bytes, created_at)
         VALUES ('IMG-0001', 'FR-0001', 'invalid', 'test.png', 'test.png', 'image/png', 1024, '2026-01-01T00:00:00.000Z')`
      ).run();
    }).toThrow();
  });

  it('should create index on entity_id and entity_type', () => {
    // Verifies: FR-072
    const indexes = db.prepare("PRAGMA index_list('image_attachments')").all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain('idx_image_attachments_entity');
  });

  it('should run migration idempotently', () => {
    // Verifies: FR-072
    expect(() => runMigrations(db)).not.toThrow();
  });
});

// --- FR-074: Image service functions ---
describe('FR-074: imageService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('uploadImagesService', () => {
    it('should insert image records and return ImageAttachment[]', () => {
      // Verifies: FR-074
      const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
      const files = [makeMockFile({ filename: 'abc.png', originalname: 'screenshot.png', size: 2048 })];
      const result = uploadImagesService(db, fr.id, 'feature_request', files);

      expect(result).toHaveLength(1);
      expect(result[0].id).toMatch(/^IMG-\d{4}$/);
      expect(result[0].entity_id).toBe(fr.id);
      expect(result[0].entity_type).toBe('feature_request');
      expect(result[0].filename).toBe('abc.png');
      expect(result[0].original_name).toBe('screenshot.png');
      expect(result[0].mime_type).toBe('image/png');
      expect(result[0].size_bytes).toBe(2048);
      expect(result[0].created_at).toBeTruthy();
    });

    it('should handle multiple files in one upload', () => {
      // Verifies: FR-074
      const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
      const files = [
        makeMockFile({ filename: 'file1.png', originalname: 'img1.png', size: 1000 }),
        makeMockFile({ filename: 'file2.jpg', originalname: 'img2.jpg', mimetype: 'image/jpeg', size: 2000 }),
        makeMockFile({ filename: 'file3.gif', originalname: 'img3.gif', mimetype: 'image/gif', size: 3000 }),
      ];
      const result = uploadImagesService(db, fr.id, 'feature_request', files);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('IMG-0001');
      expect(result[1].id).toBe('IMG-0002');
      expect(result[2].id).toBe('IMG-0003');
    });

    it('should generate sequential IDs for bug images', () => {
      // Verifies: FR-074
      const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'high' });
      const files1 = [makeMockFile({ filename: 'a.png' })];
      const files2 = [makeMockFile({ filename: 'b.png' })];

      const result1 = uploadImagesService(db, bug.id, 'bug', files1);
      const result2 = uploadImagesService(db, bug.id, 'bug', files2);

      expect(result1[0].id).toBe('IMG-0001');
      expect(result2[0].id).toBe('IMG-0002');
    });
  });

  describe('listImages', () => {
    it('should return empty array when no images exist', () => {
      // Verifies: FR-074
      const result = listImages(db, 'FR-0001', 'feature_request');
      expect(result).toEqual([]);
    });

    it('should return images for the correct entity only', () => {
      // Verifies: FR-074
      const fr1 = createFeatureRequest(db, { title: 'FR 1', description: 'desc' });
      const fr2 = createFeatureRequest(db, { title: 'FR 2', description: 'desc' });

      uploadImagesService(db, fr1.id, 'feature_request', [makeMockFile({ filename: 'fr1.png' })]);
      uploadImagesService(db, fr2.id, 'feature_request', [makeMockFile({ filename: 'fr2.png' })]);

      const result = listImages(db, fr1.id, 'feature_request');
      expect(result).toHaveLength(1);
      expect(result[0].entity_id).toBe(fr1.id);
    });

    it('should not mix entity types', () => {
      // Verifies: FR-074
      const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
      const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'high' });

      uploadImagesService(db, fr.id, 'feature_request', [makeMockFile({ filename: 'fr.png' })]);
      uploadImagesService(db, bug.id, 'bug', [makeMockFile({ filename: 'bug.png' })]);

      const frImages = listImages(db, fr.id, 'feature_request');
      const bugImages = listImages(db, bug.id, 'bug');

      expect(frImages).toHaveLength(1);
      expect(bugImages).toHaveLength(1);
      expect(frImages[0].entity_type).toBe('feature_request');
      expect(bugImages[0].entity_type).toBe('bug');
    });
  });

  describe('deleteImage', () => {
    it('should remove the image record from the database', () => {
      // Verifies: FR-074
      const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
      const [img] = uploadImagesService(db, fr.id, 'feature_request', [makeMockFile({ filename: 'del.png' })]);

      deleteImage(db, img.id);
      const remaining = listImages(db, fr.id, 'feature_request');
      expect(remaining).toHaveLength(0);
    });

    it('should throw 404 for non-existent image ID', () => {
      // Verifies: FR-074
      expect(() => deleteImage(db, 'IMG-9999')).toThrow();
      try {
        deleteImage(db, 'IMG-9999');
      } catch (err: unknown) {
        expect((err as { statusCode: number }).statusCode).toBe(404);
      }
    });

    it('should delete the file from disk when it exists', () => {
      // Verifies: FR-074, DD-IMG-05
      const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
      const testFilename = `test-delete-${Date.now()}.png`;
      const testFilePath = path.join(UPLOAD_DIR, testFilename);

      // Ensure upload dir exists and create a temp file
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      fs.writeFileSync(testFilePath, 'fake image content');

      const [img] = uploadImagesService(db, fr.id, 'feature_request', [
        makeMockFile({ filename: testFilename }),
      ]);

      expect(fs.existsSync(testFilePath)).toBe(true);
      deleteImage(db, img.id);
      expect(fs.existsSync(testFilePath)).toBe(false);
    });
  });
});

// --- FR-075: POST /api/feature-requests/:id/images ---
describe('FR-075: POST /api/feature-requests/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should upload images for an existing feature request', async () => {
    // Verifies: FR-075
    const fr = createFeatureRequest(db, { title: 'FR Upload', description: 'desc' });
    const app = createApp();

    // Create a minimal valid PNG (1x1 pixel)
    const pngBuffer = createMinimalPng();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', pngBuffer, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].entity_id).toBe(fr.id);
    expect(res.body.data[0].entity_type).toBe('feature_request');
    expect(res.body.data[0].original_name).toBe('test.png');
    expect(res.body.data[0].mime_type).toBe('image/png');

    // Clean up uploaded file
    const uploadedFile = path.join(UPLOAD_DIR, res.body.data[0].filename);
    if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile);
  });

  it('should return 404 for non-existent feature request', async () => {
    // Verifies: FR-075
    const app = createApp();
    const pngBuffer = createMinimalPng();

    const res = await supertest(app)
      .post('/api/feature-requests/FR-9999/images')
      .attach('images', pngBuffer, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Feature request not found');
  });

  it('should return 400 when no files are uploaded', async () => {
    // Verifies: FR-075
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No files uploaded');
  });

  it('should reject invalid MIME types', async () => {
    // Verifies: FR-073, FR-075
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/feature-requests/${fr.id}/images`)
      .attach('images', Buffer.from('not a real pdf'), { filename: 'test.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid file type');
  });
});

// --- FR-076: POST /api/bugs/:id/images ---
describe('FR-076: POST /api/bugs/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should upload images for an existing bug report', async () => {
    // Verifies: FR-076
    const bug = createBug(db, { title: 'Bug Upload', description: 'desc', severity: 'high' });
    const app = createApp();
    const pngBuffer = createMinimalPng();

    const res = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .attach('images', pngBuffer, { filename: 'screenshot.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].entity_id).toBe(bug.id);
    expect(res.body.data[0].entity_type).toBe('bug');

    // Clean up
    const uploadedFile = path.join(UPLOAD_DIR, res.body.data[0].filename);
    if (fs.existsSync(uploadedFile)) fs.unlinkSync(uploadedFile);
  });

  it('should return 404 for non-existent bug', async () => {
    // Verifies: FR-076
    const app = createApp();
    const pngBuffer = createMinimalPng();

    const res = await supertest(app)
      .post('/api/bugs/BUG-9999/images')
      .attach('images', pngBuffer, { filename: 'test.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Bug not found');
  });

  it('should return 400 when no files are uploaded', async () => {
    // Verifies: FR-076
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'medium' });
    const app = createApp();

    const res = await supertest(app)
      .post(`/api/bugs/${bug.id}/images`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No files uploaded');
  });
});

// --- FR-077: GET and DELETE image routes ---
describe('FR-077: GET /api/feature-requests/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return images for a feature request', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    uploadImagesService(db, fr.id, 'feature_request', [
      makeMockFile({ filename: 'img1.png', originalname: 'shot1.png' }),
      makeMockFile({ filename: 'img2.jpg', originalname: 'shot2.jpg', mimetype: 'image/jpeg' }),
    ]);

    const app = createApp();
    const res = await supertest(app).get(`/api/feature-requests/${fr.id}/images`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].entity_id).toBe(fr.id);
  });

  it('should return 404 for non-existent feature request', async () => {
    // Verifies: FR-077
    const app = createApp();
    const res = await supertest(app).get('/api/feature-requests/FR-9999/images');
    expect(res.status).toBe(404);
  });

  it('should return empty array when no images exist', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    const app = createApp();
    const res = await supertest(app).get(`/api/feature-requests/${fr.id}/images`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('FR-077: GET /api/bugs/:id/images', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return images for a bug report', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'high' });
    uploadImagesService(db, bug.id, 'bug', [
      makeMockFile({ filename: 'bugimg.png', originalname: 'error.png' }),
    ]);

    const app = createApp();
    const res = await supertest(app).get(`/api/bugs/${bug.id}/images`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].entity_type).toBe('bug');
  });

  it('should return 404 for non-existent bug', async () => {
    // Verifies: FR-077
    const app = createApp();
    const res = await supertest(app).get('/api/bugs/BUG-9999/images');
    expect(res.status).toBe(404);
  });
});

describe('FR-077: DELETE /api/feature-requests/:id/images/:imageId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should delete an image and return 204', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    const [img] = uploadImagesService(db, fr.id, 'feature_request', [
      makeMockFile({ filename: 'todelete.png' }),
    ]);

    const app = createApp();
    const res = await supertest(app).delete(`/api/feature-requests/${fr.id}/images/${img.id}`);

    expect(res.status).toBe(204);

    // Confirm it's gone
    const remaining = listImages(db, fr.id, 'feature_request');
    expect(remaining).toHaveLength(0);
  });

  it('should return 404 for non-existent image', async () => {
    // Verifies: FR-077
    const fr = createFeatureRequest(db, { title: 'FR', description: 'desc' });
    const app = createApp();
    const res = await supertest(app).delete(`/api/feature-requests/${fr.id}/images/IMG-9999`);

    expect(res.status).toBe(404);
  });
});

describe('FR-077: DELETE /api/bugs/:id/images/:imageId', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should delete a bug image and return 204', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });
    const [img] = uploadImagesService(db, bug.id, 'bug', [
      makeMockFile({ filename: 'bugdel.png' }),
    ]);

    const app = createApp();
    const res = await supertest(app).delete(`/api/bugs/${bug.id}/images/${img.id}`);

    expect(res.status).toBe(204);
  });

  it('should return 404 for non-existent bug image', async () => {
    // Verifies: FR-077
    const bug = createBug(db, { title: 'Bug', description: 'desc', severity: 'low' });
    const app = createApp();
    const res = await supertest(app).delete(`/api/bugs/${bug.id}/images/IMG-9999`);

    expect(res.status).toBe(404);
  });
});

// --- Helper: Minimal valid PNG buffer ---
function createMinimalPng(): Buffer {
  // Smallest valid PNG: 1x1 pixel, 8-bit RGBA
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
    'hex'
  );
}
