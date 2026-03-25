import React, { useEffect, useMemo, useState } from 'react'
import { LayoutList, ChevronLeft, Layers } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { selectSessionImportedLayers, useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LayerItem } from './layer-item'
import { LayerStyleEditor } from './layer-style-editor'
import { RasterRgbBandControls } from './raster-rgb-band-controls'
import { zoomToLayer } from '@/lib/layer-zoom-utils'
import { toast } from 'sonner'
import type { LayerSourceConfig, LayerStyle } from '../../../../../shared/types/layer-types'

interface LayersPanelProps {
  className?: string
  isExpanded: boolean
  onClose?: () => void
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ className, isExpanded, onClose }) => {
  const [styleEditorLayerId, setStyleEditorLayerId] = useState<string | null>(null)
  const [bandConfigLayerId, setBandConfigLayerId] = useState<string | null>(null)

  // Map and Layer Store
  const mapInstance = useMapStore((state) => state.mapInstance)
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)
  const layers = useLayerStore((state) => state.layers)
  const setLayerVisibility = useLayerStore((state) => state.setLayerVisibility)
  const removeLayer = useLayerStore((state) => state.removeLayer)
  const updateLayerStyle = useLayerStore((state) => state.updateLayerStyle)
  const updateLayer = useLayerStore((state) => state.updateLayer)
  const tagImportedLayersForChat = useLayerStore((state) => state.tagImportedLayersForChat)
  const sessionLayers = useMemo(
    () => selectSessionImportedLayers(layers.values(), currentChatId),
    [currentChatId, layers]
  )

  // If a chat ID becomes available after importing, tag any unassigned imported layers with it
  useEffect(() => {
    if (!currentChatId) {
      return
    }

    void tagImportedLayersForChat(currentChatId)
  }, [currentChatId, tagImportedLayersForChat])

  const bandConfigLayer = bandConfigLayerId
    ? sessionLayers.find((layer) => layer.id === bandConfigLayerId) || null
    : null

  // Event handlers
  const handleToggleLayerVisibility = async (layerId: string, visible: boolean): Promise<void> => {
    try {
      await setLayerVisibility(layerId, visible)
    } catch {
      void 0
    }
  }

  const handleDeleteLayer = async (layerId: string): Promise<void> => {
    try {
      const layer = layers.get(layerId)
      await removeLayer(layerId)
      toast.success('Layer deleted successfully', {
        description: layer ? `Removed "${layer.name}" from session` : 'Layer removed'
      })
    } catch (error) {
      toast.error('Failed to delete layer', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  const handleShowStyleEditor = (layerId: string): void => {
    setStyleEditorLayerId(layerId)
  }

  const handleShowBandConfig = (layerId: string): void => {
    setBandConfigLayerId(bandConfigLayerId === layerId ? null : layerId)
  }

  const handleCloseStyleEditor = (): void => {
    setStyleEditorLayerId(null)
  }

  const handleStyleChange = async (layerId: string, style: Partial<LayerStyle>): Promise<void> => {
    try {
      await updateLayerStyle(layerId, style)
    } catch (error) {
      toast.error('Failed to update layer style', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  const handleZoomToLayer = async (layerId: string): Promise<void> => {
    const layer = layers.get(layerId)
    if (!layer || !mapInstance) {
      return
    }

    await zoomToLayer(mapInstance, layer)
  }

  const handleRasterSourceConfigChange = async (
    layerId: string,
    sourceConfig: LayerSourceConfig
  ): Promise<void> => {
    await updateLayer(layerId, { sourceConfig })
  }

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'absolute left-0 bg-card/95 backdrop-blur-sm border-r border-border z-20 rounded-r-lg w-80',
          className
        )}
        style={{
          transform: isExpanded ? 'translateX(0)' : 'translateX(-320px)',
          top: '10%',
          height: '80%',
          maxHeight: '80%',
          transition: 'transform 300ms ease-in-out'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Layers</span>
              <div className="flex-1"></div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-6 w-6 rounded-md hover:bg-muted!"
                  title="Close layers panel"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 mt-2">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {sessionLayers.length === 0 ? (
                  <div className="text-center py-8">
                    <Layers className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                    <div className="text-sm text-muted-foreground">
                      No layers in current session
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Use the + button in chat to import layers
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sessionLayers.map((layer) => (
                      <div key={layer.id}>
                        <LayerItem
                          layer={layer}
                          onToggleVisibility={handleToggleLayerVisibility}
                          onDelete={handleDeleteLayer}
                          onShowStyleEditor={handleShowStyleEditor}
                          onZoomToLayer={handleZoomToLayer}
                          onShowBandConfig={handleShowBandConfig}
                          isBandConfigOpen={bandConfigLayerId === layer.id}
                        />
                        {bandConfigLayerId === layer.id && bandConfigLayer && (
                          <RasterRgbBandControls
                            layer={bandConfigLayer}
                            onSourceConfigChange={handleRasterSourceConfigChange}
                            onClose={() => setBandConfigLayerId(null)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Style Editor */}
      <LayerStyleEditor
        isOpen={styleEditorLayerId !== null}
        onClose={handleCloseStyleEditor}
        layer={styleEditorLayerId ? layers.get(styleEditorLayerId) || null : null}
        onStyleChange={handleStyleChange}
      />
    </>
  )
}
