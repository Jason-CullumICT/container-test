// Verifies: FR-026
// Verifies: FR-068
// Verifies: FR-085
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { BugReport, ImageAttachment } from '../../../../Shared/types'
import { bugs, images, orchestrator, repos } from '../../api/client'
import { ImageThumbnails } from '../common/ImageThumbnails'
import { ImageUpload } from '../common/ImageUpload'
import type { OrchestratorRun } from '../orchestrator/types'

// Verifies: FR-026
interface BugDetailProps {
  bug: BugReport
  onClose: () => void
  onUpdate?: (updated: BugReport) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-gray-100 text-gray-500 border-gray-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  triaged: 'bg-blue-100 text-blue-700',
  in_development: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

export function BugDetail({ bug, onClose, onUpdate }: BugDetailProps) {
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submittingToOrch, setSubmittingToOrch] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState(bug.target_repo || "https://github.com/Jason-CullumICT/container-test")
  const [sessionToken, setSessionToken] = useState("")
  const [tokenLabel, setTokenLabel] = useState("")
  const [knownRepos, setKnownRepos] = useState<{ name: string; url: string }[]>([
    { name: "container-test", url: "https://github.com/Jason-CullumICT/container-test" },
    { name: "claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
  ])
  // Verifies: FR-UX-001 — track associated orchestrator run for status sync
  const [linkedRun, setLinkedRun] = useState<OrchestratorRun | null>(null)
  const runPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Verifies: FR-UX-001 — poll orchestrator runs to sync status with bug report
  useEffect(() => {
    if (bug.status !== 'in_development' && bug.status !== 'resolved') {
      setLinkedRun(null)
      return
    }
    const taskPrefix = `Fix bug: ${bug.title}`
    const fetchLinkedRun = async () => {
      try {
        const result = await orchestrator.listRuns()
        const runs = (result.data ?? []) as OrchestratorRun[]
        const match = runs.find((r) => r.task?.startsWith(taskPrefix))
        if (match) {
          setLinkedRun(match)
          // Verifies: FR-UX-001 — auto-sync: if run completed, update bug to resolved
          if (bug.status === 'in_development' && match.status === 'complete') {
            try {
              const updated = await bugs.update(bug.id, { status: 'resolved' })
              onUpdate?.(updated)
            } catch { /* status update failure is non-blocking */ }
          }
        }
      } catch { /* run fetch failure is non-blocking */ }
    }
    fetchLinkedRun()
    // Only poll actively for in-progress items
    if (bug.status === 'in_development') {
      runPollRef.current = setInterval(fetchLinkedRun, 15000)
    }
    return () => {
      if (runPollRef.current) clearInterval(runPollRef.current)
    }
  }, [bug.id, bug.status, bug.title, onUpdate])

  // FR-085: Fetch images on mount
  const fetchImages = useCallback(async () => {
    try {
      const result = await images.list('bugs', bug.id)
      setAttachedImages(result.data)
    } catch {
      // Image fetch failure is non-blocking
    }
  }, [bug.id])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  useEffect(() => {
    repos.list().then((r) => {
      let repoList = r.data;
      // Ensure the saved target_repo is in the list so the dropdown preserves it
      const saved = bug.target_repo;
      if (saved && !repoList.some((repo) => repo.url === saved)) {
        const name = saved.split("/").pop() || saved;
        const fullName = saved.replace("https://github.com/", "");
        repoList = [{ name, fullName, url: saved }, ...repoList];
      }
      setKnownRepos(repoList);
    }).catch(() => {})
  }, [])

  const handleImageUpload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      await images.upload('bugs', bug.id, files)
      fetchImages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images')
    }
  }

  const handleImageDelete = async (imageId: string) => {
    try {
      await images.delete('bugs', bug.id, imageId)
      setAttachedImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image')
    }
  }

  const handleSubmitToOrchestrator = async () => {
    setSubmittingToOrch(true)
    setError(null)
    try {
      const imageFiles: File[] = []
      for (const img of attachedImages) {
        const res = await fetch(`/uploads/${img.filename}`)
        const blob = await res.blob()
        imageFiles.push(new File([blob], img.original_name, { type: img.mime_type }))
      }
      await orchestrator.submitWork(
        `Fix bug: ${bug.title}

${bug.description}

Severity: ${bug.severity}`,
        { repo: selectedRepo, images: imageFiles.length > 0 ? imageFiles : undefined, claudeSessionToken: sessionToken || undefined, tokenLabel: tokenLabel || undefined }
      )
      // Verifies: FR-026 — Update bug status to in_development on orchestrator submit
      const updated = await bugs.update(bug.id, { status: "in_development" })
      onUpdate?.(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit to orchestrator")
    } finally {
      setSubmittingToOrch(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <span className="text-xs font-mono text-gray-400">{bug.id}</span>
          <h3 className="text-lg font-semibold text-gray-900 mt-0.5">{bug.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              SEVERITY_COLORS[bug.severity] ?? 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {bug.severity} severity
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Description
        </h4>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{bug.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Status</span>
          <div className="mt-0.5">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                STATUS_COLORS[bug.status] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {bug.status.replace('_', ' ')}
            </span>
          </div>
        </div>
        {bug.source_system && (
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Source System
            </span>
            <p className="text-gray-700 mt-0.5">{bug.source_system}</p>
          </div>
        )}
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Reported
          </span>
          <p className="text-gray-700 mt-0.5">{new Date(bug.created_at).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Last Updated
          </span>
          <p className="text-gray-700 mt-0.5">{new Date(bug.updated_at).toLocaleString()}</p>
        </div>
      </div>

      {/* FR-085: Image Attachments */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Attachments ({attachedImages.length})
        </h4>
        <ImageThumbnails
          images={attachedImages}
          allowDelete
          onDelete={handleImageDelete}
        />
        <div className="mt-2">
          <ImageUpload onFilesSelected={handleImageUpload} />
        </div>
        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </div>

      {/* Verifies: FR-UX-001 — Linked orchestrator run status and traceability */}
      {(bug.status === 'in_development' || bug.status === 'resolved') && linkedRun && (
        <div className={`rounded-lg p-4 border ${linkedRun.status === 'complete' ? 'bg-green-50 border-green-200' : linkedRun.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
            Orchestrator Run
          </h4>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-mono text-gray-700">{linkedRun.id.slice(-8)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              linkedRun.status === 'complete' ? 'bg-green-100 text-green-700' :
              linkedRun.status === 'failed' ? 'bg-red-100 text-red-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {linkedRun.status}
            </span>
            {linkedRun.team && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{linkedRun.team}</span>
            )}
            {(linkedRun.status === 'planning' || linkedRun.status === 'implementing' || linkedRun.status === 'qa_running' || linkedRun.status === 'validating') && (
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </div>
          {linkedRun.testResults && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span className="text-gray-600">Tests: <strong>{linkedRun.testResults.total}</strong></span>
              <span className="text-green-700">Passed: <strong>{linkedRun.testResults.passed}</strong></span>
              {linkedRun.testResults.failed > 0 && (
                <span className="text-red-700">Failed: <strong>{linkedRun.testResults.failed}</strong></span>
              )}
            </div>
          )}
          {linkedRun.phases && linkedRun.phases.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {linkedRun.phases.map((p) => (
                <span key={p.phase} className={`px-1.5 py-0.5 rounded ${p.status === 'passed' ? 'bg-green-100 text-green-700' : p.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                  {p.phase}
                </span>
              ))}
            </div>
          )}
          {linkedRun.pr && (
            <div className="mt-2 text-sm">
              <a
                href={linkedRun.pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                PR #{linkedRun.pr.number}
              </a>
              {linkedRun.pr.mergeStatus && (
                <span className="ml-2 text-xs text-gray-500">({linkedRun.pr.mergeStatus})</span>
              )}
              {linkedRun.pr.aiReviewVerdict && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${linkedRun.pr.aiReviewVerdict === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {linkedRun.pr.aiReviewVerdict}
                </span>
              )}
            </div>
          )}
          {/* Verifies: FR-UX-001 — sync status action when run completes */}
          {bug.status === 'in_development' && linkedRun?.status === 'complete' && (
            <button
              onClick={async () => {
                try {
                  const updated = await bugs.update(bug.id, { status: 'resolved' })
                  onUpdate?.(updated)
                } catch { /* handled by parent */ }
              }}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              Mark as Resolved
            </button>
          )}
          {bug.status === 'in_development' && linkedRun?.status === 'failed' && (
            <button
              onClick={async () => {
                try {
                  const updated = await bugs.update(bug.id, { status: 'triaged' })
                  onUpdate?.(updated)
                } catch { /* handled by parent */ }
              }}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Reset to Triaged (Run Failed)
            </button>
          )}
        </div>
      )}

      {/* Submit to orchestrator */}
      {(bug.status === "reported" || bug.status === "triaged") && (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">Target repo:</label>
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {knownRepos.map((r) => (
                <option key={r.url} value={r.url}>{r.name}</option>
              ))}
            </select>
          </div>
                      <div className="flex gap-2 items-end mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Session Token (optional)</label>
                <input
                  type="password"
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  placeholder="sk-ant-oat01-..."
                  className="text-xs font-mono border border-gray-300 rounded-lg px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">Token Label</label>
                <input
                  type="text"
                  value={tokenLabel}
                  onChange={(e) => setTokenLabel(e.target.value)}
                  placeholder="e.g. jason's token"
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
<button
            onClick={handleSubmitToOrchestrator}
            disabled={submittingToOrch}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submittingToOrch ? "Submitting..." : "Submit to Orchestrator"}
          </button>
        </div>
      )}

      {/* FR-068: Related work item and cycle links */}
      {(bug.related_work_item_id || bug.related_cycle_id) && (
        <div className="border-t border-gray-100 pt-4 space-y-2" data-testid="bug-traceability">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Traceability
          </h4>
          <div className="flex flex-wrap gap-3 text-sm">
            {bug.related_work_item_id && (
              <Link
                to={bug.related_work_item_type === 'feature_request' ? '/feature-requests' : '/bugs'}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                data-testid="related-work-item-link"
              >
                <span className="text-xs font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                  {bug.related_work_item_id}
                </span>
                <span className="text-xs text-gray-400">
                  ({bug.related_work_item_type === 'feature_request' ? 'Feature Request' : 'Bug'})
                </span>
              </Link>
            )}
            {bug.related_cycle_id && (
              <Link
                to="/cycle"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                data-testid="related-cycle-link"
              >
                <span className="text-xs font-mono bg-blue-50 px-1.5 py-0.5 rounded">
                  {bug.related_cycle_id}
                </span>
                <span className="text-xs text-gray-400">(Cycle)</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
