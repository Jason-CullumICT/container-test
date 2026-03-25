// Verifies: FR-080
// Verifies: FR-081
// Verifies: FR-086
// Verifies: FR-089
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageUpload } from '../src/components/common/ImageUpload'
import { ImageThumbnails } from '../src/components/common/ImageThumbnails'
import type { ImageAttachment } from '../../Shared/types'

// Mock URL.createObjectURL / revokeObjectURL for jsdom
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
Object.defineProperty(globalThis.URL, 'createObjectURL', { value: mockCreateObjectURL })
Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: mockRevokeObjectURL })

function createMockFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size)
  return new File([content], name, { type })
}

// --- ImageUpload Tests (FR-080) ---

describe('ImageUpload', () => {
  let onFilesSelected: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    onFilesSelected = vi.fn()
  })

  // Verifies: FR-080
  it('renders drop zone with upload instructions', () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument()
    expect(screen.getByTestId('file-input')).toBeInTheDocument()
    expect(screen.getByText(/drop images here/i)).toBeInTheDocument()
  })

  // Verifies: FR-080
  it('renders with custom max files and size text', () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} maxFiles={3} maxSizeMB={2} />)
    expect(screen.getByText(/Max 3 files/)).toBeInTheDocument()
    expect(screen.getByText(/2MB each/)).toBeInTheDocument()
  })

  // Verifies: FR-080
  it('calls onFilesSelected when valid files are added via file input', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement

    const file = createMockFile('test.png', 1024, 'image/png')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalled()
      const calledFiles = onFilesSelected.mock.calls[0][0]
      expect(calledFiles).toHaveLength(1)
      expect(calledFiles[0].name).toBe('test.png')
    })
  })

  // Verifies: FR-080
  it('shows preview after files are selected', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement

    const file = createMockFile('screenshot.png', 1024, 'image/png')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('preview-grid')).toBeInTheDocument()
    })
  })

  // Verifies: FR-080
  it('rejects files with invalid MIME type', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement

    const file = createMockFile('doc.pdf', 1024, 'application/pdf')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
      expect(screen.getByTestId('upload-error').textContent).toContain('Invalid file type')
    })
  })

  // Verifies: FR-080
  it('rejects files that exceed max size', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} maxSizeMB={1} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement

    const file = createMockFile('big.png', 2 * 1024 * 1024, 'image/png')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
      expect(screen.getByTestId('upload-error').textContent).toContain('File too large')
    })
  })

  // Verifies: FR-080
  it('handles drag and drop', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const dropZone = screen.getByTestId('drop-zone')

    const file = createMockFile('dropped.jpg', 1024, 'image/jpeg')
    const dataTransfer = { files: [file] }

    fireEvent.dragOver(dropZone, { dataTransfer })
    fireEvent.drop(dropZone, { dataTransfer })

    await waitFor(() => {
      expect(onFilesSelected).toHaveBeenCalled()
    })
  })

  // Verifies: FR-080
  it('does not process files when disabled', () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} disabled />)
    const dropZone = screen.getByTestId('drop-zone')

    const file = createMockFile('test.png', 1024, 'image/png')
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    expect(onFilesSelected).not.toHaveBeenCalled()
  })

  // Verifies: FR-080
  it('enforces max files limit', async () => {
    render(<ImageUpload onFilesSelected={onFilesSelected} maxFiles={2} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement

    const files = [
      createMockFile('a.png', 100, 'image/png'),
      createMockFile('b.png', 100, 'image/png'),
      createMockFile('c.png', 100, 'image/png'),
    ]
    fireEvent.change(input, { target: { files } })

    await waitFor(() => {
      expect(screen.getByTestId('upload-error')).toBeInTheDocument()
      expect(screen.getByTestId('upload-error').textContent).toContain('Maximum 2 files')
    })
  })
})

// --- ImageThumbnails Tests (FR-081) ---

const mockImages: ImageAttachment[] = [
  {
    id: 'IMG-0001',
    entity_id: 'FR-0001',
    entity_type: 'feature_request',
    filename: 'abc123.png',
    original_name: 'mockup.png',
    mime_type: 'image/png',
    size_bytes: 2048,
    created_at: '2026-03-25T00:00:00Z',
  },
  {
    id: 'IMG-0002',
    entity_id: 'FR-0001',
    entity_type: 'feature_request',
    filename: 'def456.jpg',
    original_name: 'screenshot.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 4096,
    created_at: '2026-03-25T00:01:00Z',
  },
]

