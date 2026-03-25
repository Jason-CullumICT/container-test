// Verifies: FR-025
import React, { useState, useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { FeatureRequestList } from '../components/feature-requests/FeatureRequestList'
import { FeatureRequestForm } from '../components/feature-requests/FeatureRequestForm'
import { FeatureRequestDetail } from '../components/feature-requests/FeatureRequestDetail'
import { useApi } from '../hooks/useApi'
import { featureRequests, images } from '../api/client'
import type { FeatureRequest } from '../../../Shared/types'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'potential', label: 'Potential' },
  { value: 'voting', label: 'Voting' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'in_development', label: 'In Development' },
  { value: 'completed', label: 'Completed' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'zendesk', label: 'Zendesk' },
  { value: 'competitor_analysis', label: 'Competitor Analysis' },
  { value: 'code_review', label: 'Code Review' },
]

export function FeatureRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedFR, setSelectedFR] = useState<FeatureRequest | null>(null)

  const fetchFn = useCallback(
    () => featureRequests.list({
      status: statusFilter || undefined,
      source: sourceFilter || undefined,
    }),
    [statusFilter, sourceFilter]
  )

  const { data, loading, error, refetch } = useApi(fetchFn, [statusFilter, sourceFilter])

  // Verifies: FR-082
  const handleCreate = async (input: Parameters<typeof featureRequests.create>[0], imageFiles: File[]) => {
    const created = await featureRequests.create(input)
    if (imageFiles.length > 0) {
      await images.upload('feature-requests', created.id, imageFiles)
    }
    setShowForm(false)
    refetch()
  }

  const handleUpdate = (updated: FeatureRequest) => {
    setSelectedFR(updated)
    refetch()
  }

  return (
    <div>
      <Header
        title="Feature Requests"
        subtitle="Manage and track feature requests through the pipeline"
        actions={
          <button
            onClick={() => { setShowForm(true); setSelectedFR(null) }}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            + New Feature Request
          </button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              New Feature Request
            </h3>
            <FeatureRequestForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Detail View */}
        {selectedFR && (
          <FeatureRequestDetail
            fr={selectedFR}
            onUpdate={handleUpdate}
            onClose={() => setSelectedFR(null)}
          />
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load feature requests: {error}
          </div>
        ) : (
          <FeatureRequestList
            items={data?.data ?? []}
            onSelect={(fr) => { setSelectedFR(fr); setShowForm(false) }}
          />
        )}
      </div>
    </div>
  )
}
