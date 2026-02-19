/**
 * AttachButton Component
 *
 * Button for importing vector and raster layers via file upload.
 * Provides file validation, progress indication, and error handling.
 */

import React, { useRef, useState } from 'react'
import { Paperclip, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { LayerImportService, SUPPORTED_FORMATS } from '@/services/layer-import-service'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FloatingProgressToast } from '@/components/ui/floating-progress-toast'
import { toast } from 'sonner'
import type { LayerDefinition } from '../../../../../../shared/types/layer-types'
import {
  createInitialRasterProgressToastState,
  createRasterProgressToastState,
  getRasterProgressSignature
} from './raster-import-progress-toast-state'

interface AttachButtonProps {
  disabled?: boolean
  className?: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export const AttachButton: React.FC<AttachButtonProps> = ({ disabled = false, className }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const { addLayer, addError } = useLayerStore()
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  // Generate accepted file types for input element
  const acceptedTypes =
    Object.keys(SUPPORTED_FORMATS).join(',') +
    ',.json,.geojson,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.zip,.tif,.tiff'

  const handleButtonClick = (): void => {
    if (disabled || uploadState === 'uploading') return
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setUploadState('uploading')
    let layerDefinition: LayerDefinition | null = null
    let progressToastId: string | number | undefined
    let lastProgressSignature = ''
    let isGeoTiffImport = false
    let geotiffReady = false
    let geotiffLayerAdded = false
    let geotiffSuccessToastShown = false

    const showGeoTiffImportSuccessToast = (): void => {
      if (!isGeoTiffImport || !geotiffReady || !geotiffLayerAdded || geotiffSuccessToastShown) {
        return
      }

      geotiffSuccessToastShown = true
      const layerName = layerDefinition?.name ?? file.name.replace(/\.[^/.]+$/, '')
      toast.success(`Layer "${layerName}" imported successfully`, {
        description: 'Raster is ready on map'
      })
    }

    try {
      // Validate file
      const validation = LayerImportService.validateFile(file)
      if (!validation.valid || !validation.format) {
        throw new Error(validation.error || 'Invalid file format')
      }

      if (validation.format === 'geotiff') {
        isGeoTiffImport = true
        progressToastId = `raster-import-${Date.now()}`
        const initialState = createInitialRasterProgressToastState()
        toast.custom(() => <FloatingProgressToast state={initialState} />, {
          id: progressToastId,
          duration: Infinity
        })
      }

      // Process file and create layer
      layerDefinition = await LayerImportService.processFile(file, validation.format, {
        onRasterProgress: (status) => {
          if (!progressToastId) {
            return
          }

          if (status.stage === 'ready') {
            geotiffReady = true
            toast.dismiss(progressToastId)
            progressToastId = undefined

            if (status.warning) {
              toast.warning('Raster optimization fallback', {
                description: status.warning
              })
            }
            showGeoTiffImportSuccessToast()
            return
          }

          if (status.stage === 'error') {
            toast.dismiss(progressToastId)
            progressToastId = undefined
            toast.error('Raster optimization failed', {
              description: status.error || status.warning || 'Unknown optimization error'
            })
            return
          }

          const signature = getRasterProgressSignature(status)
          if (signature === lastProgressSignature) {
            return
          }

          lastProgressSignature = signature
          const toastState = createRasterProgressToastState(status)
          toast.custom(() => <FloatingProgressToast state={toastState} />, {
            id: progressToastId,
            duration: Infinity
          })
        }
      })

      // Add to layer store with chat context for session tracking
      await addLayer(layerDefinition, {
        chatId: currentChatId,
        source: 'attach-button',
        metadata: {
          fileName: file.name,
          fileSize: file.size
        }
      })

      geotiffLayerAdded = true
      showGeoTiffImportSuccessToast()
      setUploadState('success')
      if (!isGeoTiffImport) {
        toast.success(`Layer "${layerDefinition.name}" imported successfully`, {
          description: `Added to current chat session`
        })
      }
      if (progressToastId && !isGeoTiffImport) {
        toast.dismiss(progressToastId)
      }

      // Reset state after success animation
      setTimeout(() => {
        setUploadState('idle')
      }, 1500)
    } catch (error) {
      if (layerDefinition) {
        try {
          await LayerImportService.cleanupLayer(layerDefinition)
        } catch {
          // Ignore cleanup failures and surface the original import error.
        }
      }

      setUploadState('error')

      const errorMessage = error instanceof Error ? error.message : 'Failed to import layer'

      toast.error('Layer import failed', {
        description: errorMessage
      })
      if (progressToastId) {
        toast.dismiss(progressToastId)
      }

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

  const getButtonIcon = (): React.JSX.Element => {
    switch (uploadState) {
      case 'uploading':
        return <Upload className="h-4 w-4 animate-pulse" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Paperclip className="h-4 w-4" />
    }
  }

  const getButtonTitle = ():
    | 'Importing layer...'
    | 'Layer imported successfully'
    | 'Import failed'
    | 'Import layer (GeoJSON, Shapefile, KML, CSV, GeoTIFF, etc.)' => {
    switch (uploadState) {
      case 'uploading':
        return 'Importing layer...'
      case 'success':
        return 'Layer imported successfully'
      case 'error':
        return 'Import failed'
      default:
        return 'Import layer (GeoJSON, Shapefile, KML, CSV, GeoTIFF, etc.)'
    }
  }

  const getButtonVariant = (): 'default' | 'ghost' => {
    switch (uploadState) {
      case 'success':
        return 'default' // Keep subtle
      case 'error':
        return 'ghost' // Keep subtle for error state too
      default:
        return 'ghost'
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={getButtonVariant()}
            size="icon"
            onClick={handleButtonClick}
            disabled={disabled || uploadState === 'uploading'}
            className={cn(
              'text-muted-foreground hover:text-foreground transition-colors',
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
