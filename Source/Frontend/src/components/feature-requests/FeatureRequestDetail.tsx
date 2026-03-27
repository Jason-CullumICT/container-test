// Verifies: FR-025
// Verifies: FR-084
// Verifies: FR-087
import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { FeatureRequest, ImageAttachment } from '../../../../Shared/types'
import { VoteResults } from './VoteResults'
import { featureRequests, images, orchestrator, repos } from '../../api/client'
import type { OrchestratorRun } from '../orchestrator/types'
import { ImageThumbnails } from '../common/ImageThumbnails'
import { ImageUpload } from '../common/ImageUpload'

interface FeatureRequestDetailProps {
  fr: FeatureRequest
  onUpdate: (updated: FeatureRequest) => void
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  potential: 'bg-gray-100 text-gray-700',
  voting: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
  in_development: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

export function FeatureRequestDetail({ fr, onUpdate, onClose }: FeatureRequestDetailProps) {
  const [loading, setLoading] = useState(false)
  const [denyComment, setDenyComment] = useState('')
  const [showDenyForm, setShowDenyForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [submittingToOrch, setSubmittingToOrch] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState(fr.target_repo || "https://github.com/Jason-CullumICT/container-test")
  const [sessionToken, setSessionToken] = useState("")
  const [tokenLabel, setTokenLabel] = useState("")
  const [customRepo, setCustomRepo] = useState("")
  const [showCustomRepo, setShowCustomRepo] = useState(false)
  const [validatingRepo, setValidatingRepo] = useState(false)
  const [knownRepos, setKnownRepos] = useState<{ name: string; fullName: string; url: string }[]>([])
  // Verifies: FR-UX-001 — track associated orchestrator run for status sync
  const [linkedRun, setLinkedRun] = useState<OrchestratorRun | null>(null)
  const runPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // FR-084: Fetch images on mount and when FR changes
  const fetchImages = useCallback(async () => {
    try {
      const result = await images.list('feature-requests', fr.id)
      setAttachedImages(result.data)
    } catch {
      // Image fetch failure is non-blocking
    }
  }, [fr.id])

  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  useEffect(() => {
    repos.list().then((r) => {
      let repoList = r.data;
      // Ensure the saved target_repo is in the list so the dropdown preserves it
      const saved = fr.target_repo;
      if (saved && !repoList.some((repo) => repo.url === saved)) {
        const name = saved.split("/").pop() || saved;
        const fullName = saved.replace("https://github.com/", "");
        repoList = [{ name, fullName, url: saved }, ...repoList];
      }
      setKnownRepos(repoList);
    }).catch(() => {})
  }, [])

  // Verifies: FR-UX-001 — poll orchestrator runs to sync status with feature request
  useEffect(() => {
    if (fr.status !== 'in_development' && fr.status !== 'completed') {
      setLinkedRun(null)
      return
    }
    const taskPrefix = `Implement feature: ${fr.title}`
    const fetchLinkedRun = async () => {
      try {
        const result = await orchestrator.listRuns()
        const runs = (result.data ?? []) as OrchestratorRun[]
        const match = runs.find((r) => r.task?.startsWith(taskPrefix))
        if (match) {
          setLinkedRun(match)
          // Verifies: FR-UX-001 — auto-sync: if run completed, update feature to completed
          if (fr.status === 'in_development' && match.status === 'complete') {
            try {
              const updated = await featureRequests.update(fr.id, { status: 'completed' })
              onUpdate(updated)
            } catch { /* status update failure is non-blocking */ }
          }
        }
      } catch { /* run fetch failure is non-blocking */ }
    }
    fetchLinkedRun()
    // Only poll actively for in-progress items
    if (fr.status === 'in_development') {
      runPollRef.current = setInterval(fetchLinkedRun, 15000)
    }
    return () => {
      if (runPollRef.current) clearInterval(runPollRef.current)
    }
  }, [fr.id, fr.status, fr.title, onUpdate])

  // FR-084: Handle image upload from detail view
  const handleImageUpload = async (files: File[]) => {
    if (files.length === 0) return
    try {
      await images.upload('feature-requests', fr.id, files)
      fetchImages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images')
    }
  }

  // FR-084: Handle image deletion
  const handleImageDelete = async (imageId: string) => {
    try {
      await images.delete('feature-requests', fr.id, imageId)
      setAttachedImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete image')
    }
  }

  // FR-087: Submit to orchestrator with images
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
      // Verifies: FR-087 — submit with repo selection and images
      await orchestrator.submitWork(
        `Implement feature: ${fr.title}\n\n${fr.description}`,
        { repo: selectedRepo, images: imageFiles.length > 0 ? imageFiles : undefined, claudeSessionToken: sessionToken || undefined, tokenLabel: tokenLabel || undefined }
      )
      // Update feature request status to in_development
      const updated = await featureRequests.update(fr.id, { status: "in_development" })
      onUpdate(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit to orchestrator')
    } finally {
      setSubmittingToOrch(false)
    }
  }

  const handleVote = async () => {
    setLoading(true)
    setError(null)
    try {
      const updated = await featureRequests.vote(fr.id)
      onUpdate(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger voting')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setLoading(true)
    setError(null)
    try {
      const updated = await featureRequests.approve(fr.id)
      onUpdate(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    } finally {
      setLoading(false)
    }
  }

  const handleDeny = async () => {
    if (!denyComment.trim()) {
      setError('A comment is required to deny')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const updated = await featureRequests.deny(fr.id, { comment: denyComment.trim() })
      onUpdate(updated)
      setShowDenyForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny')
    } finally {
      setLoading(false)
    }
  }

  const canVote = fr.status === 'potential'
  const canApprove = fr.status === 'voting'
  const canDeny = fr.status === 'potential' || fr.status === 'voting'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-gray-400">{fr.id}</span>
            {fr.duplicate_warning && (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                ⚠ Possible duplicate
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{fr.title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              STATUS_COLORS[fr.status] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {fr.status.replace('_', ' ')}
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
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{fr.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Source</span>
          <p className="text-gray-700 mt-0.5 capitalize">{fr.source.replace('_', ' ')}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Priority</span>
          <p className="text-gray-700 mt-0.5 capitalize">{fr.priority}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</span>
          <p className="text-gray-700 mt-0.5">{new Date(fr.created_at).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Updated</span>
          <p className="text-gray-700 mt-0.5">{new Date(fr.updated_at).toLocaleString()}</p>
        </div>
      </div>

      {fr.human_approval_comment && (
        <div className="bg-gray-50 rounded-lg p-3 text-sm">
          <span className="font-medium text-gray-600">Approval comment: </span>
          <span className="text-gray-700">{fr.human_approval_comment}</span>
        </div>
      )}

      {/* Verifies: FR-UX-001 — Linked orchestrator run status and traceability */}
      {(fr.status === 'in_development' || fr.status === 'completed') && linkedRun && (
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
          {fr.status === 'in_development' && linkedRun?.status === 'complete' && (
            <button
              onClick={async () => {
                try {
                  const updated = await featureRequests.update(fr.id, { status: 'completed' })
                  onUpdate(updated)
                } catch { /* handled by parent */ }
              }}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              Mark as Completed
            </button>
          )}
          {fr.status === 'in_development' && linkedRun?.status === 'failed' && (
            <button
              onClick={async () => {
                try {
                  const updated = await featureRequests.update(fr.id, { status: 'approved' })
                  onUpdate(updated)
                } catch { /* handled by parent */ }
              }}
              className="mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Reset to Approved (Run Failed)
            </button>
          )}
        </div>
      )}

      {/* FR-084: Image Attachments */}
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
      </div>

      {/* Vote Results */}
      <div>
        <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          AI Vote Results ({fr.votes.length})
        </h4>
        <VoteResults votes={fr.votes} />
      </div>

      {/* Actions */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        {canVote && (
          <button
            onClick={handleVote}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Trigger AI Voting'}
          </button>
        )}
        {canApprove && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Approve'}
          </button>
        )}
        {canDeny && !showDenyForm && (
          <button
            onClick={() => setShowDenyForm(true)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            Deny
          </button>
        )}
        {/* FR-087: Submit approved FR to orchestrator with repo selection */}
        {fr.status === 'approved' && (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Target repo:</label>
              <select
                value={showCustomRepo ? "__custom__" : selectedRepo}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setShowCustomRepo(true)
                  } else {
                    setShowCustomRepo(false)
                    setSelectedRepo(e.target.value)
                  }
                }}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {knownRepos.map((r) => (
                  <option key={r.url} value={r.url}>{r.name}</option>
                ))}
                <option value="__custom__">+ New repo...</option>
              </select>
              {showCustomRepo && (
                <input
                  type="text"
                  value={customRepo}
                  onChange={(e) => setCustomRepo(e.target.value)}
                  placeholder="owner/repo-name"
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
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
              disabled={submittingToOrch || validatingRepo}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 self-start"
            >
              {validatingRepo ? 'Validating repo...' : submittingToOrch ? 'Submitting...' : 'Submit to Orchestrator'}
            </button>
          </div>
        )}
      </div>

      {showDenyForm && (
        <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
          <h4 className="text-sm font-medium text-red-800">Deny Feature Request</h4>
          <textarea
            value={denyComment}
            onChange={(e) => setDenyComment(e.target.value)}
            placeholder="Reason for denial (required)"
            rows={3}
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleDeny}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Deny'}
            </button>
            <button
              onClick={() => { setShowDenyForm(false); setDenyComment('') }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
