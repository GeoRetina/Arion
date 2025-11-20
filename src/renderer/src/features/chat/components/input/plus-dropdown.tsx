/**
 * Plus Button Component
 *
 * Button that directly opens file explorer for importing layers.
 * Database functionality is hidden until it's ready for use.
 */

import React, { useState, useRef } from 'react'
import { Plus, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { LayerImportService } from '@/services/layer-import-service'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

interface PlusDropdownProps {
  disabled?: boolean
  className?: string
  onOpenDatabase?: () => void // Kept for future use
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export const PlusDropdown: React.FC<PlusDropdownProps> = ({
  disabled = false,
  className
  // onOpenDatabase - not used until database feature is ready
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const { addLayer, addError } = useLayerStore()
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  // Only allow JSON/GeoJSON, ZIP, and TIF files
  const acceptedTypes = '.json,.geojson,.zip,.tif,.tiff'

  const handleFileImport = () => {
    if (disabled || uploadState === 'uploading') return
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setUploadState('uploading')

    try {
      // Validate file
      const validation = LayerImportService.validateFile(file)
      if (!validation.valid || !validation.format) {
        throw new Error(validation.error || 'Invalid file format')
      }

      // Process file and create layer
      const layerDefinition = await LayerImportService.processFile(file, validation.format)

      // Add to layer store with chat context for session tracking
      await addLayer(layerDefinition, {
        chatId: currentChatId,
        source: 'file-import',
        metadata: {
          fileName: file.name,
          fileSize: file.size
        }
      })

      setUploadState('success')
      toast.success(`Layer "${layerDefinition.name}" imported successfully`, {
        description: `Added to current chat session`
      })

      // Reset state after success animation
      setTimeout(() => {
        setUploadState('idle')
      }, 1500)
    } catch (error) {
      setUploadState('error')

      const errorMessage = error instanceof Error ? error.message : 'Failed to import layer'

      toast.error('Layer import failed', {
        description: errorMessage
      })

      // Add error to layer store for display in UI
      addError({
        code: 'UNSUPPORTED_FORMAT',
        message: `Import failed: ${errorMessage}`,
        details: { fileName: file.name },
        timestamp: new Date()
      })

      // Reset state after error display
      setTimeout(() => {
        setUploadState('idle')
      }, 2000)
    } finally {
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const getButtonIcon = () => {
    switch (uploadState) {
      case 'uploading':
        return <Upload className="h-5 w-5 animate-pulse" />
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />
      default:
        return <Plus className="h-5 w-5" />
    }
  }

  const getButtonTitle = () => {
    switch (uploadState) {
      case 'uploading':
        return 'Importing layer...'
      case 'success':
        return 'Layer imported successfully'
      case 'error':
        return 'Import failed'
      default:
        return 'Import layer file'
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleFileImport}
            disabled={disabled || uploadState === 'uploading'}
            className={cn(
              'text-foreground hover:text-foreground/80 transition-colors h-8 w-8',
              uploadState === 'uploading' && 'cursor-not-allowed opacity-75',
              uploadState === 'success' && 'text-green-600 hover:text-green-700',
              uploadState === 'error' && 'text-red-600 hover:text-red-700',
              className
            )}
          >
            {getButtonIcon()}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getButtonTitle()}</p>
        </TooltipContent>
      </Tooltip>

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        aria-label="Import layer file"
      />
    </>
  )
}
