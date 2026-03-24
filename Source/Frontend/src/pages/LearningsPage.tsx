// Verifies: FR-030
import React, { useState, useCallback } from 'react'
import { Header } from '../components/layout/Header'
import { LearningsList } from '../components/learnings/LearningsList'
import { useApi } from '../hooks/useApi'
import { learnings } from '../api/client'

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'process', label: 'Process' },
  { value: 'technical', label: 'Technical' },
  { value: 'domain', label: 'Domain' },
]

export function LearningsPage() {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [cycleFilter, setCycleFilter] = useState('')
  const [cycleInput, setCycleInput] = useState('')

  const fetchFn = useCallback(
    () => learnings.list({
      category: categoryFilter || undefined,
      cycle_id: cycleFilter || undefined,
    }),
    [categoryFilter, cycleFilter]
  )

  const { data, loading, error } = useApi(fetchFn, [categoryFilter, cycleFilter])

  const handleCycleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCycleFilter(cycleInput.trim())
  }

  return (
    <div>
      <Header
        title="Learnings"
        subtitle="Insights and retrospective notes captured during development cycles"
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <form onSubmit={handleCycleSearch} className="flex gap-2">
            <input
              type="text"
              value={cycleInput}
              onChange={(e) => setCycleInput(e.target.value)}
              placeholder="Filter by cycle ID..."
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Filter
            </button>
            {cycleFilter && (
              <button
                type="button"
                onClick={() => { setCycleFilter(''); setCycleInput('') }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            )}
          </form>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            Failed to load learnings: {error}
          </div>
        ) : (
          <>
            {(data?.data ?? []).length > 0 && (
              <p className="text-sm text-gray-500">
                {data!.data.length} learning{data!.data.length !== 1 ? 's' : ''}
                {categoryFilter && ` in category "${categoryFilter}"`}
                {cycleFilter && ` from cycle ${cycleFilter}`}
              </p>
            )}
            <LearningsList items={data?.data ?? []} />
          </>
        )}
      </div>
    </div>
  )
}
