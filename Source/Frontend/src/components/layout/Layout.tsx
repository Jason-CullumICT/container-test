// Verifies: FR-022
import React, { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { dashboard } from '../../api/client'

export function Layout() {
  const [activeBugs, setActiveBugs] = useState(0)
  const [pendingFRs, setPendingFRs] = useState(0)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const summaryRes = await dashboard.getSummary()

        // Count active bugs (reported + triaged + in_development)
        const bugCounts = summaryRes.bugs.by_status
        const active = (bugCounts.reported ?? 0) + (bugCounts.triaged ?? 0) + (bugCounts.in_development ?? 0)
        setActiveBugs(active)

        // Count all pending FRs (potential + voting)
        const frCounts = summaryRes.feature_requests
        const pending = (frCounts.potential ?? 0) + (frCounts.voting ?? 0)
        setPendingFRs(pending)
      } catch {
        // Badge counts are non-critical; fail silently
      }
    }

    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        activeBugs={activeBugs}
        pendingFRs={pendingFRs}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
