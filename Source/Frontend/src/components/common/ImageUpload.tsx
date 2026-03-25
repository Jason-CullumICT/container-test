// Verifies: FR-080
import React, { useState, useRef, useCallback } from 'react'

interface ImageUploadProps {
  onFilesSelected: (files: File[]) => void
  maxFiles?: number
  maxSizeMB?: number
  accept?: string[]
  disabled?: boolean
}

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const DEFAULT_MAX_FILES = 5
const DEFAULT_MAX_SIZE_MB = 5

export function ImageUpload({
  onFilesSelected,
  maxFiles = DEFAULT_MAX_FILES,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}: ImageUploadProps) {
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxSizeBytes = maxSizeMB * 1024 * 1024

  const validateAndAdd = useCallback((incoming: File[]) => {
    setError(null)
    const valid: File[] = []

    for (const file of incoming) {
      if (!accept.includes(file.type)) {
        setError(`Invalid file type: ${file.name}. Allowed: jpeg, png, gif, webp`)
        continue
      }
      if (file.size > maxSizeBytes) {
        setError(`File too large: ${file.name} (max ${maxSizeMB}MB)`)
        continue
      }
      valid.push(file)
    }

    setPreviews((prev) => {
      const combined = [...prev.map((p) => p.file), ...valid]
      if (combined.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`)
        const trimmed = combined.slice(0, maxFiles)
        const newPreviews = trimmed.map((f) => ({ file: f, url: URL.createObjectURL(f) }))
        prev.forEach((p) => URL.revokeObjectURL(p.url))
        onFilesSelected(trimmed)
        return newPreviews
      }
      const newPreviews = [
        ...prev,
        ...valid.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
      ]
      onFilesSelected(newPreviews.map((p) => p.file))
      return newPreviews
    })
  }, [accept, maxFiles, maxSizeBytes, maxSizeMB, onFilesSelected])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files)
    validateAndAdd(files)
  }, [disabled, validateAndAdd])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }, [disabled])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleClick = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      validateAndAdd(Array.from(e.target.files))
      e.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index].url)
      const updated = prev.filter((_, i) => i !== index)
      onFilesSelected(updated.map((p) => p.file))
      return updated
    })
  }

  return (
    <div data-testid="image-upload">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
        role="button"
        aria-label="Upload images"
        data-testid="drop-zone"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept.join(',')}
          multiple
          onChange={handleInputChange}
          className="hidden"
          data-testid="file-input"
        />
        <p className="text-sm text-gray-500">
          Drop images here or click to upload
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Max {maxFiles} files, {maxSizeMB}MB each. JPEG, PNG, GIF, WebP
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-600 mt-1" data-testid="upload-error">{error}</p>
      )}

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2" data-testid="preview-grid">
          {previews.map((p, i) => (
            <div key={p.url} className="relative group w-16 h-16">
              <img
                src={p.url}
                alt={p.file.name}
                className="w-16 h-16 object-cover rounded border border-gray-200"
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${p.file.name}`}
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
