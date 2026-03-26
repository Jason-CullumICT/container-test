import React, { useState, useEffect } from "react"
import { repos } from "../../api/client"

interface RepoSelectorProps {
  value: string
  onChange: (repoUrl: string) => void
  disabled?: boolean
}

export function RepoSelector({ value, onChange, disabled }: RepoSelectorProps) {
  const [knownRepos, setKnownRepos] = useState<{ name: string; fullName: string; url: string }[]>([
    { name: "container-test", fullName: "Jason-CullumICT/container-test", url: "https://github.com/Jason-CullumICT/container-test" },
    { name: "claude-ai-OS", fullName: "Jason-CullumICT/claude-ai-OS", url: "https://github.com/Jason-CullumICT/claude-ai-OS" },
  ])
  const [showCustom, setShowCustom] = useState(false)
  const [customRepo, setCustomRepo] = useState("")
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    repos.list().then((r) => setKnownRepos(r.data)).catch(() => {})
  }, [])

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "__custom__") {
      setShowCustom(true)
    } else {
      setShowCustom(false)
      setError(null)
      onChange(e.target.value)
    }
  }

  const handleValidateCustom = async () => {
    if (!customRepo.trim()) return
    setValidating(true)
    setError(null)
    try {
      const result = await repos.validate(customRepo.trim())
      onChange(result.repo)
      if (result.created) {
        setKnownRepos((prev) => [...prev, { name: result.fullName.split("/")[1], fullName: result.fullName, url: result.repo }])
      }
      setShowCustom(false)
      setCustomRepo("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate repo")
    } finally {
      setValidating(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Target Repository</label>
      <div className="flex items-center gap-2">
        <select
          value={showCustom ? "__custom__" : value}
          onChange={handleSelectChange}
          disabled={disabled}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {knownRepos.map((r) => (
            <option key={r.url} value={r.url}>{r.name}</option>
          ))}
          <option value="__custom__">+ New repo...</option>
        </select>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={customRepo}
            onChange={(e) => setCustomRepo(e.target.value)}
            placeholder="owner/repo-name"
            disabled={validating}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleValidateCustom())}
          />
          <button
            type="button"
            onClick={handleValidateCustom}
            disabled={validating || !customRepo.trim()}
            className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {validating ? "Checking..." : "Use"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
