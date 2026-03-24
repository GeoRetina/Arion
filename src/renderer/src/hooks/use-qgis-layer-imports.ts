import { useEffect } from 'react'
import { toast } from 'sonner'
import type { LayerCreateInput } from '../../../shared/types/layer-types'
import { useLayerStore } from '@/stores/layer-store'

type ImportableLayerPayload = LayerCreateInput & {
  createdAt?: unknown
  updatedAt?: unknown
}

const stripGeneratedFields = (layer: ImportableLayerPayload): LayerCreateInput => {
  const definition = { ...layer }
  delete definition.id
  delete definition.createdAt
  delete definition.updatedAt
  return definition
}

export function useQgisLayerImports(): void {
  useEffect(() => {
    return window.ctg.layers.onImportDefinitions((payload) => {
      if (!Array.isArray(payload.layers) || payload.layers.length === 0) {
        return
      }

      void (async () => {
        let importedCount = 0
        let failedCount = 0

        for (const rawLayer of payload.layers as ImportableLayerPayload[]) {
          try {
            await useLayerStore.getState().addLayer(stripGeneratedFields(rawLayer), {
              chatId: payload.chatId ?? null,
              source: payload.source || 'qgis',
              metadata: {
                qgisRunId: payload.runId
              }
            })
            importedCount += 1
          } catch (error) {
            failedCount += 1
            console.error('[QGIS imports] Failed to import generated layer:', error)
          }
        }

        if (importedCount > 0) {
          toast.success(
            `Imported ${importedCount} QGIS output layer${importedCount === 1 ? '' : 's'}`
          )
        }

        if (failedCount > 0) {
          toast.error('Some QGIS outputs could not be imported', {
            description: `${failedCount} layer${failedCount === 1 ? '' : 's'} failed to load into the map.`
          })
        }
      })()
    })
  }, [])
}
