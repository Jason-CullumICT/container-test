// Verifies: FR-080
// Verifies: FR-081
// Verifies: FR-082
// Verifies: FR-083
// Verifies: FR-084
// Verifies: FR-085
// Verifies: FR-087
// Verifies: FR-089
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ImageUpload } from '../src/components/common/ImageUpload'
import { ImageThumbnails } from '../src/components/common/ImageThumbnails'
import type { ImageAttachment } from '../../Shared/types'

// Mock URL.createObjectURL/revokeObjectURL for test env
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
Object.defineProperty(globalThis, 'URL', {
  value: {
    ...globalThis.URL,
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
})

function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size)
  return new File([buffer], name, { type })
}

// --- ImageUpload Tests ---

describe('ImageUpload', () => {
  let onFilesSelected: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onFilesSelected = vi.fn()
    vi.clearAllMocks()
  })

  it('renders the drop zone with instructions', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    expect(screen.getByText('Drop images here or click to upload')).toBeInTheDocument()
    expect(screen.getByTestId('drop-zone')).toBeInTheDocument()
  })

  it('renders file input with correct accept types', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    expect(input.accept).toBe('image/jpeg,image/png,image/gif,image/webp')
    expect(input.multiple).toBe(true)
  })

  it('calls onFilesSelected when valid files are selected via input', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input')
    const file = createMockFile('test.png', 1024, 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('rejects files with invalid MIME type', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input')
    const file = createMockFile('test.pdf', 1024, 'application/pdf')

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByTestId('upload-error')).toHaveTextContent('Invalid file type')
  })

  it('rejects files exceeding max size', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} maxSizeMB={1} />)
    const input = screen.getByTestId('file-input')
    const file = createMockFile('large.png', 2 * 1024 * 1024, 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByTestId('upload-error')).toHaveTextContent('File too large')
  })

  it('shows preview grid when files are added', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} />)
    const input = screen.getByTestId('file-input')
    const file = createMockFile('test.png', 1024, 'image/png')

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByTestId('preview-grid')).toBeInTheDocument()
  })

  it('respects disabled prop', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} disabled />)
    const zone = screen.getByTestId('drop-zone')
    expect(zone).toHaveClass('cursor-not-allowed')
  })

  it('limits to maxFiles', () => {
    // Verifies: FR-080
    render(<ImageUpload onFilesSelected={onFilesSelected} maxFiles={2} />)
    const input = screen.getByTestId('file-input')
    const files = [
      createMockFile('a.png', 100, 'image/png'),
      createMockFile('b.png', 100, 'image/png'),
      createMockFile('c.png', 100, 'image/png'),
    ]

    fireEvent.change(input, { target: { files } })

    expect(screen.getByTestId('upload-error')).toHaveTextContent('Maximum 2 files allowed')
  })
})

// --- ImageThumbnails Tests ---

const mockImages: ImageAttachment[] = [
  {
    id: 'IMG-0001',
    entity_id: 'FR-0001',
    entity_type: 'feature_request',
    filename: 'abc123.png',
    original_name: 'mockup.png',
    mime_type: 'image/png',
    size_bytes: 1024,
    created_at: new Date().toISOString(),
  },
  {
    id: 'IMG-0002',
    entity_id: 'FR-0001',
    entity_type: 'feature_request',
    filename: 'def456.jpg',
    original_name: 'screenshot.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 2048,
    created_at: new Date().toISOString(),
  },
]

