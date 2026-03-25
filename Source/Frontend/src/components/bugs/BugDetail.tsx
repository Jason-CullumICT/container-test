// Verifies: FR-026
// Verifies: FR-068
// Verifies: FR-085
import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { BugReport, ImageAttachment } from '../../../../Shared/types'
import { images } from '../../api/client'
import { ImageThumbnails } from '../common/ImageThumbnails'
import { ImageUpload } from '../common/ImageUpload'

interface BugDetailProps {
  bug: BugReport
  onClose: () => void
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
}

const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  triaged: 'bg-blue-100 text-blue-700',
  in_development: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}

export function BugDetail({ bug, onClose }: BugDetailProps) {
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([])
  const [error, setError] = useState<string | null>(null)

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
          Screenshots ({attachedImages.length})
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
