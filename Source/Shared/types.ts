// Verifies: FR-001
// Shared domain entity types for the Development Workflow Platform

// --- Enums / Union Types ---

export type FeatureRequestStatus = 'potential' | 'voting' | 'approved' | 'denied' | 'in_development' | 'completed';
export type FeatureRequestSource = 'manual' | 'zendesk' | 'competitor_analysis' | 'code_review';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'reported' | 'triaged' | 'in_development' | 'resolved' | 'closed';
export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CycleStatus = 'spec_changes' | 'ticket_breakdown' | 'implementation' | 'review' | 'smoke_test' | 'complete';
export type TicketStatus = 'pending' | 'in_progress' | 'code_review' | 'testing' | 'security_review' | 'done';
export type VoteDecision = 'approve' | 'deny';
export type LearningCategory = 'process' | 'technical' | 'domain';
export type WorkItemType = 'feature_request' | 'bug';

// --- Domain Entities ---

export interface FeatureRequest {
  id: string;                          // FR-XXXX
  title: string;
  description: string;
  source: FeatureRequestSource;
  status: FeatureRequestStatus;
  priority: Priority;
  votes: Vote[];
  human_approval_comment: string | null;
  human_approval_approved_at: string | null;  // ISO timestamp or null — DD-2
  duplicate_warning: boolean;
  created_at: string;                  // ISO timestamp
  target_repo: string | null;           // Target GitHub repo URL for orchestrator
  updated_at: string;                  // ISO timestamp
}

export interface Vote {
  id: string;
  feature_request_id: string;
  agent_name: string;
  decision: VoteDecision;
  comment: string;
  created_at: string;
}

export interface BugReport {
  id: string;                          // BUG-XXXX
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  source_system: string;
  related_work_item_id: string | null;       // FR-050 (DD-18) — parent FR/bug if raised during a cycle
  related_work_item_type: WorkItemType | null; // FR-050
  related_cycle_id: string | null;            // FR-050
  target_repo: string | null;           // Target GitHub repo URL for orchestrator
  created_at: string;
  updated_at: string;
}

export interface DevelopmentCycle {
  id: string;                          // CYCLE-XXXX
  work_item_id: string;               // FR-XXXX or BUG-XXXX
  work_item_type: WorkItemType;
  status: CycleStatus;
  spec_changes: string | null;
  tickets: Ticket[];
  pipeline_run_id: string | null;     // FR-033 — nullable for backwards compat (DD-17)
  pipeline_run?: PipelineRun;         // FR-033 — hydrated on GET /api/cycles/:id
  feedback: CycleFeedback[];          // FR-050 — hydrated on GET
  team_name: string | null;           // FR-050 — from pipeline_run.team
  created_at: string;
  completed_at: string | null;
}

export interface Ticket {
  id: string;                          // TKT-XXXX
  cycle_id: string;
  title: string;
  description: string;
  status: TicketStatus;
  assignee: string | null;
  work_item_ref: string | null;              // FR-050 (DD-24) — explicit parent FR/bug ID
  issue_description: string | null;          // FR-050 — structured problem analysis
  considered_fixes: ConsideredFix[] | null;  // FR-050 (DD-19) — parsed from JSON
  created_at: string;
  updated_at: string;
}

export interface Learning {
  id: string;
  cycle_id: string;
  content: string;
  category: LearningCategory;
  created_at: string;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  source_work_item_id: string;
  cycle_id: string | null;                   // FR-050 (DD-22)
  traceability_report: string | null;        // FR-050 (DD-21) — JSON traceability report
  created_at: string;
}

// --- Cycle Feedback Types (FR-050) ---

export type CycleFeedbackType = 'rejection' | 'finding' | 'suggestion' | 'approval';

export interface CycleFeedback {
  id: string;                          // CFBK-XXXX
  cycle_id: string;                    // FK → cycles.id
  ticket_id: string | null;            // FK → tickets.id (optional)
  agent_role: string;                  // e.g., 'security-qa', 'qa-review-and-tests'
  team: string;                        // e.g., 'TheATeam'
  feedback_type: CycleFeedbackType;
  content: string;                     // detailed feedback text
  created_at: string;
}

export interface ConsideredFix {
  description: string;
  rationale: string;
  selected: boolean;                   // which fix was chosen
}

// --- Image Attachment Types (FR-070) ---

export type ImageEntityType = 'feature_request' | 'bug';

export interface ImageAttachment {
  id: string;                          // IMG-XXXX
  entity_id: string;                   // FR-XXXX or BUG-XXXX
  entity_type: ImageEntityType;        // 'feature_request' | 'bug'
  filename: string;                    // stored filename (uuid-based)
  original_name: string;               // original upload filename
  mime_type: string;                   // image/jpeg, image/png, image/gif, image/webp
  size_bytes: number;
  created_at: string;                  // ISO timestamp
}

// --- Dashboard Types ---

export interface DashboardSummary {
  feature_requests: Record<FeatureRequestStatus, number>;
  bugs: {
    by_status: Record<BugStatus, number>;
    by_severity: Record<BugSeverity, number>;
  };
  active_cycle: {
    id: string;
    status: CycleStatus;
    work_item_id: string;
    work_item_type: WorkItemType;
    pipeline_run_id: string | null;           // FR-033
    pipeline_stage: number | null;            // FR-033 — current stage number
    pipeline_status: PipelineRunStatus | null; // FR-033
  } | null;
}

export interface ActivityItem {
  type: 'feature_request' | 'bug' | 'cycle' | 'ticket' | 'learning' | 'feature';
  entity_id: string;
  description: string;
  timestamp: string;
}

// --- Pipeline Orchestration Types (FR-033) ---

export type PipelineRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';
export type PipelineStageName = 'requirements' | 'api_contract' | 'implementation' | 'qa' | 'integration';
export type PipelineStageVerdict = 'approved' | 'rejected' | null;

export interface PipelineStage {
  id: string;
  pipeline_run_id: string;
  stage_number: number;           // 1-5
  stage_name: PipelineStageName;
  status: PipelineStageStatus;
  verdict: string | null;         // 'approved' | 'rejected' | null
  agent_ids: string[];            // parsed from JSON
  started_at: string | null;
  completed_at: string | null;
}

export interface PipelineRun {
  id: string;                     // RUN-XXXX
  cycle_id: string;
  team: string;                   // 'TheATeam'
  status: PipelineRunStatus;
  current_stage: number;          // 0 = not started, 1-5 = active stage
  stages_total: number;           // 5
  stages: PipelineStage[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
