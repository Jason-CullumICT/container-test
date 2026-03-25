// Verifies: FR-078, FR-088
// Tests for orchestrator proxy — JSON and multipart form-data forwarding.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import http from 'http';
import supertest from 'supertest';
import { createApp } from '../src/index';
import { setDb } from '../src/database/connection';
import { runMigrations } from '../src/database/schema';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

// Create a small valid PNG buffer for multipart testing
function createSmallPng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000a49444154789c626000000002000198e195280000000049454e44ae426082',
    'hex'
  );
}

/**
 * Helper: start a mock orchestrator server that echoes request info.
 * Returns the server and port for testing.
 */
function createMockOrchestrator(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          received: {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'] || '',
            bodyLength: body.length,
            bodyString: body.toString('utf-8').substring(0, 500),
          },
        }));
      });
    });

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('FR-078: Orchestrator proxy — JSON forwarding', () => {
  let db: Database.Database;
  let mockServer: http.Server;
  let mockPort: number;
  const originalEnv = process.env.ORCHESTRATOR_URL;

  beforeEach(async () => {
    db = createTestDb();
    setDb(db);
    const mock = await createMockOrchestrator();
    mockServer = mock.server;
    mockPort = mock.port;
    process.env.ORCHESTRATOR_URL = `http://localhost:${mockPort}`;
  });

  afterEach(async () => {
    db.close();
    process.env.ORCHESTRATOR_URL = originalEnv;
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('should forward JSON POST requests to the orchestrator', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .post('/api/orchestrator/api/work')
      .send({ task: 'Build feature X', team: 'TheATeam' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.received.method).toBe('POST');
    expect(res.body.received.url).toBe('/api/work');
    expect(res.body.received.contentType).toContain('application/json');
    // Body should contain the JSON payload
    const parsedBody = JSON.parse(res.body.received.bodyString);
    expect(parsedBody.task).toBe('Build feature X');
    expect(parsedBody.team).toBe('TheATeam');
  });

  it('should forward GET requests to the orchestrator', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .get('/api/orchestrator/api/status');

    expect(res.status).toBe(200);
    expect(res.body.received.method).toBe('GET');
    expect(res.body.received.url).toBe('/api/status');
  });
});

describe('FR-078: Orchestrator proxy — Multipart forwarding', () => {
  let db: Database.Database;
  let mockServer: http.Server;
  let mockPort: number;
  const originalEnv = process.env.ORCHESTRATOR_URL;

  beforeEach(async () => {
    db = createTestDb();
    setDb(db);
    const mock = await createMockOrchestrator();
    mockServer = mock.server;
    mockPort = mock.port;
    process.env.ORCHESTRATOR_URL = `http://localhost:${mockPort}`;
  });

  afterEach(async () => {
    db.close();
    process.env.ORCHESTRATOR_URL = originalEnv;
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('should forward multipart form-data requests with files to the orchestrator', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .post('/api/orchestrator/api/work')
      .field('task', 'Build feature Y')
      .field('team', 'TheATeam')
      .attach('images', createSmallPng(), 'screenshot.png');

    expect(res.status).toBe(200);
    expect(res.body.received.method).toBe('POST');
    expect(res.body.received.contentType).toContain('multipart/form-data');
    // Body should contain multipart data including the task and file
    expect(res.body.received.bodyLength).toBeGreaterThan(0);
    expect(res.body.received.bodyString).toContain('Build feature Y');
    expect(res.body.received.bodyString).toContain('screenshot.png');
  });

  it('should forward multipart with multiple files', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .post('/api/orchestrator/api/work')
      .field('task', 'Multiple images task')
      .attach('images', createSmallPng(), 'img1.png')
      .attach('images', createSmallPng(), 'img2.png');

    expect(res.status).toBe(200);
    expect(res.body.received.contentType).toContain('multipart/form-data');
    expect(res.body.received.bodyString).toContain('img1.png');
    expect(res.body.received.bodyString).toContain('img2.png');
  });

  it('should preserve both JSON and multipart paths', async () => {
    // Verifies: FR-078
    const app = createApp();

    // First request: JSON (no files)
    const jsonRes = await supertest(app)
      .post('/api/orchestrator/api/work')
      .send({ task: 'JSON task' })
      .set('Content-Type', 'application/json');

    expect(jsonRes.status).toBe(200);
    expect(jsonRes.body.received.contentType).toContain('application/json');

    // Second request: multipart (with files)
    const multipartRes = await supertest(app)
      .post('/api/orchestrator/api/work')
      .field('task', 'Multipart task')
      .attach('images', createSmallPng(), 'test.png');

    expect(multipartRes.status).toBe(200);
    expect(multipartRes.body.received.contentType).toContain('multipart/form-data');
  });
});

describe('FR-078: Orchestrator proxy — Error handling', () => {
  let db: Database.Database;
  const originalEnv = process.env.ORCHESTRATOR_URL;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    // Point to a port that nothing is listening on
    process.env.ORCHESTRATOR_URL = 'http://localhost:19999';
  });

  afterEach(() => {
    db.close();
    process.env.ORCHESTRATOR_URL = originalEnv;
  });

  it('should return 502 when orchestrator is unreachable (JSON)', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .post('/api/orchestrator/api/work')
      .send({ task: 'test' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Orchestrator unreachable');
  });

  it('should return 502 when orchestrator is unreachable (multipart)', async () => {
    // Verifies: FR-078
    const app = createApp();

    const res = await supertest(app)
      .post('/api/orchestrator/api/work')
      .field('task', 'test')
      .attach('images', createSmallPng(), 'test.png');

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('Orchestrator unreachable');
  });
});
