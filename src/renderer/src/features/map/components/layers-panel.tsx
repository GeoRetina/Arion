import React, { useState, useEffect } from 'react'
import { ChevronRight, Layers, PanelLeftClose } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { useLayerStore, useSelectedLayer } from '@/stores/layer-store'
import { layerSyncService } from '@/services/layer-sync-service'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LayerItem } from './layer-item'
import { LayerGroup } from './layer-group'
import { LayerSearch } from './layer-search'
import { LayerStats } from './layer-stats'
import type { LayerSearchCriteria } from '../../../../../shared/types/layer-types'

interface LayersPanelProps {
  className?: string
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ className }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'layers' | 'stats'>('layers')
  const [searchCriteria, setSearchCriteria] = useState<LayerSearchCriteria>({})
  
  // Map and Layer Store
  const mapInstance = useMapStore((state) => state.mapInstance)
  const isMapReady = useMapStore((state) => state.isMapReadyForOperations)
  const { 
    layers, 
    groups, 
    selectedLayerId,
    searchResults,
    selectLayer,
    setLayerVisibility,
    duplicateLayer,
    removeLayer,
    updateGroup,
    searchLayers,
    clearSearch
  } = useLayerStore()
  const selectedLayer = useSelectedLayer()

  // Initialize layer sync service when map is ready
  useEffect(() => {
    if (mapInstance && isMapReady) {
      layerSyncService.initialize(mapInstance)
      console.log('[LayersPanel] Layer sync service initialized')
      
      return () => {
        layerSyncService.destroy()
      }
    }
  }, [mapInstance, isMapReady])

  // Get display layers based on search results
  const displayLayers = searchResults?.layers || Array.from(layers.values())
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
      const newLayerId = await duplicateLayer(layerId)
      console.log('[LayersPanel] Duplicated layer:', layerId, '→', newLayerId)
    } catch (error) {
      console.error('[LayersPanel] Failed to duplicate layer:', error)
    }
  }

  const handleDeleteLayer = async (layerId: string) => {
    try {
      await removeLayer(layerId)
      console.log('[LayersPanel] Deleted layer:', layerId)
    } catch (error) {
      console.error('[LayersPanel] Failed to delete layer:', error)
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

  const handleSearchChange = async (criteria: LayerSearchCriteria) => {
    setSearchCriteria(criteria)
    if (Object.keys(criteria).length === 0) {
      clearSearch()
    } else {
      await searchLayers(criteria)
    }
  }

  const handleClearSearch = () => {
    setSearchCriteria({})
    clearSearch()
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
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={togglePanel}
                title="Close layers panel"
              >
                <PanelLeftClose className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-border/50">
            <LayerSearch
              searchCriteria={searchCriteria}
              onSearchChange={handleSearchChange}
              onClearSearch={handleClearSearch}
            />
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
                        {searchResults ? 'No layers match your search' : 'No layers loaded'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {!searchResults && 'Import data or use tools to create layers'}
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
          title="Open layers panel"
        >
          <ChevronRight className="h-5 w-5 text-muted-foreground ml-2" />
        </button>
      )}
    </>
  )
}