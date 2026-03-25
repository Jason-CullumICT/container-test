// Verifies: FR-026
// Verifies: FR-083
import React, { useState } from 'react'
import type { CreateBugInput } from '../../../../Shared/api'
import { ImageUpload } from '../common/ImageUpload'

interface BugFormProps {
  onSubmit: (input: CreateBugInput, imageFiles: File[]) => Promise<void>
  onCancel: () => void
}

export function BugForm({ onSubmit, onCancel }: BugFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [sourceSystem, setSourceSystem] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        severity,
        source_system: sourceSystem.trim() || undefined,
      }, imageFiles)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bug report')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief description of the bug"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Steps to reproduce, expected vs actual behavior"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Severity <span className="text-red-500">*</span>
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source System</label>
          <input
            type="text"
            value={sourceSystem}
            onChange={(e) => setSourceSystem(e.target.value)}
            placeholder="e.g. production, staging"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {/* FR-083: Image upload for bug reports */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Screenshots
        </label>
        <ImageUpload onFilesSelected={setImageFiles} disabled={submitting} />
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Report Bug'}
        </button>
      </div>
    </form>
  )
}
