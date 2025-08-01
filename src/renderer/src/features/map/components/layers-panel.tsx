import React, { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, Layers } from 'lucide-react'
import { useMapStore } from '@/stores/map-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface LayersPanelProps {
  className?: string
}

interface LayerInfo {
  id: string
  name: string
  type: 'raster' | 'vector'
  visible: boolean
  source: string
}

export const LayersPanel: React.FC<LayersPanelProps> = ({ className }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const mapInstance = useMapStore((state) => state.mapInstance)
  const isMapReady = useMapStore((state) => state.isMapReadyForOperations)

  // Update layers list when map changes
  useEffect(() => {
    if (!mapInstance || !isMapReady) {
      setLayers([])
      return
    }

    const updateLayers = () => {
      try {
        const style = mapInstance.getStyle()
        const layerInfos: LayerInfo[] = []

        style.layers.forEach((layer) => {
          // Skip base map layer
          if (layer.id === 'osm-raster-layer') return

          // Determine layer type and properties
          const isRaster = layer.type === 'raster'
          const isVector = ['circle', 'line', 'fill', 'symbol'].includes(layer.type)
          
          if (isRaster || isVector) {
            const layerSource = 'source' in layer ? layer.source : ''
            const layerName = layer.id.replace(/-layer$/, '').replace(/-point$/, '').replace(/-line$/, '').replace(/-fill$/, '')
            
            // Check if we already have this layer (to avoid duplicates from multi-part vector layers)
            const existingLayer = layerInfos.find(l => l.source === layerSource && l.name === layerName)
            if (!existingLayer) {
              layerInfos.push({
                id: layer.id,
                name: layerName,
                type: isRaster ? 'raster' : 'vector',
                visible: mapInstance.getLayoutProperty(layer.id, 'visibility') !== 'none',
                source: layerSource
              })
            }
          }
        })

        setLayers(layerInfos)
      } catch (error) {
        console.error('[LayersPanel] Error updating layers:', error)
      }
    }

    // Initial update
    updateLayers()

    // Listen for style changes
    mapInstance.on('styledata', updateLayers)
    mapInstance.on('sourcedata', updateLayers)

    return () => {
      mapInstance.off('styledata', updateLayers)
      mapInstance.off('sourcedata', updateLayers)
    }
  }, [mapInstance, isMapReady])

  const toggleLayerVisibility = (layerId: string, sourceId: string) => {
    if (!mapInstance) return

    try {
      const style = mapInstance.getStyle()
      const relatedLayers = style.layers.filter(layer => 
        'source' in layer && layer.source === sourceId
      )

      relatedLayers.forEach(layer => {
        const currentVisibility = mapInstance.getLayoutProperty(layer.id, 'visibility')
        const newVisibility = currentVisibility === 'none' ? 'visible' : 'none'
        mapInstance.setLayoutProperty(layer.id, 'visibility', newVisibility)
      })

      // Update local state
      setLayers(prevLayers =>
        prevLayers.map(layer =>
          layer.id === layerId
            ? { ...layer, visible: !layer.visible }
            : layer
        )
      )
    } catch (error) {
      console.error('[LayersPanel] Error toggling layer visibility:', error)
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
          'absolute left-0 bg-card/95 backdrop-blur-sm border-r border-border/50 z-20 rounded-r-lg w-64',
          className
        )}
        style={{
          transform: isExpanded ? 'translateX(0)' : 'translateX(-256px)',
          top: '15%',
          height: '70%',
          maxHeight: '70%',
          transition: 'transform 300ms ease-in-out'
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Layers</span>
            </div>
          </div>

          {/* Layers List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {layers.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2 text-center">
                  No layers loaded
                </div>
              ) : (
                layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleLayerVisibility(layer.id, layer.source)}
                  >
                    {/* Visibility toggle */}
                    <div
                      className={cn(
                        'w-3 h-3 rounded border-2 transition-colors',
                        layer.visible
                          ? 'bg-primary border-primary'
                          : 'bg-transparent border-muted-foreground/50'
                      )}
                    />
                    
                    {/* Layer info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">
                        {layer.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {layer.type}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={togglePanel}
        className={cn(
          'absolute z-5 bg-card/95 backdrop-blur-sm border border-border/50 hover:bg-muted/50',
          'w-8 h-16 flex items-center rounded-r-lg shadow-md',
          isExpanded ? 'justify-end pr-0' : 'justify-end pr-0',
          className
        )}
        style={{
          top: '50%',
          left: 0,
          transform: isExpanded ? 'translateY(-50%) translateX(235px)' : 'translateY(-50%) translateX(-21px)',
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          transition: 'transform 300ms ease-in-out'
        }}
      >
        {isExpanded ? (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </>
  )
}