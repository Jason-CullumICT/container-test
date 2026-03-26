// Verifies: FR-081
import React from 'react'
import type { ImageAttachment } from '../../../../Shared/types'

interface ImageThumbnailsProps {
  images: ImageAttachment[]
  allowDelete?: boolean
  onDelete?: (imageId: string) => void
}

export function ImageThumbnails({ images, allowDelete = false, onDelete }: ImageThumbnailsProps) {
  if (images.length === 0) return null

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="image-thumbnails">
      {images.map((img) => (
        <div key={img.id} className="relative group">
          <a
            href={`/uploads/${img.filename}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={`/uploads/${img.filename}`}
              alt={img.original_name}
              className="w-full h-20 object-cover rounded border border-gray-200 hover:border-blue-400 transition-colors"
            />
          </a>
          <p className="text-xs text-gray-400 truncate mt-0.5">{img.original_name}</p>
          {allowDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(img.id)}
              className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`Delete ${img.original_name}`}
              data-testid={`delete-image-${img.id}`}
            >
              x
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