describe('ImageThumbnails', () => {
  it('renders nothing when images array is empty', () => {
    // Verifies: FR-081
    const { container } = render(<ImageThumbnails images={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders thumbnails for provided images', () => {
    // Verifies: FR-081
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.getByTestId('image-thumbnails')).toBeInTheDocument()
    expect(screen.getByAltText('mockup.png')).toBeInTheDocument()
    expect(screen.getByAltText('screenshot.jpg')).toBeInTheDocument()
  })

  it('shows original filename for each image', () => {
    // Verifies: FR-081
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.getByText('mockup.png')).toBeInTheDocument()
    expect(screen.getByText('screenshot.jpg')).toBeInTheDocument()
  })

  it('links images to full-size view in new tab', () => {
    // Verifies: FR-081
    render(<ImageThumbnails images={mockImages} />)
    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/uploads/abc123.png')
    expect(links[0]).toHaveAttribute('target', '_blank')
  })

  it('shows delete buttons when allowDelete is true', () => {
    // Verifies: FR-081
    const onDelete = vi.fn()
    render(<ImageThumbnails images={mockImages} allowDelete onDelete={onDelete} />)
    expect(screen.getByTestId('delete-image-IMG-0001')).toBeInTheDocument()
    expect(screen.getByTestId('delete-image-IMG-0002')).toBeInTheDocument()
  })

  it('does not show delete buttons when allowDelete is false', () => {
    // Verifies: FR-081
    render(<ImageThumbnails images={mockImages} />)
    expect(screen.queryByTestId('delete-image-IMG-0001')).toBeNull()
  })

  it('calls onDelete with image ID when delete button is clicked', () => {
    // Verifies: FR-081
    const onDelete = vi.fn()
    render(<ImageThumbnails images={mockImages} allowDelete onDelete={onDelete} />)
    fireEvent.click(screen.getByTestId('delete-image-IMG-0001'))
    expect(onDelete).toHaveBeenCalledWith('IMG-0001')
  })
})

// --- FeatureRequestForm with ImageUpload Tests ---

vi.mock('../src/api/client', () => ({
  featureRequests: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    vote: vi.fn(),
    approve: vi.fn(),
    deny: vi.fn(),
  },
  bugs: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
  },
  images: {
    upload: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
  orchestrator: {
    submitWork: vi.fn(),
  },
}))

import { featureRequests, bugs, images as imagesApi, orchestrator } from '../src/api/client'
import { FeatureRequestForm } from '../src/components/feature-requests/FeatureRequestForm'
import { BugForm } from '../src/components/bugs/BugForm'
import { FeatureRequestDetail } from '../src/components/feature-requests/FeatureRequestDetail'
import { BugDetail } from '../src/components/bugs/BugDetail'
import type { FeatureRequest, BugReport } from '../../Shared/types'

describe('FeatureRequestForm with image upload', () => {
  it('renders image upload component in the form', () => {
    // Verifies: FR-082
    const onSubmit = vi.fn()
    render(<FeatureRequestForm onSubmit={onSubmit} onCancel={() => {}} />)
    expect(screen.getByText('Attachments')).toBeInTheDocument()
    expect(screen.getByTestId('image-upload')).toBeInTheDocument()
  })

  it('passes image files to onSubmit callback', async () => {
    // Verifies: FR-082
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<FeatureRequestForm onSubmit={onSubmit} onCancel={() => {}} />)

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('Brief description of the feature'), {
      target: { value: 'Test feature' },
    })
    fireEvent.change(screen.getByPlaceholderText('Detailed description of what you need and why'), {
      target: { value: 'Test description' },
    })

    // Add an image
    const fileInput = screen.getByTestId('file-input')
    const file = createMockFile('mockup.png', 1024, 'image/png')
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Submit
    fireEvent.click(screen.getByText('Create Feature Request'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test feature' }),
        [file]
      )
    })
  })
})

describe('BugForm with image upload', () => {
  it('renders image upload component in the form', () => {
    // Verifies: FR-083
    const onSubmit = vi.fn()
    render(<BugForm onSubmit={onSubmit} onCancel={() => {}} />)
    expect(screen.getByText('Screenshots')).toBeInTheDocument()
    expect(screen.getByTestId('image-upload')).toBeInTheDocument()
  })

  it('passes image files to onSubmit callback', async () => {
    // Verifies: FR-083
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BugForm onSubmit={onSubmit} onCancel={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('Brief description of the bug'), {
      target: { value: 'Test bug' },
    })
    fireEvent.change(screen.getByPlaceholderText('Steps to reproduce, expected vs actual behavior'), {
      target: { value: 'Bug description' },
    })

    const fileInput = screen.getByTestId('file-input')
    const file = createMockFile('screenshot.png', 1024, 'image/png')
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('Report Bug'))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test bug' }),
        [file]
      )
    })
  })
})

// --- FeatureRequestDetail with images ---

