import React, { useState, useEffect } from 'react'
import { ChevronRight, Layers, PanelLeftClose } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { useLayerStore } from '@/stores/layer-store'
import { useChatHistoryStore } from '@/stores/chat-history-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { LayerItem } from './layer-item'
import { LayerGroup } from './layer-group'
import { LayerStats } from './layer-stats'
import { zoomToLayer } from '@/lib/layer-zoom-utils'
import { toast } from 'sonner'

interface LayersPanelProps {
  className?: string
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ className }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'layers' | 'stats'>('layers')
  const [currentChatSession, setCurrentChatSession] = useState<string | null>(null)
  
  // Map and Layer Store
  const mapInstance = useMapStore((state) => state.mapInstance)
  const { 
    layers, 
    groups, 
    selectedLayerId,
    selectLayer,
    setLayerVisibility,
    duplicateLayer,
    removeLayer,
    updateGroup
  } = useLayerStore()
  
  // Chat session tracking
  const currentChatId = useChatHistoryStore((state) => state.currentChatId)

  // Track session change but don't reset (let persistence system handle it)
  useEffect(() => {
    if (currentChatId !== currentChatSession) {
      console.log('[LayersPanel] Chat session changed:', {
        from: currentChatSession,
        to: currentChatId
      })
      setCurrentChatSession(currentChatId)
    }
  }, [currentChatId, currentChatSession])

  // Get only session layers (imported layers for current chat)
  const sessionLayers = Array.from(layers.values()).filter(layer => {
    if (layer.createdBy !== 'import') return false
    // Check if layer was imported to this specific chat session
    if (!currentChatId) return false
    return layer.metadata.tags?.includes(currentChatId)
  })
  const displayLayers = sessionLayers
  const displayGroups = Array.from(groups.values())
  
  
  // Get ungrouped layers
  const ungroupedLayers = displayLayers.filter(layer => !layer.groupId)

  // Event handlers
  const handleToggleLayerVisibility = async (layerId: string, visible: boolean) => {
    try {
      await setLayerVisibility(layerId, visible)
    } catch (error) {
      console.error('[LayersPanel] Failed to toggle layer visibility:', error)
    }
  }

  const handleSelectLayer = (layerId: string) => {
    selectLayer(layerId === selectedLayerId ? null : layerId)
  }

  const handleEditLayer = (layerId: string) => {
    // TODO: Open layer edit dialog
    console.log('[LayersPanel] Edit layer:', layerId)
  }

  const handleDuplicateLayer = async (layerId: string) => {
    try {
      const layer = layers.get(layerId)
      const newLayerId = await duplicateLayer(layerId)
      toast.success('Layer duplicated successfully', {
        description: layer ? `Created copy of "${layer.name}"` : 'Layer duplicated'
      })
      console.log('[LayersPanel] Duplicated layer:', layerId, '→', newLayerId)
    } catch (error) {
      console.error('[LayersPanel] Failed to duplicate layer:', error)
      toast.error('Failed to duplicate layer', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  const handleDeleteLayer = async (layerId: string) => {
    try {
      const layer = layers.get(layerId)
      await removeLayer(layerId)
      toast.success('Layer deleted successfully', {
        description: layer ? `Removed "${layer.name}" from session` : 'Layer removed'
      })
      console.log('[LayersPanel] Deleted layer:', layerId)
    } catch (error) {
      console.error('[LayersPanel] Failed to delete layer:', error)
      toast.error('Failed to delete layer', {
        description: error instanceof Error ? error.message : 'An unknown error occurred'
      })
    }
  }

  const handleShowStyleEditor = (layerId: string) => {
    // TODO: Open style editor dialog
    console.log('[LayersPanel] Show style editor for layer:', layerId)
  }

  const handleToggleGroup = async (groupId: string) => {
    const group = groups.get(groupId)
    if (group) {
      await updateGroup(groupId, { expanded: !group.expanded })
    }
  }

  const handleEditGroup = (groupId: string) => {
    // TODO: Open group edit dialog
    console.log('[LayersPanel] Edit group:', groupId)
  }

  const handleDeleteGroup = (groupId: string) => {
    // TODO: Open delete confirmation dialog
    console.log('[LayersPanel] Delete group:', groupId)
  }

  const handleAddLayerToGroup = (groupId: string) => {
    // TODO: Open add layer dialog
    console.log('[LayersPanel] Add layer to group:', groupId)
  }

  const handleZoomToLayer = async (layerId: string) => {
    const layer = layers.get(layerId)
    if (!layer || !mapInstance) {
      console.warn('[LayersPanel] Cannot zoom to layer - layer or map not available:', { 
        layerId, 
        hasLayer: !!layer, 
        hasMap: !!mapInstance 
      })
      toast.error('Cannot zoom to layer', {
        description: !layer ? 'Layer not found' : 'Map not available'
      })
      return
    }

    const success = await zoomToLayer(mapInstance, layer)
    if (!success) {
      console.warn('[LayersPanel] Failed to zoom to layer:', layerId)
      toast.error('Failed to zoom to layer', {
        description: 'Layer may not have valid bounds or geometry'
      })
    } else {
      toast.success(`Zoomed to "${layer.name}"`)
    }
  }

  const togglePanel = () => {
    setIsExpanded(!isExpanded)
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Layers</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={togglePanel}
                  >
                    <PanelLeftClose className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Close layers panel</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'layers' | 'stats')} className="flex-1 flex flex-col">
            <div className="px-3 pt-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="layers" className="text-xs">
                  Layers ({displayLayers.length})
                </TabsTrigger>
                <TabsTrigger value="stats" className="text-xs">
                  Stats
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Layers Tab */}
            <TabsContent value="layers" className="flex-1 mt-2">
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
                    <>
                      {/* Layer Groups */}
                      {displayGroups.map((group) => (
                        <LayerGroup
                          key={group.id}
                          group={group}
                          layers={displayLayers}
                          selectedLayerId={selectedLayerId}
                          onToggleGroup={handleToggleGroup}
                          onSelectLayer={handleSelectLayer}
                          onToggleLayerVisibility={handleToggleLayerVisibility}
                          onEditLayer={handleEditLayer}
                          onDuplicateLayer={handleDuplicateLayer}
                          onDeleteLayer={handleDeleteLayer}
                          onShowStyleEditor={handleShowStyleEditor}
                          onZoomToLayer={handleZoomToLayer}
                          onEditGroup={handleEditGroup}
                          onDeleteGroup={handleDeleteGroup}
                          onAddLayerToGroup={handleAddLayerToGroup}
                        />
                      ))}

                      {/* Ungrouped Layers */}
                      {ungroupedLayers.length > 0 && (
                        <div className="space-y-1">
                          {displayGroups.length > 0 && (
                            <div className="text-xs text-muted-foreground font-medium px-2 py-1">
                              Ungrouped Layers
                            </div>
                          )}
                          {ungroupedLayers
                            .sort((a, b) => b.zIndex - a.zIndex)
                            .map((layer) => (
                              <LayerItem
                                key={layer.id}
                                layer={layer}
                                isSelected={selectedLayerId === layer.id}
                                onToggleVisibility={handleToggleLayerVisibility}
                                onSelect={handleSelectLayer}
                                onEdit={handleEditLayer}
                                onDuplicate={handleDuplicateLayer}
                                onDelete={handleDeleteLayer}
                                onShowStyleEditor={handleShowStyleEditor}
                                onZoomToLayer={handleZoomToLayer}
                              />
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="flex-1 mt-2">
              <LayerStats
                layers={displayLayers}
                groups={displayGroups}
                selectedLayerId={selectedLayerId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Open Button - Only show when panel is closed */}
      {!isExpanded && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={togglePanel}
              className={cn(
                'absolute z-5 bg-card/95 backdrop-blur-sm border border-border/50 hover:bg-muted/50',
                'w-8 h-16 flex items-center rounded-r-lg shadow-md',
                className
              )}
              style={{
                top: '50%',
                left: 0,
                transform: 'translateY(-50%) translateX(-21px)',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                transition: 'transform 300ms ease-in-out',
                paddingLeft: '12px'
              }}
            >
              <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Open layers panel</p>
          </TooltipContent>
        </Tooltip>
      )}
    </>
  )
}