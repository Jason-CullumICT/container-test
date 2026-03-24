// Verifies: FR-045
// 5-stage pipeline progress stepper with status indicators, agent labels, and verdicts
import React from 'react'
import type { PipelineRun, PipelineStage, PipelineStageName } from '../../../../Shared/types'

interface PipelineStepperProps {
  pipelineRun: PipelineRun
}

const STAGE_LABELS: Record<PipelineStageName, string> = {
  requirements: 'Requirements',
  api_contract: 'API Contract',
  implementation: 'Implementation',
  qa: 'QA',
  integration: 'Integration',
}

const VERDICT_COLORS: Record<string, string> = {
  approved: 'text-green-700 bg-green-50',
  rejected: 'text-red-700 bg-red-50',
}

function StageIcon({ stage }: { stage: PipelineStage }) {
  if (stage.status === 'completed' && stage.verdict === 'approved') {
    return (
      <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-bold">
        &#10003;
      </div>
    )
  }
  if (stage.status === 'failed' || stage.verdict === 'rejected') {
    return (
      <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white text-sm font-bold">
        &#10007;
      </div>
    )
  }
  if (stage.status === 'running') {
    return (
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold animate-pulse">
        {stage.stage_number}
      </div>
    )
  }
  // pending
  return (
    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-bold">
      {stage.stage_number}
    </div>
  )
}

function StageCard({ stage }: { stage: PipelineStage }) {
  const label = STAGE_LABELS[stage.stage_name] ?? stage.stage_name
  const isActive = stage.status === 'running'
  const isCompleted = stage.status === 'completed'
  const isFailed = stage.status === 'failed'

  return (
    <div
      className={`flex flex-col items-center text-center min-w-0 ${
        isActive ? 'opacity-100' : isCompleted || isFailed ? 'opacity-100' : 'opacity-50'
      }`}
    >
      <StageIcon stage={stage} />
      <span
        className={`mt-1.5 text-xs font-medium truncate w-full ${
          isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : isFailed ? 'text-red-700' : 'text-gray-500'
        }`}
      >
        {label}
      </span>
      {/* Agent list */}
      {stage.agent_ids.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {stage.agent_ids.map((agent: string) => (
            <div key={agent} className="text-[10px] text-gray-400 truncate max-w-[100px]">
              {agent}
            </div>
          ))}
        </div>
      )}
      {/* Verdict badge */}
      {stage.verdict && (
        <span
          className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
            VERDICT_COLORS[stage.verdict] ?? 'text-gray-600 bg-gray-50'
          }`}
        >
          {stage.verdict}
        </span>
      )}
    </div>
  )
}

export function PipelineStepper({ pipelineRun }: PipelineStepperProps) {
  const sortedStages = [...pipelineRun.stages].sort((a, b) => a.stage_number - b.stage_number)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4" data-testid="pipeline-stepper">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-gray-700">Pipeline Progress</h4>
          <span className="text-xs text-gray-400">{pipelineRun.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Stage {pipelineRun.current_stage} of {pipelineRun.stages_total}
          </span>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              pipelineRun.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : pipelineRun.status === 'completed'
                ? 'bg-green-100 text-green-700'
                : pipelineRun.status === 'failed'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {pipelineRun.status}
          </span>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="flex items-start justify-between gap-1">
        {sortedStages.map((stage, i) => (
          <React.Fragment key={stage.id}>
            <div className="flex-1 min-w-0">
              <StageCard stage={stage} />
            </div>
            {i < sortedStages.length - 1 && (
              <div className="flex items-center pt-3">
                <div
                  className={`w-6 h-0.5 ${
                    stage.status === 'completed' ? 'bg-green-400' : 'bg-gray-300'
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Team label */}
      <div className="mt-3 text-xs text-gray-400">
        Orchestrated via <span className="font-medium text-gray-500">{pipelineRun.team}</span>
      </div>
    </div>
  )
}
