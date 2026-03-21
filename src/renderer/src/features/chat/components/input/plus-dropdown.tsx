/**
 * Plus Button Component
 *
 * Button that directly opens file explorer for importing layers.
 * Database functionality is hidden until it's ready for use.
 */

import React, { type ChangeEvent, type RefObject } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { UploadState } from './use-layer-file-import'

interface PlusDropdownProps {
  acceptedTypes: string
  disabled?: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  className?: string
  onFileImportClick: () => void
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  onOpenDatabase?: () => void // Kept for future use
  uploadState: UploadState
}

export const PlusDropdown: React.FC<PlusDropdownProps> = ({
  acceptedTypes,
  disabled = false,
  fileInputRef,
  className,
  onFileImportClick,
  onFileSelect,
  uploadState
  // onOpenDatabase - not used until database feature is ready
}) => {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onFileImportClick}
            disabled={disabled || uploadState === 'uploading'}
            className={cn(
              'size-8 text-foreground/60 hover:text-foreground/80 transition-colors',
              uploadState === 'uploading' && 'cursor-not-allowed opacity-75',
              className
            )}
          >
            <Plus className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Import layer file</p>
        </TooltipContent>
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        onChange={(event) => {
          void onFileSelect(event)
        }}
        style={{ display: 'none' }}
        aria-label="Import layer file"
      />
    </>
  )
}
