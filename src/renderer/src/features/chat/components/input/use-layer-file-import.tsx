import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { LayerImportService } from '@/services/layer-import-service'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { useLayerStore } from '@/stores/layer-store'
import { toast } from 'sonner'
import type { LayerDefinition } from '../../../../../../shared/types/layer-types'
import {
  createInitialRasterProgressToastState,
  createRasterProgressToastState,
  getRasterProgressSignature
} from './raster-import-progress-toast-state'
import type { RasterImportProgress } from './raster-import-progress-toast-state'
export type { RasterImportProgress } from './raster-import-progress-toast-state'

export type UploadState = 'idle' | 'uploading' | 'success' | 'error'

export const DEFAULT_LAYER_IMPORT_ACCEPTED_TYPES = '.json,.geojson,.zip,.tif,.tiff'

interface UseLayerFileImportOptions {
  acceptedTypes?: string
  disabled?: boolean
  source?: string
}

export interface UseLayerFileImportResult {
  acceptedTypes: string
  fileInputRef: RefObject<HTMLInputElement | null>
  handleFileSelect: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  importFile: (file: File) => Promise<void>
  openFilePicker: () => void
  uploadState: UploadState
  rasterProgress: RasterImportProgress | null
}

export const useLayerFileImport = ({
  acceptedTypes = DEFAULT_LAYER_IMPORT_ACCEPTED_TYPES,
  disabled = false,
  source = 'file-import'
}: UseLayerFileImportOptions = {}): UseLayerFileImportResult => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resetUploadStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [rasterProgress, setRasterProgress] = useState<RasterImportProgress | null>(null)
  const { addLayer, addError } = useLayerStore()
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  const clearPendingReset = useCallback(() => {
    if (resetUploadStateTimeoutRef.current) {
      clearTimeout(resetUploadStateTimeoutRef.current)
      resetUploadStateTimeoutRef.current = null
    }
  }, [])

  const scheduleUploadStateReset = useCallback(
    (delayMs: number) => {
      clearPendingReset()
      resetUploadStateTimeoutRef.current = setTimeout(() => {
        setUploadState('idle')
        resetUploadStateTimeoutRef.current = null
      }, delayMs)
    },
    [clearPendingReset]
  )

  useEffect(() => {
    return () => {
      clearPendingReset()
    }
  }, [clearPendingReset])

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      if (disabled || uploadState === 'uploading') {
        return
      }

      clearPendingReset()
      setUploadState('uploading')

      let layerDefinition: LayerDefinition | null = null
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
        const validation = LayerImportService.validateFile(file)
        if (!validation.valid || !validation.format) {
          throw new Error(validation.error || 'Invalid file format')
        }

        if (validation.format === 'geotiff') {
          isGeoTiffImport = true
          const initialState = createInitialRasterProgressToastState()
          setRasterProgress(initialState)
        }

        layerDefinition = await LayerImportService.processFile(file, validation.format, {
          onRasterProgress: (status) => {
            if (!isGeoTiffImport) {
              return
            }

            if (status.stage === 'ready') {
              geotiffReady = true
              setRasterProgress(null)

              if (status.warning) {
                toast.warning('Raster optimization fallback', {
                  description: status.warning
                })
              }
              showGeoTiffImportSuccessToast()
              return
            }

            if (status.stage === 'error') {
              setRasterProgress(null)
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
            setRasterProgress(toastState)
          }
        })

        await addLayer(layerDefinition, {
          chatId: currentChatId,
          source,
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
            description: 'Added to current chat session'
          })
        }

        setRasterProgress(null)
        scheduleUploadStateReset(1500)
      } catch (error) {
        if (layerDefinition) {
          try {
            await LayerImportService.cleanupLayer(layerDefinition)
          } catch {
            // Ignore cleanup failures and surface the original import error.
          }
        }

        setUploadState('error')
        setRasterProgress(null)

        const errorMessage = error instanceof Error ? error.message : 'Failed to import layer'

        toast.error('Layer import failed', {
          description: errorMessage
        })

        addError({
          code: 'UNSUPPORTED_FORMAT',
          message: `Import failed: ${errorMessage}`,
          details: { fileName: file.name },
          timestamp: new Date()
        })

        scheduleUploadStateReset(2000)
      }
    },
    [
      addError,
      addLayer,
      clearPendingReset,
      currentChatId,
      disabled,
      scheduleUploadStateReset,
      source,
      uploadState
    ]
  )

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.target.files?.[0]

      try {
        if (file) {
          await importFile(file)
        }
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    },
    [importFile]
  )

  const openFilePicker = useCallback((): void => {
    if (disabled || uploadState === 'uploading') {
      return
    }

    fileInputRef.current?.click()
  }, [disabled, uploadState])

  return {
    acceptedTypes,
    fileInputRef,
    handleFileSelect,
    importFile,
    openFilePicker,
    uploadState,
    rasterProgress
  }
}
