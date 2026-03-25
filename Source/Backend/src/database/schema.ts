// Verifies: FR-002
// SQLite schema migrations for all 7 tables.
// Column name is human_approval_approved_at per DD-2.
// Migrations are idempotent (CREATE TABLE IF NOT EXISTS).

import Database from 'better-sqlite3';
import { logger } from '../lib/logger';

export function runMigrations(db: Database.Database): void {
  logger.info('Running database migrations');

  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_requests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'potential',
      priority TEXT NOT NULL DEFAULT 'medium',
      human_approval_comment TEXT,
      human_approval_approved_at TEXT,
      duplicate_warning INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      feature_request_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      decision TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (feature_request_id) REFERENCES feature_requests(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bugs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'reported',
      source_system TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      work_item_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'spec_changes',
      spec_changes TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      assignee TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS learnings (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'process',
      created_at TEXT NOT NULL,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_work_item_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // --- Pipeline orchestration tables (FR-035) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL UNIQUE,
      team TEXT NOT NULL DEFAULT 'TheATeam',
      status TEXT NOT NULL DEFAULT 'queued',
      current_stage INTEGER NOT NULL DEFAULT 0,
      stages_total INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      pipeline_run_id TEXT NOT NULL,
      stage_number INTEGER NOT NULL,
      stage_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      verdict TEXT,
      agent_ids TEXT NOT NULL DEFAULT '[]',
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY (pipeline_run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE
    );
  `);

  // Add pipeline_run_id to cycles (DD-17: nullable for backwards compat)
  // Idempotent: check if column exists before adding
  const cycleColumns = db.prepare(`PRAGMA table_info(cycles)`).all() as Array<{ name: string }>;
  const hasPipelineRunId = cycleColumns.some((col) => col.name === 'pipeline_run_id');
  if (!hasPipelineRunId) {
    db.exec(`ALTER TABLE cycles ADD COLUMN pipeline_run_id TEXT`);
  }

  // --- Cycle feedback table (FR-052, DD-20) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_feedback (
      id TEXT PRIMARY KEY,
      cycle_id TEXT NOT NULL,
      ticket_id TEXT,
      agent_role TEXT NOT NULL,
      team TEXT NOT NULL DEFAULT 'TheATeam',
      feedback_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
    );
  `);

  // --- Add traceability columns to bugs (FR-052, DD-18) ---
  const bugColumns = db.prepare(`PRAGMA table_info(bugs)`).all() as Array<{ name: string }>;
  if (!bugColumns.some((col) => col.name === 'related_work_item_id')) {
    db.exec(`ALTER TABLE bugs ADD COLUMN related_work_item_id TEXT`);
  }
  if (!bugColumns.some((col) => col.name === 'related_work_item_type')) {
    db.exec(`ALTER TABLE bugs ADD COLUMN related_work_item_type TEXT`);
  }
  if (!bugColumns.some((col) => col.name === 'related_cycle_id')) {
    db.exec(`ALTER TABLE bugs ADD COLUMN related_cycle_id TEXT`);
  }

  // --- Add structured fields to tickets (FR-052, DD-24) ---
  const ticketColumns = db.prepare(`PRAGMA table_info(tickets)`).all() as Array<{ name: string }>;
  if (!ticketColumns.some((col) => col.name === 'work_item_ref')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN work_item_ref TEXT`);
  }
  if (!ticketColumns.some((col) => col.name === 'issue_description')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN issue_description TEXT`);
  }
  if (!ticketColumns.some((col) => col.name === 'considered_fixes')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN considered_fixes TEXT`);
  }

  // --- Add cycle link and traceability to features (FR-052, DD-21, DD-22) ---
  const featureColumns = db.prepare(`PRAGMA table_info(features)`).all() as Array<{ name: string }>;
  if (!featureColumns.some((col) => col.name === 'cycle_id')) {
    db.exec(`ALTER TABLE features ADD COLUMN cycle_id TEXT`);
  }
  if (!featureColumns.some((col) => col.name === 'traceability_report')) {
    db.exec(`ALTER TABLE features ADD COLUMN traceability_report TEXT`);
  }

  // --- Image attachments table (FR-072) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_attachments (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('feature_request', 'bug')),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_image_attachments_entity
      ON image_attachments(entity_id, entity_type);
  `);

  logger.info('Database migrations complete');
}
