// Verifies: FR-022
import React from 'react'
import { NavLink } from 'react-router-dom'

interface SidebarProps {
  activeBugs: number
  pendingFRs: number
}

interface NavItem {
  path: string
  label: string
  badge?: number
  icon: string
}

export function Sidebar({ activeBugs, pendingFRs }: SidebarProps) {
  const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: '🏠' },
    { path: '/feature-requests', label: 'Feature Requests', icon: '✨', badge: pendingFRs },
    { path: '/bugs', label: 'Bug Reports', icon: '🐛', badge: activeBugs },
    { path: '/cycle', label: 'Orchestrator', icon: '⚡' }, // Verifies: FR-076
    { path: '/features', label: 'Feature Browser', icon: '📦' },
    { path: '/learnings', label: 'Learnings', icon: '📚' },
  ]

  return (
    <nav className="w-64 bg-gray-900 text-white flex flex-col h-full min-h-screen">
      <div className="px-6 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-white">Dev Workflow</h1>
        <p className="text-xs text-gray-400 mt-0.5">Platform</p>
      </div>
      <ul className="flex-1 py-4 space-y-1 px-3">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <span className="flex items-center gap-2">
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {item.badge}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="px-6 py-4 border-t border-gray-700 text-xs text-gray-500">
        Dev Workflow Platform v1.0
      </div>
    </nav>
  )
}
