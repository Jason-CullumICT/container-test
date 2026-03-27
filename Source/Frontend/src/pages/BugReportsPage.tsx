// Verifies: FR-026
import React, { useState, useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { BugList } from '../components/bugs/BugList'
import { BugForm } from '../components/bugs/BugForm'
import { BugDetail } from '../components/bugs/BugDetail'
import { useApi } from '../hooks/useApi'
import { bugs, images, orchestrator } from '../api/client'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchSubmitting, setBatchSubmitting] = useState(false)

  const fetchFn = useCallback(
    () => bugs.list({
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
    }),
    [statusFilter, severityFilter]
  )

  const { data, loading, error, refetch } = useApi(fetchFn, [statusFilter, severityFilter])

  // Verifies: FR-083
  const handleCreate = async (input: Parameters<typeof bugs.create>[0], imageFiles: File[], targetRepo?: string) => {
    const created = await bugs.create({ ...input, target_repo: targetRepo })
    if (imageFiles.length > 0) {
      await images.upload('bugs', created.id, imageFiles)
    }
    setShowForm(false)
    refetch()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedBugs = (data?.data ?? []).filter((b) => selectedIds.has(b.id))

  const handleBatchSubmit = async () => {
    if (selectedBugs.length === 0) return
    setBatchSubmitting(true)
    try {
      const groups = new Map<string, typeof selectedBugs>()
      for (const bug of selectedBugs) {
        const repo = bug.target_repo || "https://github.com/Jason-CullumICT/container-test"
        if (!groups.has(repo)) groups.set(repo, [])
        groups.get(repo)!.push(bug)
      }
      for (const [repo, bugGroup] of groups) {
        const nl = String.fromCharCode(10)
        let task: string
        if (bugGroup.length === 1) {
          const b = bugGroup[0]
          task = "Fix bug: " + b.title + nl + nl + b.description + nl + nl + "Severity: " + b.severity
        } else {
          const lines = bugGroup.map((b: any) =>
            "- [" + b.id + "] " + b.title + " (severity: " + b.severity + ")" + nl + "  " + b.description
          ).join(nl + nl)
          task = "Fix " + bugGroup.length + " bugs:" + nl + nl + lines
        }
        await orchestrator.submitWork(task, { repo })
      }

            setSelectedIds(new Set())
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit bugs")
    } finally {
      setBatchSubmitting(false)
    }
  }

  return (
    <div>
      <Header
        title="Bug Reports"
        subtitle="Track and manage bug reports"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds((prev) => {
                if (prev.size > 0) return new Set()
                return new Set((data?.data ?? []).filter((b) => b.status === "reported" || b.status === "triaged").map((b) => b.id))
              })}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {selectedIds.size > 0 ? "Deselect All" : "Select Bugs"}
            </button>
            <button
              onClick={() => { setShowForm(true); setSelectedBug(null) }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              + Report Bug
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${statusFilter ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${severityFilter ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300'}`}
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
            onUpdate={(updated) => { setSelectedBug(updated); refetch() }}
            onClose={() => setSelectedBug(null)}
          />
        )}

        {/* Batch action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <span className="text-sm text-blue-700 font-medium">
              {selectedIds.size} bug{selectedIds.size > 1 ? "s" : ""} selected
              {(() => {
                const repos = new Set(selectedBugs.map((b) => b.target_repo || "container-test"))
                return repos.size > 1 ? ` across ${repos.size} repos` : ""
              })()}
            </span>
            <button
              onClick={handleBatchSubmit}
              disabled={batchSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {batchSubmitting ? "Submitting..." : `Submit ${selectedIds.size} to Orchestrator`}
            </button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-3 text-sm text-gray-500">Loading bug reports...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load bug reports: {error}
          </div>
        ) : (
          <BugList
            items={data?.data ?? []}
            onSelect={(bug) => { setSelectedBug(bug); setShowForm(false) }}
            selectable={selectedIds.size > 0}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
        )}
      </div>
    </div>
  )
}
