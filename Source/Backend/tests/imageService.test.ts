// Verifies: FR-074, FR-088
// Tests for Image Attachment service — CRUD operations, entity validation, file cleanup.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';
import {
  uploadImagesService,
  listImages,
  deleteImage,
  MulterFile,
} from '../src/services/imageService';
import { createFeatureRequest } from '../src/services/featureRequestService';
import { createBug } from '../src/services/bugService';

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
    originalname: 'screenshot.png',
    encoding: '7bit',
    mimetype: 'image/png',
    destination: '/tmp/uploads',
    filename: 'abc123.png',
    path: '/tmp/uploads/abc123.png',
    size: 1024,
    ...overrides,
  };
}

describe('Image Service — uploadImagesService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should upload images for a feature request and return ImageAttachment[]', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const files = [makeMockFile(), makeMockFile({ originalname: 'mockup.jpg', filename: 'def456.jpg', mimetype: 'image/jpeg', size: 2048 })];

    const result = uploadImagesService(db, fr.id, 'feature_request', files);

    expect(result).toHaveLength(2);
    expect(result[0].id).toMatch(/^IMG-\d{4}$/);
    expect(result[0].entity_id).toBe(fr.id);
    expect(result[0].entity_type).toBe('feature_request');
    expect(result[0].original_name).toBe('screenshot.png');
    expect(result[0].mime_type).toBe('image/png');
    expect(result[0].size_bytes).toBe(1024);
    expect(result[0].created_at).toBeTruthy();
    expect(result[1].original_name).toBe('mockup.jpg');
    expect(result[1].size_bytes).toBe(2048);
  });

  it('should upload images for a bug report', () => {
    // Verifies: FR-074
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'high' });
    const files = [makeMockFile()];

    const result = uploadImagesService(db, bug.id, 'bug', files);

    expect(result).toHaveLength(1);
    expect(result[0].entity_id).toBe(bug.id);
    expect(result[0].entity_type).toBe('bug');
  });

  it('should generate sequential IMG IDs', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const batch1 = uploadImagesService(db, fr.id, 'feature_request', [makeMockFile()]);
    const batch2 = uploadImagesService(db, fr.id, 'feature_request', [makeMockFile({ filename: 'xyz789.png' })]);

    expect(batch1[0].id).toBe('IMG-0001');
    expect(batch2[0].id).toBe('IMG-0002');
  });

  it('should handle multiple files in a single upload', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const files = [
      makeMockFile({ filename: 'f1.png' }),
      makeMockFile({ filename: 'f2.png' }),
      makeMockFile({ filename: 'f3.png' }),
    ];

    const result = uploadImagesService(db, fr.id, 'feature_request', files);

    expect(result).toHaveLength(3);
    // All should have unique IDs
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('Image Service — listImages', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty array when no images exist', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const images = listImages(db, fr.id, 'feature_request');
    expect(images).toHaveLength(0);
  });

  it('should return images for a specific entity', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const bug = createBug(db, { title: 'Test Bug', description: 'desc', severity: 'low' });

    uploadImagesService(db, fr.id, 'feature_request', [makeMockFile()]);
    uploadImagesService(db, bug.id, 'bug', [makeMockFile({ filename: 'bug-img.png' })]);

    const frImages = listImages(db, fr.id, 'feature_request');
    const bugImages = listImages(db, bug.id, 'bug');

    expect(frImages).toHaveLength(1);
    expect(frImages[0].entity_type).toBe('feature_request');
    expect(bugImages).toHaveLength(1);
    expect(bugImages[0].entity_type).toBe('bug');
  });

  it('should not return images for a different entity type', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    uploadImagesService(db, fr.id, 'feature_request', [makeMockFile()]);

    // Query as bug should return nothing
    const bugImages = listImages(db, fr.id, 'bug');
    expect(bugImages).toHaveLength(0);
  });
});

describe('Image Service — deleteImage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should delete an image record from DB', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const [image] = uploadImagesService(db, fr.id, 'feature_request', [makeMockFile()]);

    deleteImage(db, image.id);

    const images = listImages(db, fr.id, 'feature_request');
    expect(images).toHaveLength(0);
  });

  it('should throw 404 for non-existent image', () => {
    // Verifies: FR-074
    expect(() => deleteImage(db, 'IMG-9999')).toThrow('Image not found');
  });

  it('should not fail if file does not exist on disk', () => {
    // Verifies: FR-074
    const fr = createFeatureRequest(db, { title: 'Test FR', description: 'desc' });
    const [image] = uploadImagesService(db, fr.id, 'feature_request', [makeMockFile()]);

    // File doesn't exist on disk (mock file path), should not throw
    expect(() => deleteImage(db, image.id)).not.toThrow();
    expect(listImages(db, fr.id, 'feature_request')).toHaveLength(0);
  });
});
