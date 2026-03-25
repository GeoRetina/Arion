import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { LayerImportService, LAYER_IMPORT_ACCEPT_ATTRIBUTE } from '@/services/layer-import'
import { resolveLocalImportFilePath } from '@/services/layer-import/processors/local-import-file-path'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { useLayerStore } from '@/stores/layer-store'
import { waitForNextPaint } from '@/lib/wait-for-next-paint'
import { toast } from 'sonner'
import type { LayerDefinition } from '../../../../../../shared/types/layer-types'
import {
  createGeoPackageImportProgressState,
  createInitialGeoPackageImportProgressState,
  createInitialRasterImportProgressState,
  createInitialShapefileImportProgressState,
  createRasterImportProgressState,
  createShapefileImportProgressState,
  getLayerImportProgressSignature
} from './layer-import-progress-state'
import type { LayerImportProgress } from './layer-import-progress-state'
export type { LayerImportProgress } from './layer-import-progress-state'

export type UploadState = 'idle' | 'uploading' | 'success' | 'error'

const DEFAULT_LAYER_IMPORT_ACCEPTED_TYPES = LAYER_IMPORT_ACCEPT_ATTRIBUTE

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
  importProgress: LayerImportProgress | null
}

export const useLayerFileImport = ({
  acceptedTypes = DEFAULT_LAYER_IMPORT_ACCEPTED_TYPES,
  disabled = false,
  source = 'file-import'
}: UseLayerFileImportOptions = {}): UseLayerFileImportResult => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resetUploadStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [importProgress, setImportProgress] = useState<LayerImportProgress | null>(null)
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
      let isGeoPackageImport = false
      let isShapefileImport = false
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
          setImportProgress(createInitialRasterImportProgressState())
          await waitForNextPaint()
        } else if (validation.format === 'geopackage') {
          isGeoPackageImport = true
          setImportProgress(createInitialGeoPackageImportProgressState(file.name))
          await waitForNextPaint()
        } else if (validation.format === 'shapefile') {
          isShapefileImport = true
          setImportProgress(createInitialShapefileImportProgressState(file.name))
          await waitForNextPaint()
        }

        layerDefinition = await LayerImportService.processFile(file, validation.format, {
          onRasterProgress: (status) => {
            if (!isGeoTiffImport) {
              return
            }

            if (status.stage === 'ready') {
              geotiffReady = true
              setImportProgress(null)

              if (status.warning) {
                toast.warning('Raster optimization fallback', {
                  description: status.warning
                })
              }
              showGeoTiffImportSuccessToast()
              return
            }

            if (status.stage === 'error') {
              setImportProgress(null)
              toast.error('Raster optimization failed', {
                description: status.error || status.warning || 'Unknown optimization error'
              })
              return
            }

            const signature = getLayerImportProgressSignature(status)
            if (signature === lastProgressSignature) {
              return
            }

            lastProgressSignature = signature
            setImportProgress(createRasterImportProgressState(status))
          },
          onGeoPackageProgress: (status) => {
            if (!isGeoPackageImport) {
              return
            }

            const signature = getLayerImportProgressSignature(status)
            if (signature === lastProgressSignature) {
              return
            }

            lastProgressSignature = signature
            setImportProgress(createGeoPackageImportProgressState(status))
          },
          onShapefileProgress: (status) => {
            if (!isShapefileImport) {
              return
            }

            const signature = getLayerImportProgressSignature(status)
            if (signature === lastProgressSignature) {
              return
            }

            lastProgressSignature = signature
            setImportProgress(createShapefileImportProgressState(status))
          }
        })

        if (isGeoPackageImport || isShapefileImport) {
          setImportProgress({
            title: 'Adding layer',
            message: 'Syncing imported features to the map',
            progress: 95
          })
          await waitForNextPaint()
        }

        const localFilePath = await resolveLocalImportFilePath(file)

        await addLayer(layerDefinition, {
          chatId: currentChatId,
          source,
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            ...(localFilePath ? { localFilePath } : {})
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

        setImportProgress(null)
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
        setImportProgress(null)

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
    importProgress
  }
}
