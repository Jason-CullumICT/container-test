// Verifies: FR-001
// API request/response wrappers for the Development Workflow Platform

import type {
  FeatureRequest, Vote, BugReport, DevelopmentCycle, Ticket,
  Learning, Feature, DashboardSummary, ActivityItem,
  PipelineRun, PipelineStage, CycleFeedback, ConsideredFix,
  ImageAttachment
} from './types';

// --- Generic Wrappers ---
export interface DataResponse<T> {
  data: T[];
}

export interface ApiErrorResponse {
  error: string;
}

// --- Feature Requests ---
export type FeatureRequestListResponse = DataResponse<FeatureRequest>;
export type FeatureRequestResponse = FeatureRequest;

export interface CreateFeatureRequestInput {
  title: string;
  description: string;
  source?: string;        // defaults to 'manual'
  priority?: string;      // defaults to 'medium'
}

export interface UpdateFeatureRequestInput {
  status?: string;
  description?: string;
  priority?: string;
}

export interface DenyFeatureRequestInput {
  comment: string;
}

// --- Bug Reports ---
export type BugListResponse = DataResponse<BugReport>;
export type BugResponse = BugReport;

export interface CreateBugInput {
  title: string;
  description: string;
  severity: string;
  source_system?: string;
  related_work_item_id?: string;             // FR-051
  related_work_item_type?: string;           // FR-051 — 'feature_request' | 'bug'
  related_cycle_id?: string;                 // FR-051
}

export interface UpdateBugInput {
  title?: string;
  description?: string;
  severity?: string;
  status?: string;
  source_system?: string;
}

// --- Development Cycles ---
export type CycleListResponse = DataResponse<DevelopmentCycle>;
export type CycleResponse = DevelopmentCycle;

export interface UpdateCycleInput {
  status?: string;
  spec_changes?: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  assignee?: string;
  work_item_ref?: string;                    // FR-051
  issue_description?: string;                // FR-051
  considered_fixes?: ConsideredFix[];        // FR-051 — JSON array
}

export interface UpdateTicketInput {
  status?: string;
  title?: string;
  description?: string;
  assignee?: string;
}

// --- Dashboard ---
export type DashboardSummaryResponse = DashboardSummary;
export type DashboardActivityResponse = DataResponse<ActivityItem>;

// --- Learnings ---
export type LearningListResponse = DataResponse<Learning>;

export interface CreateLearningInput {
  cycle_id: string;
  content: string;
  category: string;   // 'process' | 'technical' | 'domain'
}

// --- Features ---
export type FeatureListResponse = DataResponse<Feature>;

// --- Features (FR-051) ---
export interface CreateFeatureInput {
  title: string;
  description: string;
  source_work_item_id: string;
  cycle_id?: string;                         // FR-051 (DD-22)
  traceability_report?: string;              // FR-051 (DD-21)
}

// --- Cycle Feedback (FR-051) ---
export type CycleFeedbackListResponse = DataResponse<CycleFeedback>;
export type CycleFeedbackResponse = CycleFeedback;

export interface CreateCycleFeedbackInput {
  ticket_id?: string;                        // optional — may be cycle-level
  agent_role: string;
  team?: string;                             // defaults to 'TheATeam'
  feedback_type: 'rejection' | 'finding' | 'suggestion' | 'approval';
  content: string;
}

// --- Image Attachments (FR-071) ---
export type ImageAttachmentListResponse = DataResponse<ImageAttachment>;
export type ImageUploadResponse = DataResponse<ImageAttachment>;

// --- Pipeline Runs (FR-034) ---
export type PipelineRunListResponse = DataResponse<PipelineRun>;
export type PipelineRunResponse = PipelineRun;

export interface CompleteStageInput {
  verdict: 'approved' | 'rejected';
  feedback?: Array<{                         // FR-051 (DD-23)
    ticket_id?: string;
    agent_role: string;
    feedback_type: 'rejection' | 'finding' | 'suggestion' | 'approval';
    content: string;
  }>;
}