const mockFR: FeatureRequest = {
  id: 'FR-0001',
  title: 'Test feature',
  description: 'A test feature request',
  source: 'manual',
  status: 'approved',
  priority: 'medium',
  votes: [],
  human_approval_comment: null,
  human_approval_approved_at: null,
  duplicate_warning: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('FeatureRequestDetail with images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(imagesApi.list).mockResolvedValue({ data: mockImages })
    vi.mocked(imagesApi.upload).mockResolvedValue({ data: [] })
    vi.mocked(imagesApi.delete).mockResolvedValue(undefined)
    vi.mocked(orchestrator.submitWork).mockResolvedValue({
      id: 'run-1', status: 'queued', statusUrl: '/status', ports: {}, branch: 'main'
    })
  })

  it('fetches and displays images for the feature request', async () => {
    // Verifies: FR-084
    render(
      <MemoryRouter>
        <FeatureRequestDetail fr={mockFR} onUpdate={() => {}} onClose={() => {}} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(imagesApi.list).toHaveBeenCalledWith('feature-requests', 'FR-0001')
    })

    await waitFor(() => {
      expect(screen.getByText('Attachments (2)')).toBeInTheDocument()
    })
  })

  it('shows image upload component on detail view', async () => {
    // Verifies: FR-084
    render(
      <MemoryRouter>
        <FeatureRequestDetail fr={mockFR} onUpdate={() => {}} onClose={() => {}} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('image-upload')).toBeInTheDocument()
  })

  it('shows Submit to Orchestrator button for approved FRs', async () => {
    // Verifies: FR-087
    render(
      <MemoryRouter>
        <FeatureRequestDetail fr={mockFR} onUpdate={() => {}} onClose={() => {}} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Submit to Orchestrator')).toBeInTheDocument()
    })
  })

  it('does not show Submit to Orchestrator for non-approved FRs', () => {
    // Verifies: FR-087
    const potentialFR = { ...mockFR, status: 'potential' as const }
    render(
      <MemoryRouter>
        <FeatureRequestDetail fr={potentialFR} onUpdate={() => {}} onClose={() => {}} />
      </MemoryRouter>
    )
    expect(screen.queryByText('Submit to Orchestrator')).toBeNull()
  })

  it('submits to orchestrator with images when clicked', async () => {
    // Verifies: FR-087
    // Mock fetch for downloading image files
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' })
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (typeof url === 'string' && url.startsWith('/uploads/')) {
        return Promise.resolve(new Response(mockBlob))
      }
      return Promise.resolve(new Response(JSON.stringify({})))
    })

    render(
      <MemoryRouter>
        <FeatureRequestDetail fr={mockFR} onUpdate={() => {}} onClose={() => {}} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Attachments (2)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Submit to Orchestrator'))

    await waitFor(() => {
      expect(orchestrator.submitWork).toHaveBeenCalledWith(
        expect.stringContaining('Test feature'),
        expect.objectContaining({ images: expect.any(Array) })
      )
    })

    vi.restoreAllMocks()
  })
})

// --- BugDetail with images ---

const mockBug: BugReport = {
  id: 'BUG-0001',
  title: 'Test bug',
  description: 'A test bug report',
  severity: 'high',
  status: 'reported',
  source_system: 'production',
  related_work_item_id: null,
  related_work_item_type: null,
  related_cycle_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('BugDetail with images', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(imagesApi.list).mockResolvedValue({ data: mockImages })
    vi.mocked(imagesApi.upload).mockResolvedValue({ data: [] })
    vi.mocked(imagesApi.delete).mockResolvedValue(undefined)
  })

  it('fetches and displays images for the bug report', async () => {
    // Verifies: FR-085
    render(
      <MemoryRouter>
        <BugDetail bug={mockBug} onClose={() => {}} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(imagesApi.list).toHaveBeenCalledWith('bugs', 'BUG-0001')
    })

    await waitFor(() => {
      expect(screen.getByText('Screenshots (2)')).toBeInTheDocument()
    })
  })

  it('shows image upload component on bug detail view', async () => {
    // Verifies: FR-085
    render(
      <MemoryRouter>
        <BugDetail bug={mockBug} onClose={() => {}} />
      </MemoryRouter>
    )

    expect(screen.getByTestId('image-upload')).toBeInTheDocument()
  })

  it('calls delete API when image delete button is clicked', async () => {
    // Verifies: FR-085
    render(
      <MemoryRouter>
        <BugDetail bug={mockBug} onClose={() => {}} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Screenshots (2)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('delete-image-IMG-0001'))

    await waitFor(() => {
      expect(imagesApi.delete).toHaveBeenCalledWith('bugs', 'BUG-0001', 'IMG-0001')
    })
  })
})
