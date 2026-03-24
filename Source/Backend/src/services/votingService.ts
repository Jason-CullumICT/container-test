// Verifies: FR-010
// AI voting simulation service.
// Generates ≥3 agent votes (approve/deny + comment), computes majority.
// FR stays in 'voting' status after voting (DD-1). Majority is advisory only.
// Accepts optional random function for testability (injectable randomness).

import { v4 as uuidv4 } from 'uuid';
import type { Vote, VoteDecision } from '../../../Shared/types';

export interface VoteSimulatorOptions {
  /** Injectable random function, defaults to Math.random. Must return [0,1). */
  random?: () => number;
}

interface AgentProfile {
  name: string;
  approveThreshold: number; // if random() < this, agent votes approve
  approveComments: string[];
  denyComments: string[];
}

const AGENT_PROFILES: AgentProfile[] = [
  {
    name: 'TechFeasibilityAgent',
    approveThreshold: 0.65,
    approveComments: [
      'This feature is technically feasible with the current architecture.',
      'Implementation complexity is manageable within one sprint.',
      'The technical approach aligns with existing patterns in the codebase.',
    ],
    denyComments: [
      'This would require significant refactoring of core components.',
      'The technical debt introduced outweighs the benefit.',
      'Current infrastructure cannot support this without major changes.',
    ],
  },
  {
    name: 'BusinessValueAgent',
    approveThreshold: 0.60,
    approveComments: [
      'Clear business value with measurable user impact.',
      'Aligns with product roadmap and strategic goals.',
      'High demand from customers — this would reduce support tickets.',
    ],
    denyComments: [
      'Business impact is unclear or insufficiently justified.',
      'Similar functionality already exists in a competing product we integrate with.',
      'User research does not support prioritizing this over other items.',
    ],
  },
  {
    name: 'SecurityReviewAgent',
    approveThreshold: 0.70,
    approveComments: [
      'No obvious security concerns identified.',
      'Feature follows established security patterns; standard review sufficient.',
      'Security surface area is small and well-understood.',
    ],
    denyComments: [
      'This feature introduces unacceptable security risk without additional controls.',
      'Requires threat modeling before proceeding.',
      'Data handling in this request could expose sensitive information.',
    ],
  },
  {
    name: 'UserImpactAgent',
    approveThreshold: 0.68,
    approveComments: [
      'Significant improvement to user workflow efficiency.',
      'Reduces friction in a high-frequency user task.',
      'Strong positive sentiment from user feedback sessions.',
    ],
    denyComments: [
      'Edge case feature — affects less than 5% of user base.',
      'Similar user need could be met by documenting existing functionality.',
      'Risk of increasing UI complexity for minimal gain.',
    ],
  },
  {
    name: 'ResourceCostAgent',
    approveThreshold: 0.62,
    approveComments: [
      'Resource investment is proportional to expected value.',
      'Can be implemented incrementally with low upfront cost.',
      'Leverages existing infrastructure — minimal additional overhead.',
    ],
    denyComments: [
      'Estimated effort significantly exceeds expected return.',
      'Ongoing maintenance cost would strain the team.',
      'Requires dedicated infrastructure that is not budgeted.',
    ],
  },
];

export interface SimulatedVoteResult {
  votes: Omit<Vote, 'id' | 'created_at'>[];
  majority: VoteDecision;
  approveCount: number;
  denyCount: number;
}

/**
 * Simulate AI agent voting on a feature request.
 * Generates exactly 5 votes (one per agent profile, always ≥3 as required).
 * Injectable random function enables deterministic tests.
 */
export function simulateVoting(
  featureRequestId: string,
  options: VoteSimulatorOptions = {}
): SimulatedVoteResult {
  const rng = options.random ?? Math.random;

  const votes: Omit<Vote, 'id' | 'created_at'>[] = AGENT_PROFILES.map((agent) => {
    const roll = rng();
    const decision: VoteDecision = roll < agent.approveThreshold ? 'approve' : 'deny';

    const commentPool = decision === 'approve' ? agent.approveComments : agent.denyComments;
    const commentIndex = Math.floor(rng() * commentPool.length);
    const comment = commentPool[commentIndex];

    return {
      feature_request_id: featureRequestId,
      agent_name: agent.name,
      decision,
      comment,
    };
  });

  const approveCount = votes.filter((v) => v.decision === 'approve').length;
  const denyCount = votes.length - approveCount;
  const majority: VoteDecision = approveCount > denyCount ? 'approve' : 'deny';

  return { votes, majority, approveCount, denyCount };
}

/**
 * Build Vote records with IDs and timestamps from simulation results.
 */
export function buildVoteRecords(
  simResult: SimulatedVoteResult,
  now: string
): Vote[] {
  return simResult.votes.map((v) => ({
    ...v,
    id: uuidv4(),
    created_at: now,
  }));
}
