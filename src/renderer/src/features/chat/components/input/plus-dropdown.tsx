/**
 * Plus Dropdown Component
 * 
 * Dropdown menu triggered by a plus button that contains various
 * import and database options for the chat input.
 */

import React, { useState, useRef } from 'react'
import { Plus, Paperclip, Database, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { LayerImportService, SUPPORTED_FORMATS } from '@/services/layer-import-service'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'

interface PlusDropdownProps {
  disabled?: boolean
  className?: string
  onOpenDatabase?: () => void
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export const PlusDropdown: React.FC<PlusDropdownProps> = ({
  disabled = false,
  className,
  onOpenDatabase
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [isOpen, setIsOpen] = useState(false)
  const { addLayer, addError } = useLayerStore()
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  // Generate accepted file types for input element
  const acceptedTypes = Object.keys(SUPPORTED_FORMATS).join(',') + ',.json,.geojson,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.zip,.tif,.tiff'

  const handleFileImport = () => {
    if (disabled || uploadState === 'uploading') return
    setIsOpen(false) // Close dropdown
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
      console.error('[PlusDropdown] Import failed:', error)
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

  const handleDatabaseOpen = () => {
    if (disabled) return
    setIsOpen(false) // Close dropdown
    onOpenDatabase?.()
  }

  const getButtonIcon = () => {
    switch (uploadState) {
      case 'uploading':
        return <Upload className="h-4 w-4 animate-pulse" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Plus className="h-4 w-4" />
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
        return 'Add content'
    }
  }

  return (
    <>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getButtonTitle()}</p>
          </TooltipContent>
        </Tooltip>
        
        <DropdownMenuContent align="center" side="top" className="w-56">
          <DropdownMenuItem onClick={handleFileImport} disabled={disabled || uploadState === 'uploading'}>
            <Paperclip className="h-4 w-4 mr-2" />
            Import File
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={handleDatabaseOpen} disabled={disabled}>
            <Database className="h-4 w-4 mr-2" />
            Layer Database
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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