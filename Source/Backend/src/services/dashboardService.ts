// Verifies: FR-017, FR-018
// Dashboard service — aggregations and activity feed.

import Database from 'better-sqlite3';
import type {
  DashboardSummary,
  ActivityItem,
  FeatureRequestStatus,
  BugStatus,
  BugSeverity,
  CycleStatus,
  WorkItemType,
  PipelineRunStatus,
} from '../../../Shared/types';

// --- Dashboard Summary (FR-017) ---

export function getDashboardSummary(db: Database.Database): DashboardSummary {
  // FR counts by status
  const frStatuses: FeatureRequestStatus[] = ['potential', 'voting', 'approved', 'denied', 'in_development', 'completed'];
  const frRows = db.prepare(`SELECT status, COUNT(*) as cnt FROM feature_requests GROUP BY status`).all() as Array<{ status: string; cnt: number }>;
  const frByStatus: Record<string, number> = {};
  for (const s of frStatuses) frByStatus[s] = 0;
  for (const row of frRows) frByStatus[row.status] = row.cnt;

  // Bug counts by status
  const bugStatuses: BugStatus[] = ['reported', 'triaged', 'in_development', 'resolved', 'closed'];
  const bugStatusRows = db.prepare(`SELECT status, COUNT(*) as cnt FROM bugs GROUP BY status`).all() as Array<{ status: string; cnt: number }>;
  const bugsByStatus: Record<string, number> = {};
  for (const s of bugStatuses) bugsByStatus[s] = 0;
  for (const row of bugStatusRows) bugsByStatus[row.status] = row.cnt;

  // Bug counts by severity
  const bugSeverities: BugSeverity[] = ['low', 'medium', 'high', 'critical'];
  const bugSeverityRows = db.prepare(`SELECT severity, COUNT(*) as cnt FROM bugs GROUP BY severity`).all() as Array<{ severity: string; cnt: number }>;
  const bugsBySeverity: Record<string, number> = {};
  for (const s of bugSeverities) bugsBySeverity[s] = 0;
  for (const row of bugSeverityRows) bugsBySeverity[row.severity] = row.cnt;

  // Active cycle (status != 'complete') — FR-042: include pipeline info
  const activeCycleRow = db.prepare(`SELECT id, status, work_item_id, work_item_type, pipeline_run_id FROM cycles WHERE status != 'complete' LIMIT 1`).get() as {
    id: string;
    status: string;
    work_item_id: string;
    work_item_type: string;
    pipeline_run_id: string | null;
  } | undefined;

  let activeCycle: DashboardSummary['active_cycle'] = null;
  if (activeCycleRow) {
    let pipelineStage: number | null = null;
    let pipelineStatus: PipelineRunStatus | null = null;

    if (activeCycleRow.pipeline_run_id) {
      const pipelineRow = db.prepare(`SELECT current_stage, status FROM pipeline_runs WHERE id = ?`).get(activeCycleRow.pipeline_run_id) as {
        current_stage: number;
        status: string;
      } | undefined;
      if (pipelineRow) {
        pipelineStage = pipelineRow.current_stage;
        pipelineStatus = pipelineRow.status as PipelineRunStatus;
      }
    }

    activeCycle = {
      id: activeCycleRow.id,
      status: activeCycleRow.status as CycleStatus,
      work_item_id: activeCycleRow.work_item_id,
      work_item_type: activeCycleRow.work_item_type as WorkItemType,
      pipeline_run_id: activeCycleRow.pipeline_run_id,
      pipeline_stage: pipelineStage,
      pipeline_status: pipelineStatus,
    };
  }

  return {
    feature_requests: frByStatus as Record<FeatureRequestStatus, number>,
    bugs: {
      by_status: bugsByStatus as Record<BugStatus, number>,
      by_severity: bugsBySeverity as Record<BugSeverity, number>,
    },
    active_cycle: activeCycle,
  };
}

// --- Dashboard Activity Feed (FR-018) ---
// Max limit 200 (DD-6), default 20

const MAX_ACTIVITY_LIMIT = 200;
const DEFAULT_ACTIVITY_LIMIT = 20;

