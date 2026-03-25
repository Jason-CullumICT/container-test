// Verifies: FR-025
// Verifies: FR-084
// Verifies: FR-087
import React, { useState, useEffect, useCallback } from 'react'
import type { FeatureRequest, ImageAttachment } from '../../../../Shared/types'
import { VoteResults } from './VoteResults'
import { featureRequests, images, orchestrator } from '../../api/client'
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
  in_development: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-purple-100 text-purple-700',
}

export function FeatureRequestDetail({ fr, onUpdate, onClose }: FeatureRequestDetailProps) {
  const [loading, setLoading] = useState(false)
  const [denyComment, setDenyComment] = useState('')
  const [showDenyForm, setShowDenyForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [submittingToOrch, setSubmittingToOrch] = useState(false)

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
      await orchestrator.submitWork(
        `Implement feature: ${fr.title}\n\n${fr.description}`,
        { images: imageFiles.length > 0 ? imageFiles : undefined }
      )
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
        {/* FR-087: Submit approved FR to orchestrator with images */}
        {fr.status === 'approved' && (
          <button
            onClick={handleSubmitToOrchestrator}
            disabled={submittingToOrch}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {submittingToOrch ? 'Submitting...' : 'Submit to Orchestrator'}
          </button>
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
