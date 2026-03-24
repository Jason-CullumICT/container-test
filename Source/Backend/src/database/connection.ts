// Verifies: FR-002
// SQLite database connection using better-sqlite3

import Database from 'better-sqlite3';
import path from 'path';
import { logger } from '../lib/logger';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'dev-workflow.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    logger.info('Database connection established', { path: DB_PATH });
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}

// Allow tests to inject an in-memory database
export function setDb(database: Database.Database): void {
  db = database;
}