export function getDashboardActivity(db: Database.Database, limit?: number): ActivityItem[] {
  // Cap limit (DD-6)
  const effectiveLimit = Math.min(
    limit !== undefined && limit > 0 ? limit : DEFAULT_ACTIVITY_LIMIT,
    MAX_ACTIVITY_LIMIT
  );

  // Query create/update events from all tables
  // We collect events from: feature_requests, bugs, cycles, tickets, learnings, features
  // Each table has created_at; most have updated_at too

  const activities: ActivityItem[] = [];

  // Feature requests
  const frRows = db.prepare(`SELECT id, title, status, created_at, updated_at FROM feature_requests ORDER BY updated_at DESC`).all() as Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of frRows) {
    activities.push({
      type: 'feature_request',
      entity_id: row.id,
      description: `Feature request "${row.title}" is ${row.status}`,
      timestamp: row.updated_at,
    });
    if (row.created_at !== row.updated_at) {
      activities.push({
        type: 'feature_request',
        entity_id: row.id,
        description: `Feature request "${row.title}" was created`,
        timestamp: row.created_at,
      });
    }
  }

  // Bugs
  const bugRows = db.prepare(`SELECT id, title, status, created_at, updated_at FROM bugs ORDER BY updated_at DESC`).all() as Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of bugRows) {
    activities.push({
      type: 'bug',
      entity_id: row.id,
      description: `Bug "${row.title}" is ${row.status}`,
      timestamp: row.updated_at,
    });
    if (row.created_at !== row.updated_at) {
      activities.push({
        type: 'bug',
        entity_id: row.id,
        description: `Bug "${row.title}" was reported`,
        timestamp: row.created_at,
      });
    }
  }

  // Cycles
  const cycleRows = db.prepare(`SELECT id, work_item_id, status, created_at, completed_at FROM cycles ORDER BY created_at DESC`).all() as Array<{
    id: string;
    work_item_id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>;

  for (const row of cycleRows) {
    activities.push({
      type: 'cycle',
      entity_id: row.id,
      description: `Development cycle for ${row.work_item_id} is in ${row.status} phase`,
      timestamp: row.completed_at || row.created_at,
    });
    if (row.completed_at && row.completed_at !== row.created_at) {
      activities.push({
        type: 'cycle',
        entity_id: row.id,
        description: `Development cycle for ${row.work_item_id} was started`,
        timestamp: row.created_at,
      });
    }
  }

  // Tickets
  const ticketRows = db.prepare(`SELECT id, title, status, cycle_id, created_at, updated_at FROM tickets ORDER BY updated_at DESC`).all() as Array<{
    id: string;
    title: string;
    status: string;
    cycle_id: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of ticketRows) {
    activities.push({
      type: 'ticket',
      entity_id: row.id,
      description: `Ticket "${row.title}" is ${row.status}`,
      timestamp: row.updated_at,
    });
    if (row.created_at !== row.updated_at) {
      activities.push({
        type: 'ticket',
        entity_id: row.id,
        description: `Ticket "${row.title}" was created in cycle ${row.cycle_id}`,
        timestamp: row.created_at,
      });
    }
  }

  // Learnings
  const learningRows = db.prepare(`SELECT id, content, category, created_at FROM learnings ORDER BY created_at DESC`).all() as Array<{
    id: string;
    content: string;
    category: string;
    created_at: string;
  }>;

  for (const row of learningRows) {
    activities.push({
      type: 'learning',
      entity_id: row.id,
      description: `Learning (${row.category}): ${row.content.substring(0, 80)}${row.content.length > 80 ? '...' : ''}`,
      timestamp: row.created_at,
    });
  }

  // Features
  const featureRows = db.prepare(`SELECT id, title, created_at FROM features ORDER BY created_at DESC`).all() as Array<{
    id: string;
    title: string;
    created_at: string;
  }>;

  for (const row of featureRows) {
    activities.push({
      type: 'feature',
      entity_id: row.id,
      description: `Feature "${row.title}" was completed and shipped`,
      timestamp: row.created_at,
    });
  }

  // Sort by timestamp descending and apply limit
  activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return activities.slice(0, effectiveLimit);
}
