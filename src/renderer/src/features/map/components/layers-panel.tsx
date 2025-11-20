import React, { useState, useEffect } from 'react'
import { Layers, ChevronLeft } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LayerItem } from './layer-item'
import { LayerStyleEditor } from './layer-style-editor'
import { zoomToLayer } from '@/lib/layer-zoom-utils'
import { toast } from 'sonner'
import type { LayerStyle } from '../../../../../shared/types/layer-types'

interface LayersPanelProps {
  className?: string
  isExpanded: boolean
  onClose?: () => void
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ className, isExpanded, onClose }) => {
  const [currentChatSession, setCurrentChatSession] = useState<string | null>(null)
  const [styleEditorLayerId, setStyleEditorLayerId] = useState<string | null>(null)

  // Map and Layer Store
  const mapInstance = useMapStore((state) => state.mapInstance)
  const layers = useLayerStore((state) => state.layers)
  const selectedLayerId = useLayerStore((state) => state.selectedLayerId)
  const selectLayer = useLayerStore((state) => state.selectLayer)
  const setLayerVisibility = useLayerStore((state) => state.setLayerVisibility)
  const removeLayer = useLayerStore((state) => state.removeLayer)
  const updateLayerStyle = useLayerStore((state) => state.updateLayerStyle)
  const updateLayer = useLayerStore((state) => state.updateLayer)

  // Chat session tracking
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  // Track session change but don't reset (let persistence system handle it)
  useEffect(() => {
    if (currentChatId !== currentChatSession) {
      setCurrentChatSession(currentChatId)
    }
  }, [currentChatId, currentChatSession])

  // If a chat ID becomes available after importing, tag any unassigned imported layers with it
  useEffect(() => {
    if (!currentChatId) return

    const importedLayersNeedingTag = Array.from(layers.values()).filter(
      (layer) => layer.createdBy === 'import' && !layer.metadata.tags?.includes(currentChatId)
    )

    if (importedLayersNeedingTag.length === 0) return

    const tagLayerToChat = async () => {
      for (const layer of importedLayersNeedingTag) {
        const tags = Array.from(
          new Set([...(layer.metadata.tags || []), 'session-import', currentChatId])
        )

        try {
          await updateLayer(layer.id, {
            metadata: {
              ...layer.metadata,
              tags
            }
          })
        } catch (error) {
          // Silent fail to avoid interrupting UI; errors are already handled elsewhere
        }
      }
    }

    tagLayerToChat()
  }, [currentChatId, layers, updateLayer])

  // Get only session layers (imported layers for current chat)
  const sessionLayers = Array.from(layers.values()).filter((layer) => {
    if (layer.createdBy !== 'import') return false
    // When no chat session exists yet, show all imported layers so the user can see them immediately
    if (!currentChatId) return true
    // Otherwise, show only layers tagged for this chat
    return layer.metadata.tags?.includes(currentChatId)
  })
  const displayLayers = sessionLayers

  // Event handlers
  const handleToggleLayerVisibility = async (layerId: string, visible: boolean) => {
    try {
      await setLayerVisibility(layerId, visible)
    } catch (error) {}
  }

  const handleSelectLayer = (layerId: string) => {
    selectLayer(layerId === selectedLayerId ? null : layerId)
  }

  const handleDeleteLayer = async (layerId: string) => {
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

  const handleShowStyleEditor = (layerId: string) => {
    setStyleEditorLayerId(layerId)
  }

  const handleCloseStyleEditor = () => {
    setStyleEditorLayerId(null)
  }

  const handleStyleChange = async (layerId: string, style: Partial<LayerStyle>) => {
    try {
      await updateLayerStyle(layerId, style)
    } catch (error) {
      toast.error('Failed to update layer style', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  const handleZoomToLayer = async (layerId: string) => {
    const layer = layers.get(layerId)
    if (!layer || !mapInstance) {
      return
    }

    await zoomToLayer(mapInstance, layer)
  }

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'absolute left-0 bg-card/95 backdrop-blur-sm border-r border-border/50 z-20 rounded-r-lg w-80',
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
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
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
                {displayLayers.length === 0 ? (
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
                    {displayLayers
                      .sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      )
                      .map((layer) => (
                        <LayerItem
                          key={layer.id}
                          layer={layer}
                          isSelected={selectedLayerId === layer.id}
                          onToggleVisibility={handleToggleLayerVisibility}
                          onSelect={handleSelectLayer}
                          onDelete={handleDeleteLayer}
                          onShowStyleEditor={handleShowStyleEditor}
                          onZoomToLayer={handleZoomToLayer}
                        />
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
