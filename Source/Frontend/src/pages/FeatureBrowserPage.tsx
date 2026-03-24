// Verifies: FR-029
import React from 'react'
import { Header } from '../components/layout/Header'
import { FeatureBrowser } from '../components/features/FeatureBrowser'

export function FeatureBrowserPage() {
  return (
    <div>
      <Header
        title="Feature Browser"
        subtitle="Browse completed features delivered through the development pipeline"
      />
      <div className="p-6">
        <FeatureBrowser />
      </div>
    </div>
  )
}