describe('ImageThumbnails', () => {
  // Verifies: FR-081
  it('renders nothing when images array is empty', () => {
    const { container } = render(<ImageThumbnails images={[]} />)
    expect(container.innerHTML).toBe('')
  })

  // Verifies: FR-081
  it('renders thumbnails for each image', () => {
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.getByTestId('image-thumbnails')).toBeInTheDocument()
    expect(screen.getByAltText('mockup.png')).toBeInTheDocument()
    expect(screen.getByAltText('screenshot.jpg')).toBeInTheDocument()
  })

  // Verifies: FR-081
  it('links each thumbnail to full-size image URL', () => {
    render(<ImageThumbnails images={mockImages} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/uploads/abc123.png')
    expect(links[1]).toHaveAttribute('href', '/uploads/def456.jpg')
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  // Verifies: FR-081
  it('shows original filename text', () => {
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.getByText('mockup.png')).toBeInTheDocument()
    expect(screen.getByText('screenshot.jpg')).toBeInTheDocument()
  })

  // Verifies: FR-081
  it('does not show delete buttons when allowDelete is false', () => {
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.queryByTestId('delete-image-IMG-0001')).not.toBeInTheDocument()
  })

  // Verifies: FR-081
  it('shows delete buttons when allowDelete is true', () => {
    const onDelete = vi.fn()
    render(<ImageThumbnails images={mockImages} allowDelete onDelete={onDelete} />)
    expect(screen.getByTestId('delete-image-IMG-0001')).toBeInTheDocument()
    expect(screen.getByTestId('delete-image-IMG-0002')).toBeInTheDocument()
  })

  // Verifies: FR-081
  it('calls onDelete with image id when delete button clicked', () => {
    const onDelete = vi.fn()
    render(<ImageThumbnails images={mockImages} allowDelete onDelete={onDelete} />)

    fireEvent.click(screen.getByTestId('delete-image-IMG-0001'))
    expect(onDelete).toHaveBeenCalledWith('IMG-0001')
  })
})

// --- API Client Tests (FR-086) ---

describe('images API client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // Verifies: FR-086
  it('exports images namespace with upload, list, delete methods', async () => {
    // Import the actual module to verify exports exist
    const client = await import('../src/api/client')
    expect(client.images).toBeDefined()
    expect(typeof client.images.upload).toBe('function')
    expect(typeof client.images.list).toBe('function')
    expect(typeof client.images.delete).toBe('function')
  })

  // Verifies: FR-086
  it('exports orchestrator.submitWork that accepts images option', async () => {
    const client = await import('../src/api/client')
    expect(client.orchestrator).toBeDefined()
    expect(typeof client.orchestrator.submitWork).toBe('function')
  })

  // Verifies: FR-086
  it('images.upload sends FormData with files', async () => {
    const mockResponse = { data: [{ id: 'IMG-0001' }] }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const client = await import('../src/api/client')
    const file = createMockFile('test.png', 1024, 'image/png')
    const result = await client.images.upload('feature-requests', 'FR-0001', [file])

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/feature-requests/FR-0001/images',
      expect.objectContaining({ method: 'POST' })
    )
    // Verify FormData was used (body should be FormData)
    const callBody = fetchSpy.mock.calls[0][1]?.body
    expect(callBody).toBeInstanceOf(FormData)
    expect(result).toEqual(mockResponse)
  })

  // Verifies: FR-086
  it('images.list fetches images for entity', async () => {
    const mockResponse = { data: [] }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const client = await import('../src/api/client')
    const result = await client.images.list('bugs', 'BUG-0001')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/bugs/BUG-0001/images',
      expect.any(Object)
    )
    expect(result).toEqual(mockResponse)
  })

  // Verifies: FR-086
  it('images.delete sends DELETE request', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
    } as Response)

    const client = await import('../src/api/client')
    await client.images.delete('feature-requests', 'FR-0001', 'IMG-0001')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/feature-requests/FR-0001/images/IMG-0001',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  // Verifies: FR-086
  it('orchestrator.submitWork uses FormData when images provided', async () => {
    const mockResponse = { id: 'run-1', status: 'running', statusUrl: '/runs/1', ports: {}, branch: 'main' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const client = await import('../src/api/client')
    const file = createMockFile('spec.png', 512, 'image/png')
    await client.orchestrator.submitWork('Build feature X', { team: 'TheATeam', images: [file] })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/orchestrator/api/work',
      expect.objectContaining({ method: 'POST' })
    )
    const callBody = fetchSpy.mock.calls[0][1]?.body
    expect(callBody).toBeInstanceOf(FormData)
  })

  // Verifies: FR-086
  it('orchestrator.submitWork uses JSON when no images', async () => {
    const mockResponse = { id: 'run-1', status: 'running', statusUrl: '/runs/1', ports: {}, branch: 'main' }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    } as Response)

    const client = await import('../src/api/client')
    await client.orchestrator.submitWork('Build feature Y', { team: 'TheATeam' })

    const callBody = fetchSpy.mock.calls[0][1]?.body
    expect(typeof callBody).toBe('string')
    expect(JSON.parse(callBody as string)).toEqual({ task: 'Build feature Y', team: 'TheATeam' })
  })
})
