// Verifies: FR-026
import React, { useState, useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { BugList } from '../components/bugs/BugList'
import { BugForm } from '../components/bugs/BugForm'
import { BugDetail } from '../components/bugs/BugDetail'
import { useApi } from '../hooks/useApi'
import { bugs, images } from '../api/client'
import type { BugReport } from '../../../Shared/types'

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'reported', label: 'Reported' },
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_development', label: 'In Development' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

const SEVERITY_OPTIONS = [
  { value: '', label: 'All Severities' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

export function BugReportsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedBug, setSelectedBug] = useState<BugReport | null>(null)

  const fetchFn = useCallback(
    () => bugs.list({
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
    }),
    [statusFilter, severityFilter]
  )

  const { data, loading, error, refetch } = useApi(fetchFn, [statusFilter, severityFilter])

  // Verifies: FR-083
  const handleCreate = async (input: Parameters<typeof bugs.create>[0], imageFiles: File[]) => {
    const created = await bugs.create(input)
    if (imageFiles.length > 0) {
      await images.upload('bugs', created.id, imageFiles)
    }
    setShowForm(false)
    refetch()
  }

  return (
    <div>
      <Header
        title="Bug Reports"
        subtitle="Track and manage bug reports"
        actions={
          <button
            onClick={() => { setShowForm(true); setSelectedBug(null) }}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
          >
            + Report Bug
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
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Report a Bug</h3>
            <BugForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Detail View */}
        {selectedBug && (
          <BugDetail
            bug={selectedBug}
            onClose={() => setSelectedBug(null)}
          />
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load bug reports: {error}
          </div>
        ) : (
          <BugList
            items={data?.data ?? []}
            onSelect={(bug) => { setSelectedBug(bug); setShowForm(false) }}
          />
        )}
      </div>
    </div>
  )
}
