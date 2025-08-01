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
import { LayerImportService, SUPPORTED_FORMATS } from '@/services/layer-import-service'

interface AttachButtonProps {
  disabled?: boolean
  className?: string
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export const AttachButton: React.FC<AttachButtonProps> = ({
  disabled = false,
  className
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const { addLayer, addError } = useLayerStore()

  // Generate accepted file types for input element
  const acceptedTypes = Object.keys(SUPPORTED_FORMATS).join(',') + ',.json,.geojson,.kml,.kmz,.gpx,.csv,.xlsx,.xls,.zip,.tif,.tiff'

  const handleButtonClick = () => {
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
      
      // Add to layer store
      await addLayer(layerDefinition)
      
      setUploadState('success')
      console.log(`[AttachButton] Successfully imported layer: ${layerDefinition.name}`)

      // Reset state after success animation
      setTimeout(() => {
        setUploadState('idle')
      }, 1500)

    } catch (error) {
      console.error('[AttachButton] Import failed:', error)
      setUploadState('error')
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to import layer'
      
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
        return <Upload className="h-4 w-4 animate-pulse" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Paperclip className="h-4 w-4" />
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
        return 'Import layer (GeoJSON, Shapefile, KML, CSV, GeoTIFF, etc.)'
    }
  }

  const getButtonVariant = () => {
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
        title={getButtonTitle()}
      >
        {getButtonIcon()}
      </Button>

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